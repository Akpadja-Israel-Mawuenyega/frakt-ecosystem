import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import CourseDemand, { COHORT_OPTIONS } from "@/models/CourseDemand";
import { DAYS, TIME_SLOTS } from "@/lib/scheduler/geneticScheduler";
import { logEvent } from "@/lib/audit/logEvent";

/**
 * ───────────────────────────── ADMIN COURSE DEMAND API ─────────────────────────────
 *
 * Lets admins manage the CourseDemand records that feed the genetic
 * scheduler — replacing manually-inserted/hardcoded data with a normal
 * CRUD-managed collection.
 */

// A course can't need more weekly sessions than the week has slots for.
const MAX_WEEKLY_SLOTS = DAYS.length * TIME_SLOTS.length;

const sortDemands = { cohort: 1, courseCode: 1 };

/**
 * GET /api/admin/course-demands
 *
 * Lists all course demands, alongside the valid cohort codes so the admin
 * UI's dropdown stays in sync with the schema.
 */
export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Forbidden." },
        { status: 403 }
      );
    }

    const demands = await CourseDemand.find({}).sort(sortDemands);

    return NextResponse.json(
      { success: true, data: demands, cohortOptions: COHORT_OPTIONS },
      { status: 200 }
    );
  } catch (error) {
    console.error("Course Demand GET Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch course demands.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/course-demands
 *
 * Creates a new course demand.
 *
 * @body {string} courseCode - Short course code (e.g. "CS401").
 * @body {string} courseName - Full course name.
 * @body {string} cohort - One of COHORT_OPTIONS.
 * @body {string} lecturer - Lecturer's full name.
 * @body {number} [weeklySlotsRequired=1] - Sessions needed per week (1-MAX_WEEKLY_SLOTS).
 */
export async function POST(request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Forbidden." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { courseCode, courseName, cohort, lecturer, weeklySlotsRequired } = body;

    if (!courseCode || !courseName || !cohort || !lecturer) {
      return NextResponse.json(
        { success: false, message: "Course code, name, cohort and lecturer are required." },
        { status: 400 }
      );
    }

    if (!COHORT_OPTIONS.includes(cohort)) {
      return NextResponse.json(
        { success: false, message: `Cohort must be one of: ${COHORT_OPTIONS.join(", ")}.` },
        { status: 400 }
      );
    }

    const slots = Number(weeklySlotsRequired ?? 1);
    if (!Number.isInteger(slots) || slots < 1 || slots > MAX_WEEKLY_SLOTS) {
      return NextResponse.json(
        { success: false, message: `Weekly slots required must be a whole number between 1 and ${MAX_WEEKLY_SLOTS}.` },
        { status: 400 }
      );
    }

    const normalizedCode = courseCode.trim().toUpperCase();

    const duplicate = await CourseDemand.findOne({ courseCode: normalizedCode, cohort });
    if (duplicate) {
      return NextResponse.json(
        { success: false, message: `${normalizedCode} already exists for ${cohort}.` },
        { status: 409 }
      );
    }

    const demand = await CourseDemand.create({
      courseCode: normalizedCode,
      courseName: courseName.trim(),
      cohort,
      lecturer: lecturer.trim(),
      weeklySlotsRequired: slots,
    });

    await logEvent({
      userId: session.user.id,
      action: "COURSE_DEMAND_CREATED",
      request,
      statusCode: 201,
    });

    return NextResponse.json(
      { success: true, message: "Course demand created.", data: demand },
      { status: 201 }
    );
  } catch (error) {
    console.error("Course Demand POST Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create course demand.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
