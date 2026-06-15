import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import AuditLog from "@/models/AuditLog";
import { generateChart, generatePredictiveChart } from "@/lib/frakt/client";

/**
 * ───────────────────────────── ADMIN TRAFFIC ANALYTICS API ─────────────────────────────
 *
 * GET /api/admin/analytics
 *
 * Aggregates Cadence's native AuditLog into a 14-day daily traffic series,
 * rendered as two Frakt charts:
 *
 * - Daily traffic (event count/day) -> Frakt /v1/generate
 * - Traffic forecast -> Frakt /v1/generate-predictive
 *
 * Also surfaces a top-actions breakdown and basic error-rate stats.
 * Admin-only; mirrors the pattern used by /api/progress.
 */

const DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TOP_ACTIONS_LIMIT = 5;

/**
 * Buckets audit log entries into `DAYS` daily buckets (oldest first),
 * counting total events and error/critical events per day.
 */
function buildDailyBuckets(logs) {
  const now = new Date();
  const seriesStart = new Date(now.getTime() - (DAYS - 1) * MS_PER_DAY);

  const buckets = Array.from({ length: DAYS }, (_, i) => ({
    date: new Date(seriesStart.getTime() + i * MS_PER_DAY),
    count: 0,
    errorCount: 0,
  }));

  for (const log of logs) {
    const date = new Date(log.createdAt);
    const daysAgo = Math.floor((now - date) / MS_PER_DAY);
    const bucketIndex = DAYS - 1 - daysAgo;

    if (bucketIndex < 0 || bucketIndex >= DAYS) continue;

    buckets[bucketIndex].count += 1;

    if (log.severity === "ERROR" || log.severity === "CRITICAL") {
      buckets[bucketIndex].errorCount += 1;
    }
  }

  return buckets;
}

/**
 * Returns the most frequent `action` values, descending by count.
 */
function topActions(logs, limit) {
  const counts = new Map();

  for (const log of logs) {
    counts.set(log.action, (counts.get(log.action) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([action, count]) => ({ action, count }));
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

    if (session.user.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Forbidden." },
        { status: 403 }
      );
    }

    const seriesStart = new Date(Date.now() - (DAYS - 1) * MS_PER_DAY);
    seriesStart.setHours(0, 0, 0, 0);

    const logs = await AuditLog.find({ createdAt: { $gte: seriesStart } });

    const buckets = buildDailyBuckets(logs);

    const dateLabels = buckets.map((b) =>
      b.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
    const dayIndexLabels = buckets.map((_, i) => String(i + 1));

    const trafficPoints = buckets.map((b, i) => [i, b.count]);
    const errorPoints = buckets.map((b, i) => [i, b.errorCount]);

    const [trafficChart, forecastChart] = await Promise.all([
      generateChart({
        points: trafficPoints,
        labels: dateLabels,
        title: "Daily Traffic (events/day)",
        strokeColor: "#2ecc71",
      }),
      generatePredictiveChart({
        points: trafficPoints,
        labels: dayIndexLabels,
        title: "Traffic Forecast",
        strokeColor: "#3498db",
      }),
    ]);

    const totalEvents = logs.length;
    const totalErrors = logs.filter(
      (l) => l.severity === "ERROR" || l.severity === "CRITICAL"
    ).length;
    const uniqueUsers = new Set(
      logs.filter((l) => l.userId).map((l) => String(l.userId))
    ).size;

    return NextResponse.json(
      {
        success: true,
        data: {
          days: buckets.map((b, i) => ({
            label: dateLabels[i],
            count: b.count,
            errorCount: b.errorCount,
          })),
          totalEvents,
          totalErrors,
          uniqueUsers,
          topActions: topActions(logs, TOP_ACTIONS_LIMIT),
          trafficChart: {
            configured: trafficChart.configured,
            svg: trafficChart.svg || null,
            error: trafficChart.error || null,
            status: trafficChart.status || null,
          },
          forecastChart: {
            configured: forecastChart.configured,
            svg: forecastChart.svg || null,
            error: forecastChart.error || null,
            status: forecastChart.status || null,
            aiModel: forecastChart.aiModel || null,
            confidence: forecastChart.confidence ?? null,
            isGrowth: forecastChart.isGrowth ?? null,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin Analytics Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load traffic analytics.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
