import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import StudySession from "@/models/StudySession";
import { generateChart, generatePredictiveChart } from "@/lib/frakt/client";

/**
 * ───────────────────────────── PROGRESS ANALYTICS API ─────────────────────────────
 *
 * GET /api/progress
 *
 * Builds a 6-week activity/velocity time series from the student's study
 * sessions, renders it as two SVG charts via Frakt, and derives a
 * "preparedness" verdict from Frakt's predictive trend analysis.
 *
 * - Activity (minutes studied/week) -> Frakt /v1/generate
 * - Velocity (sessions completed/week) -> Frakt /v1/generate-predictive,
 *   whose forecast direction/confidence feeds the preparedness verdict.
 */

const WEEKS = 6;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MIN_COMPLETED_FOR_VERDICT = 5;
const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Buckets completed sessions from the last `WEEKS` weeks (oldest first).
 * Sessions scheduled in the future or not yet completed are excluded —
 * this series reflects actual study activity, not the plan.
 */
function buildWeeklyBuckets(sessions) {
  const now = new Date();
  const seriesStart = new Date(now.getTime() - (WEEKS - 1) * MS_PER_WEEK);

  const buckets = Array.from({ length: WEEKS }, (_, i) => ({
    start: new Date(seriesStart.getTime() + i * MS_PER_WEEK),
    activityMinutes: 0,
    completedSessions: 0,
  }));

  for (const studySession of sessions) {
    if (!studySession.completed) continue;

    const date = new Date(studySession.date);
    if (date > now) continue;

    const weeksAgo = Math.floor((now - date) / MS_PER_WEEK);
    const bucketIndex = WEEKS - 1 - weeksAgo;

    if (bucketIndex < 0 || bucketIndex >= WEEKS) continue;

    buckets[bucketIndex].activityMinutes += studySession.duration || 0;
    buckets[bucketIndex].completedSessions += 1;
  }

  return buckets;
}

/**
 * Derives a plain-language preparedness verdict from completion rate and
 * Frakt's velocity forecast (direction + confidence).
 */
function computePreparedness({
  completedCount,
  completionRate,
  velocityAvailable,
  isGrowth,
  confidence,
}) {
  if (completedCount < MIN_COMPLETED_FOR_VERDICT) {
    return {
      verdict: "Not Enough Data",
      summary:
        "Complete a few more study sessions to unlock a preparedness forecast based on your activity trend.",
    };
  }

  const confident = velocityAvailable && confidence >= CONFIDENCE_THRESHOLD;
  const trendingUp = confident && isGrowth;
  const trendingDown = confident && !isGrowth;

  if (completionRate >= 70 && !trendingDown) {
    return {
      verdict: "On Track",
      summary:
        "Your completion rate is strong and your study velocity is holding steady or improving — preparedness looks solid.",
    };
  }

  if (trendingUp) {
    return {
      verdict: "Building Momentum",
      summary:
        "Your weekly study velocity is trending upward. Keep this momentum going to close any remaining gaps.",
    };
  }

  if (completionRate < 40 || trendingDown) {
    return {
      verdict: "At Risk",
      summary:
        "Completed sessions are falling behind plan and your velocity isn't improving. Consider lightening the schedule or prioritizing overdue topics.",
    };
  }

  return {
    verdict: "Needs Attention",
    summary:
      "Your study activity is inconsistent week to week. A steadier rhythm would meaningfully improve your preparedness outlook.",
  };
}

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

    const sessions = await StudySession.find({ userId: session.user.id });

    const buckets = buildWeeklyBuckets(sessions);

    const dateLabels = buckets.map((b) =>
      b.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
    const weekIndexLabels = buckets.map((_, i) => String(i + 1));

    const activityPoints = buckets.map((b, i) => [i, b.activityMinutes]);
    const velocityPoints = buckets.map((b, i) => [i, b.completedSessions]);

    const [activityChart, velocityChart] = await Promise.all([
      generateChart({
        points: activityPoints,
        labels: dateLabels,
        title: "Weekly Study Activity (minutes)",
        strokeColor: "#2ecc71",
      }),
      generatePredictiveChart({
        points: velocityPoints,
        labels: weekIndexLabels,
        title: "Weekly Velocity (sessions completed)",
        strokeColor: "#3498db",
      }),
    ]);

    const totalCount = sessions.length;
    const completedCount = sessions.filter((s) => s.completed).length;
    const completionRate =
      totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    const velocityAvailable = Boolean(
      velocityChart.configured && velocityChart.svg && !velocityChart.error
    );

    const preparedness = computePreparedness({
      completedCount,
      completionRate,
      velocityAvailable,
      isGrowth: velocityChart.isGrowth,
      confidence: velocityChart.confidence,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          weeks: buckets.map((b, i) => ({
            label: dateLabels[i],
            activityMinutes: b.activityMinutes,
            completedSessions: b.completedSessions,
          })),
          completionRate,
          completedCount,
          totalCount,
          activityChart: {
            configured: activityChart.configured,
            svg: activityChart.svg || null,
            error: activityChart.error || null,
            status: activityChart.status || null,
          },
          velocityChart: {
            configured: velocityChart.configured,
            svg: velocityChart.svg || null,
            error: velocityChart.error || null,
            status: velocityChart.status || null,
            aiModel: velocityChart.aiModel || null,
            confidence: velocityChart.confidence ?? null,
            isGrowth: velocityChart.isGrowth ?? null,
          },
          preparedness,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Progress Analytics Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load progress analytics.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
