"use client";

import { useEffect, useState } from "react";
import { Activity, Users, AlertCircle, Gauge, Loader2, RefreshCw } from "lucide-react";

import ChartCard from "@/app/components/dashboard/ChartCard";
import Card from "@/app/components/ui/Card";

// Frakt chart calls are capped at 8s each (see lib/frakt/client.js), so 20s
// gives the route enough headroom for the audit-log query plus both chart
// requests before we tell the admin something's actually wrong.
const ANALYTICS_TIMEOUT_MS = 20000;

/**
 * Formats an action constant (e.g. "STUDY_SESSION_CREATED") as readable
 * title case ("Study Session Created").
 */
const formatAction = (action) =>
  action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * ───────────────────────────── ADMIN ANALYTICS PAGE ─────────────────────────────
 *
 * /admin/analytics
 *
 * Aggregates Cadence's native AuditLog into a 14-day traffic series and
 * renders it via Frakt — a daily history chart plus an AI-forecast chart,
 * alongside top-action and error-rate stats. Admin-only.
 */
export default function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYTICS_TIMEOUT_MS);

    setLoading(true);
    setError("");

    const fetchAnalytics = async () => {
      try {
        const response = await fetch("/api/admin/analytics", {
          signal: controller.signal,
        });
        const json = await response.json();

        if (json.success) {
          setData(json.data);
        } else {
          setError(json.message || "Failed to load traffic analytics.");
        }
      } catch (err) {
        if (err.name === "AbortError") {
          setError(
            "This is taking longer than expected. Please try again in a moment."
          );
        } else {
          console.error(err);
          setError("Something went wrong loading traffic analytics.");
        }
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    fetchAnalytics();

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [retryKey]);

  if (loading) {
    return (
      <main className="p-6 md:p-10">
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
          <p className="text-sm">Loading traffic analytics...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="p-6 md:p-10">
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 text-sm max-w-lg animate-fade-in">
          <p>{error || "Failed to load traffic analytics."}</p>
          <button
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300 hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        </div>
      </main>
    );
  }

  const { totalEvents, totalErrors, uniqueUsers, topActions, trafficChart, forecastChart } =
    data;

  const errorRate =
    totalEvents === 0 ? 0 : Math.round((totalErrors / totalEvents) * 100);

  const maxActionCount = topActions.reduce(
    (max, { count }) => Math.max(max, count),
    0
  );

  return (
    <main className="p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Traffic Analytics
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Platform activity over the last 14 days, derived from
              Cadence&apos;s audit log.
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <Card className="p-6 mb-6 animate-fade-in-up">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-2">
                <Activity className="w-4 h-4 text-brand-600 dark:text-brand-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {totalEvents}
              </p>
              <p className="text-xs text-slate-400 mt-1">Events (14d)</p>
            </div>

            <div>
              <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center mx-auto mb-2">
                <Users className="w-4 h-4 text-sky-600 dark:text-sky-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {uniqueUsers}
              </p>
              <p className="text-xs text-slate-400 mt-1">Active users</p>
            </div>

            <div>
              <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {totalErrors}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Errors / critical
              </p>
            </div>

            <div>
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-2">
                <Gauge className="w-4 h-4 text-violet-600 dark:text-violet-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {forecastChart.confidence != null
                  ? `${Math.round(forecastChart.confidence * 100)}%`
                  : `${errorRate}%`}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {forecastChart.confidence != null
                  ? "Forecast confidence"
                  : "Error rate"}
              </p>
            </div>
          </div>
        </Card>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="animate-fade-in-up animation-delay-100">
            <ChartCard
              title="Daily Traffic"
              subtitle="Audit log events per day"
              chart={trafficChart}
            />
          </div>

          <div className="animate-fade-in-up animation-delay-200">
            <ChartCard
              title="Traffic Forecast"
              subtitle={
                forecastChart.aiModel
                  ? `Forecast model: ${forecastChart.aiModel}`
                  : "Projected activity, with forecast"
              }
              chart={forecastChart}
            />
          </div>
        </div>

        {/* Top actions */}
        <Card className="p-6 animate-fade-in-up animation-delay-300">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Most Common Actions
          </h3>

          {topActions.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              No activity recorded in the last 14 days.
            </p>
          ) : (
            <ul className="space-y-3">
              {topActions.map(({ action, count }, i) => (
                <li key={action} className="flex items-center gap-3 text-sm">
                  <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-brand-600 to-fuchsia-600 text-white text-xs font-semibold shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 w-48 shrink-0 truncate">
                    {formatAction(action)}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500"
                      style={{
                        width: `${
                          maxActionCount === 0
                            ? 0
                            : (count / maxActionCount) * 100
                        }%`,
                      }}
                    />
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 w-10 text-right shrink-0">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
