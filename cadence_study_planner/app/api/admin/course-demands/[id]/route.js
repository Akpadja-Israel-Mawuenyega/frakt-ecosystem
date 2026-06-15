import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import CourseDemand, { COHORT_OPTIONS } from "@/models/CourseDemand";
import { DAYS, TIME_SLOTS } from "@/lib/scheduler/geneticScheduler";
import { logEvent } from "@/lib/audit/logEvent";

/**
 * ───────────────────────────── ADMIN COURSE DEMAND ITEM API ─────────────────────────────
 *
 * Per-record management for a single CourseDemand.
 */

// A course can't need more weekly sessions than the week has slots for.
const MAX_WEEKLY_SLOTS = DAYS.length * TIME_SLOTS.length;

const UPDATABLE_FIELDS = ["courseCode", "courseName", "cohort", "lecturer", "weeklySlotsRequired"];

/**
 * PATCH /api/admin/course-demands/[id]
 *
 * Updates one or more fields of a course demand.
 *
 * @body {string} [courseCode] - Short course code (e.g. "CS401").
 * @body {string} [courseName] - Full course name.
 * @body {string} [cohort] - One of COHORT_OPTIONS.
 * @body {string} [lecturer] - Lecturer's full name.
 * @body {number} [weeklySlotsRequired] - Sessions needed per week (1-MAX_WEEKLY_SLOTS).
 */
export async function PATCH(request, { params }) {
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

    const { id } = await params;
    const body = await request.json();

    const existing = await CourseDemand.findById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Course demand not found." },
        { status: 404 }
      );
    }

    if (body.cohort !== undefined && !COHORT_OPTIONS.includes(body.cohort)) {
      return NextResponse.json(
        { success: false, message: `Cohort must be one of: ${COHORT_OPTIONS.join(", ")}.` },
        { status: 400 }
      );
    }

    if (body.weeklySlotsRequired !== undefined) {
      const slots = Number(body.weeklySlotsRequired);
      if (!Number.isInteger(slots) || slots < 1 || slots > MAX_WEEKLY_SLOTS) {
        return NextResponse.json(
          { success: false, message: `Weekly slots required must be a whole number between 1 and ${MAX_WEEKLY_SLOTS}.` },
          { status: 400 }
        );
      }
    }

    for (const field of UPDATABLE_FIELDS) {
      if (body[field] === undefined) continue;

      if (field === "courseCode") {
        existing.courseCode = String(body.courseCode).trim().toUpperCase();
      } else if (field === "courseName" || field === "lecturer") {
        existing[field] = String(body[field]).trim();
      } else if (field === "weeklySlotsRequired") {
        existing.weeklySlotsRequired = Number(body.weeklySlotsRequired);
      } else {
        existing[field] = body[field];
      }
    }

    await existing.save();

    await logEvent({
      userId: session.user.id,
      action: "COURSE_DEMAND_UPDATED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, message: "Course demand updated.", data: existing },
      { status: 200 }
    );
  } catch (error) {
    console.error("Course Demand PATCH Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update course demand.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/course-demands/[id]
 *
 * Removes a course demand.
 */
export async function DELETE(request, { params }) {
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

    const { id } = await params;

    const existing = await CourseDemand.findById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Course demand not found." },
        { status: 404 }
      );
    }

    await existing.deleteOne();

    await logEvent({
      userId: session.user.id,
      action: "COURSE_DEMAND_DELETED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, message: "Course demand deleted." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Course Demand DELETE Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete course demand.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
