import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Timetable from '@/models/Timetable';
import StudentProfile from '@/models/StudentProfile';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Races an async operation against a timer.
 * Rejects with a clear timeout error if the operation takes too long.
 *
 * @param {Promise} promise - The async operation to race.
 * @param {number} ms - Timeout in milliseconds.
 * @returns {Promise} Resolves with the operation result, or rejects on timeout.
 */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms)
    )
  ]);

/**
 * Fetches academic resources from the internal OpenAlex route for a list
 * of course names. Runs all queries in parallel and merges the results.
 * Silently skips any course that fails — partial results are acceptable.
 *
 * @param {string[]} courseNames - List of course names from the student's profile.
 * @returns {Promise<Array<{title: string, type: string, contentData: string}>>}
 */
const fetchScholarResources = async (courseNames) => {
  if (!courseNames?.length) return [];

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const results = await Promise.all(
    courseNames.map(async (course) => {
      try {
        const res = await fetch(
          `${baseUrl}/api/scholar/search?q=${encodeURIComponent(course)}&limit=3`
        );
        if (!res.ok) return [];
        const { data } = await res.json();
        return data ?? [];
      } catch {
        // Silently skip failed course queries — partial results are fine
        return [];
      }
    })
  );

  // Flatten the per-course arrays into a single resource list
  return results.flat();
};

/**
 * Builds a JSON schema pre-populated with the student's actual free slots.
 * The AI's only job is to fill in task/resource/goal — days and times are locked.
 *
 * @param {Object} studyGaps - { [day]: string[] } map of free time slots per day.
 * @returns {string} Pretty-printed JSON string to inject into the user prompt.
 */
const buildStudyPlanSchema = (studyGaps) => {
  const weeklyPlan = {};

  for (const [day, slots] of Object.entries(studyGaps)) {
    if (slots.length === 0) continue; // Skip fully booked days

    weeklyPlan[day] = slots.map(slot => ({
      timeSlot: slot, // Real value — not a placeholder
      task: "",
      resource: "",
      goal: ""
    }));
  }

  return JSON.stringify({ weeklyPlan }, null, 2);
};

/**
 * POST /api/ai/study-planner
 *
 * Generates a personalised weekly study roadmap for a student by:
 *  1. Identifying their free slots from the master timetable.
 *  2. Merging manually uploaded resources with OpenAlex academic papers.
 *  3. Calling the OpenAI API to fill a pre-structured plan with tasks.
 *
 * Resource priority: manual uploads are listed first so the AI treats
 * them as higher-priority context than the auto-fetched papers.
 *
 * @body {string} studentId - The unique ID of the student.
 * @returns {NextResponse} JSON containing the AI-generated study plan.
 */
export async function POST(request) {
  try {
    await connectDB();

    const { studentId } = await request.json();
    if (!studentId) {
      return NextResponse.json(
        { success: false, message: "Missing studentId parameter." },
        { status: 400 }
      );
    }

    // 1. Fetch the student profile (includes cohort and learning resources)
    const student = await StudentProfile.findOne({ studentId });
    if (!student) {
      return NextResponse.json(
        { success: false, message: "Student profile not found." },
        { status: 404 }
      );
    }

    // 2. Fetch the master timetable — source of truth for slot availability
    const academicYear = process.env.ACADEMIC_YEAR ?? "2025/2026";
    const semester = Number(process.env.SEMESTER ?? 2);

    const timetable = await Timetable.findOne({ academicYear, semester });
    if (!timetable) {
      return NextResponse.json(
        { success: false, message: "Active timetable not found." },
        { status: 404 }
      );
    }

    // 3. Extract free slots for this cohort.
    //    A slot is free if none of its assignments belong to this student's cohort.
    //    Uses Object.entries() because scheduleMatrix is a plain object, not a Map.
    const matrix = timetable.scheduleMatrix;
    const studyGaps = {};

    for (const [day, slots] of Object.entries(matrix)) {
      studyGaps[day] = slots
        .filter(slot => !slot.assignments.some(a => a.assignedClass === student.cohort))
        .map(slot => slot.timeSlot);
    }

    // 4. Fetch OpenAlex resources in parallel with the rest of the setup.
    //    Uses the student's enrolled courses as search terms.
    //    Falls back to an empty array if OpenAlex is unreachable.
    const scholarResources = await fetchScholarResources(student.enrolledCourses);

    // 5. Merge resources — manual uploads take priority over auto-fetched papers.
    //    The AI will encounter student-supplied materials first in the context window.
    const manualResources = student.learningResources ?? [];
    const allResources = [...manualResources, ...scholarResources];

    // 6. Serialize all resources into a readable string for the AI context window.
    //    Labels distinguish source type so the AI can weight them appropriately.
    const resourceContext = allResources.length > 0
      ? allResources
          .map(res => `[${res.type}] ${res.title} — ${res.contentData}`)
          .join('\n')
      : "No resources available. Focus on core curriculum syllabus guidelines.";

    // 7. Build the schema with real days/slots locked in — AI only fills the blank fields
    const studyPlanSchema = buildStudyPlanSchema(studyGaps);

    // 8. Construct prompts — the pre-filled schema prevents the AI from
    //    hallucinating days or time slots that don't exist in the timetable
    const systemPrompt = `
      You are an expert AI Study Planner for engineering and computer science students.
      Your task is to generate a structured, actionable weekly study plan using ONLY the
      provided free time windows.

      CONSTRAINTS:
      - Learning resources to draw from (manually uploaded resources listed first,
        followed by auto-fetched academic papers — prioritize manual resources):
        ${resourceContext}

      INSTRUCTIONS:
      1. You will be given a JSON schema with days and time slots already filled in.
         Do NOT change, add, or remove any day or timeSlot value.
      2. Fill in ONLY the "task", "resource", and "goal" fields for each slot.
      3. Spread tasks logically across the week based on topic complexity.
      4. Prefer manual resources where available; use academic papers to supplement.
      5. Return ONLY valid JSON with no markdown formatting or extra text.
    `;

    const userPrompt = `
      Generate a weekly study roadmap for ${student.name} (${student.cohort}).
      Fill in the task, resource, and goal fields in this schema:
      ${studyPlanSchema}
    `;

    // 9. Call OpenAI with a 20s timeout — AI completions can be slow,
    //    but an open-ended wait would block the route indefinitely on a hang.
    let response;
    try {
      response = await withTimeout(
        openai.chat.completions.create({
          model: "gpt-4-turbo",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2, // Low = more deterministic scheduling logic
        }),
        20000
      );
    } catch (err) {
      const isTimeout = err.message.includes("timed out");
      return NextResponse.json(
        {
          success: false,
          message: isTimeout
            ? "AI request timed out. Please try again."
            : "AI service error. Please try again."
        },
        { status: 504 }
      );
    }

    // 10. Parse the AI response — JSON mode helps, but we still guard defensively
    let parsedPlan;
    try {
      parsedPlan = JSON.parse(response.choices[0].message.content);
    } catch {
      return NextResponse.json(
        { success: false, message: "AI returned malformed JSON. Please retry." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Study roadmap compiled successfully.",
      data: parsedPlan
    }, { status: 200 });

  } catch (error) {
    console.error("AI Planner Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}