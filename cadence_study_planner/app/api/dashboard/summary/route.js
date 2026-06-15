import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import StudentProfile from "@/models/StudentProfile";
import StudySession from "@/models/StudySession";

/**
 * ───────────────────────────── DASHBOARD SUMMARY API ─────────────────────────────
 *
 * GET /api/dashboard/summary
 *
 * Aggregates the data shown on the student dashboard: academic profile
 * basics plus planner activity (upcoming/completed sessions, completion
 * rate, planned study time for the next 7 days, and the next session).
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

    const [profile, sessions] = await Promise.all([
      StudentProfile.findOne({ userId: session.user.id }),
      StudySession.find({ userId: session.user.id }),
    ]);

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const totalCount = sessions.length;
    const completedCount = sessions.filter((s) => s.completed).length;
    const upcomingSessions = sessions
      .filter((s) => !s.completed && new Date(s.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const weekMinutes = sessions
      .filter((s) => {
        const date = new Date(s.date);
        return !s.completed && date >= now && date <= weekFromNow;
      })
      .reduce((sum, s) => sum + (s.duration || 0), 0);

    const completionRate =
      totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    const nextSession = upcomingSessions[0]
      ? {
          title: upcomingSessions[0].title,
          courseName: upcomingSessions[0].course?.name || "",
          date: upcomingSessions[0].date,
          duration: upcomingSessions[0].duration,
        }
      : null;

    return NextResponse.json(
      {
        success: true,
        data: {
          cohort: profile?.cohort || "UNASSIGNED",
          enrolledCoursesCount: profile?.enrolledCourses?.length || 0,
          upcomingCount: upcomingSessions.length,
          completedCount,
          totalCount,
          completionRate,
          weekMinutes,
          nextSession,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Dashboard Summary Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load dashboard summary.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
