import { NextResponse } from "next/server";

import OpenAI from "openai";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import StudentProfile from "@/models/StudentProfile";

import StudySession from "@/models/StudySession";

/**
 * ───────────────────────────── OPENAI CLIENT ─────────────────────────────
 *
 * Central AI orchestration client.
 *
 * This powers:
 * - study planning
 * - scheduling intelligence
 * - workload balancing
 * - future recommendation systems
 *
 * Groq exposes an OpenAI-compatible API surface.
 * The official OpenAI SDK can therefore be reused
 * by overriding the baseURL.
 */
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

/**
 * ───────────────────────────── UTILITIES ─────────────────────────────
 */

/**
 * Safely parses JSON returned by the AI.
 *
 * AI responses can occasionally:
 * - contain markdown
 * - contain invalid JSON
 * - contain trailing commas
 *
 * This helper provides a single controlled
 * parsing boundary.
 *
 * @param {string} content
 * @returns {object|null}
 */
const safeJsonParse = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

/**
 * Generates a future date offset from today.
 *
 * Used to distribute generated sessions
 * across upcoming days.
 *
 * @param {number} daysAhead
 * @returns {Date}
 */
const futureDate = (daysAhead = 0) => {
  const date = new Date();

  date.setDate(date.getDate() + daysAhead);

  return date;
};

/**
 * Races an async operation against a timeout.
 *
 * AI providers can occasionally stall due to:
 * - queue congestion
 * - upstream latency
 * - temporary inference overload
 *
 * Rather than allowing the request lifecycle
 * to hang indefinitely, we fail gracefully.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,

    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `AI request timed out after ${ms}ms`
            )
          ),
        ms
      )
    ),
  ]);

/**
 * Sanitizes AI-generated duration values.
 *
 * Prevents malformed or hallucinated durations
 * from entering persistence.
 *
 * Constraints:
 * - minimum: 60 minutes
 * - maximum: 180 minutes
 *
 * @param {number} duration
 * @returns {number}
 */
const normalizeDuration = (duration) => {
  if (typeof duration !== "number") {
    return 90;
  }

  return Math.min(
    180,
    Math.max(60, duration)
  );
};

/**
 * Sanitizes AI-generated priority values.
 *
 * @param {string} priority
 * @returns {"low"|"medium"|"high"}
 */
const normalizePriority = (priority) => {
  const validPriorities = [
    "low",
    "medium",
    "high",
  ];

  return validPriorities.includes(priority)
    ? priority
    : "medium";
};

/**
 * Sanitizes AI-generated day offsets.
 *
 * Prevents the AI from scheduling
 * sessions outside the intended
 * weekly planning window.
 *
 * @param {number} daysAhead
 * @returns {number}
 */
const normalizeDaysAhead = (daysAhead) => {
  if (typeof daysAhead !== "number") {
    return 0;
  }

  return Math.min(
    6,
    Math.max(0, Math.floor(daysAhead))
  );
};

/**
 * Builds a lightweight academic difficulty heuristic.
 *
 * The planner uses this context to prioritize
 * mathematically intensive or technically dense courses.
 *
 * @param {Array} courses
 * @returns {string}
 */
const buildDifficultyHints = (courses = []) => {
  const difficultKeywords = [
    "math",
    "algorithm",
    "data structure",
    "physics",
    "network",
    "database",
    "operating system",
    "compiler",
    "machine learning",
    "ai",
    "calculus",
    "statistics",
    "software engineering",
  ];

  return courses
    .map((course) => {
      const name =
        typeof course === "string"
          ? course
          : course.name || "";

      const lower =
        name.toLowerCase();

      const isTechnical =
        difficultKeywords.some((keyword) =>
          lower.includes(keyword)
        );

      return `${name} → ${
        isTechnical
          ? "High Technical Load"
          : "Standard Load"
      }`;
    })
    .join("\n");
};

/**
 * ───────────────────────────── POST /api/ai/generate-plan ─────────────────────────────
 *
 * Generates AI-powered study sessions and persists them into MongoDB.
 *
 * Responsibilities:
 * - authenticate user
 * - fetch academic context
 * - invoke AI planner
 * - validate structured output
 * - persist generated StudySession documents
 *
 * Architecture:
 *
 * StudentProfile
 *        ↓
 * AI Planning Engine
 *        ↓
 * Structured Session JSON
 *        ↓
 * Validation Layer
 *        ↓
 * StudySession persistence
 *        ↓
 * Dashboard rendering
 */
