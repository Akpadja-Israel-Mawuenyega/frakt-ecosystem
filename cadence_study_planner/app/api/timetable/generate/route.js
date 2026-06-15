import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import CourseDemand from '@/models/CourseDemand';
import Timetable from '@/models/Timetable';
import { runGeneticScheduler } from '@/lib/scheduler/geneticScheduler';
import { logEvent } from '@/lib/audit/logEvent';

// ──────────────────────────── ROUTE HANDLER ───────────────────────────────

/**
 * POST /api/timetable/compile
 *
 * Runs the genetic-algorithm scheduler over all course demands, then upserts
 * the result into the Timetable collection for the current academic year and
 * semester.
 *
 * @access Admin only (verified via session).
 * @returns {NextResponse} JSON with success status and the saved timetable document.
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

    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, message: "Forbidden: Admin authorization required." },
        { status: 403 }
      );
    }

    const demands = await CourseDemand.find({});
    if (!demands || demands.length === 0) {
      return NextResponse.json(
        { success: false, message: "No course demands found." },
        { status: 400 }
      );
    }

    const solvedScheduleMatrix = runGeneticScheduler(demands);

    const academicYear = process.env.ACADEMIC_YEAR ?? "2025/2026";
    const semester = Number(process.env.SEMESTER ?? 2);

    const currentTimetable = await Timetable.findOneAndUpdate(
      { academicYear, semester },
      { scheduleMatrix: solvedScheduleMatrix },
      { upsert: true, returnDocument: 'after' }
    );

    await logEvent({
      userId: session.user.id,
      action: "TIMETABLE_GENERATED",
      request,
      statusCode: 200,
    });

    return NextResponse.json({
      success: true,
      message: "Timetable generated successfully.",
      data: currentTimetable
    }, { status: 200 });

  } catch (error) {
    console.error("🚨 SCHEDULER EXCEPTION:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}