export async function POST() {
  try {
    /**
     * ───────────────────────── DATABASE ─────────────────────────
     */

    await connectDB();

    /**
     * ───────────────────────── AUTH ─────────────────────────
     */

    const session =
      await getServerSession(
        authOptions
      );

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /**
     * ───────────────────────── STUDENT PROFILE ─────────────────────────
     */

    const student =
      await StudentProfile.findOne({
        userId: session.user.id,
      });

    if (!student) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Student profile not found.",
        },
        {
          status: 404,
        }
      );
    }

    /**
     * ───────────────────────── DUPLICATE PREVENTION ─────────────────────────
     *
     * Prevents accidental spam-generation
     * of study sessions if the user repeatedly
     * presses the planner button.
     *
     * Strategy:
     * - detect AI-generated sessions
     * - only inspect upcoming 7 days
     */

    const existingAiSessions =
      await StudySession.countDocuments({
        userId: session.user.id,

        source: "ai",

        date: {
          $gte: new Date(),
        },
      });

    if (existingAiSessions >= 10) {
      return NextResponse.json(
        {
          success: false,

          message:
            "An AI study plan already exists for this week.",
        },
        {
          status: 409,
        }
      );
    }

    /**
     * ───────────────────────── ACADEMIC CONTEXT ─────────────────────────
     *
     * AI needs:
     * - enrolled courses
     * - student cohort
     * - planner preferences
     */

    const courseContext =
      student.enrolledCourses
        ?.map((course) =>
          typeof course === "string"
            ? course
            : `${course.code}: ${course.name}`
        )
        .join("\n") ||
      "No courses found.";

    /**
     * ───────────────────────── DIFFICULTY HEURISTICS ─────────────────────────
     *
     * Provides lightweight planning hints
     * without hardcoding scheduling logic.
     */

    const difficultyHints =
      buildDifficultyHints(
        student.enrolledCourses
      );

    /**
     * ───────────────────────── AI SYSTEM PROMPT ─────────────────────────
     *
     * IMPORTANT:
     * - AI does NOT control persistence
     * - AI does NOT control IDs
     * - AI only generates planning logic
     */

    const systemPrompt = `
You are an elite academic planning AI.

Your job is to generate realistic,
balanced weekly study sessions
for university students.

RULES:
- Return ONLY valid JSON.
- No markdown.
- No explanations.
- Generate between 5 and 10 sessions.
- Spread sessions across different days.
- Avoid excessive workload concentration.
- Prioritize difficult technical subjects.
- Include revision diversity across the week.
- Avoid duplicate session titles.
- Make titles concise and actionable.

Each session must include:
- courseCode
- courseName
- title
- description
- priority
- duration
- daysAhead

priority values:
- low
- medium
- high

duration values:
- between 60 and 180 minutes

daysAhead:
- integer between 0 and 6
`;

    /**
     * ───────────────────────── AI USER PROMPT ─────────────────────────
     */

    const userPrompt = `
Generate a realistic weekly study plan
for this student.

Student Name:
${student.name}

Cohort:
${student.cohort}

Courses:
${courseContext}

Difficulty Heuristics:
${difficultyHints}

Return JSON in this structure:

{
  "sessions": [
    {
      "courseCode": "",
      "courseName": "",
      "title": "",
      "description": "",
      "priority": "",
      "duration": 120,
      "daysAhead": 0
    }
  ]
}
`;

    /**
     * ───────────────────────── OPENAI REQUEST ─────────────────────────
     *
     * Low temperature improves:
     * - determinism
     * - structural consistency
     * - schedule realism
     */

    const response =
      await withTimeout(
        openai.chat.completions.create({
          model:
            "llama-3.3-70b-versatile",

          temperature: 0.2,

          response_format: {
            type: "json_object",
          },

          messages: [
            {
              role: "system",
              content: systemPrompt,
            },

            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),

        20000
      );

    /**
     * ───────────────────────── AI RESPONSE PARSING ─────────────────────────
     */

    const content =
      response.choices?.[0]?.message
        ?.content;

    const parsed =
      safeJsonParse(content);

    if (
      !parsed ||
      !Array.isArray(parsed.sessions)
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "AI returned malformed planner data.",
        },

        {
          status: 502,
        }
      );
    }

    /**
     * ───────────────────────── SESSION VALIDATION ─────────────────────────
     *
     * Defensive normalization layer.
     *
     * AI output is treated as untrusted input.
     */

    const validatedSessions =
      parsed.sessions
        .filter(
          (session) =>
            session.courseName &&
            session.title
        )

        .slice(0, 10)

        .map((session) => ({
          courseCode:
            session.courseCode ||
            "GENERAL",

          courseName:
            session.courseName,

          title: session.title,

          description:
            session.description ||
            "AI-generated study session.",

          priority:
            normalizePriority(
              session.priority
            ),

          duration:
            normalizeDuration(
              session.duration
            ),

          daysAhead:
            normalizeDaysAhead(
              session.daysAhead
            ),
        }));

    if (
      validatedSessions.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "AI generated unusable study sessions.",
        },

        {
          status: 502,
        }
      );
    }

    /**
     * ───────────────────────── SESSION PERSISTENCE ─────────────────────────
     *
     * Convert AI output into deterministic
     * StudySession database documents.
     */

    const createdSessions =
      await Promise.all(
        validatedSessions.map(
          async (
            generatedSession
          ) => {
            return await StudySession.create(
              {
                userId:
                  session.user.id,

                course: {
                  code:
                    generatedSession.courseCode,

                  name:
                    generatedSession.courseName,
                },

                title:
                  generatedSession.title,

                description:
                  generatedSession.description,

                date: futureDate(
                  generatedSession.daysAhead
                ),

                duration:
                  generatedSession.duration,

                priority:
                  generatedSession.priority,

                completed: false,

                source: "ai",
              }
            );
          }
        )
      );

    /**
     * ───────────────────────── SUCCESS RESPONSE ─────────────────────────
     */

    return NextResponse.json(
      {
        success: true,

        message:
          "AI study plan generated successfully.",

        sessions:
          createdSessions,
      },

      {
        status: 201,
      }
    );
  } catch (error) {
    /**
     * ───────────────────────── ERROR HANDLER ─────────────────────────
     */

    console.error(
      "AI Planner Error:",
      error
    );

    const isTimeout =
      error.message?.includes(
        "timed out"
      );

    return NextResponse.json(
      {
        success: false,

        message: isTimeout
          ? "AI request timed out."
          : "Failed to generate study plan.",

        error: error.message,
      },

      {
        status: isTimeout
          ? 504
          : 500,
      }
    );
  }
}