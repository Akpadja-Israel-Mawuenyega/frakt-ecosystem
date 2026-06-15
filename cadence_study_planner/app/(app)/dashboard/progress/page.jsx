"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  TrendingUp,
  Activity,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  Percent,
  CheckCircle2,
  ListTodo,
  Gauge,
} from "lucide-react";

import ChartCard from "@/app/components/dashboard/ChartCard";
import Card from "@/app/components/ui/Card";
import Badge from "@/app/components/ui/Badge";

/**
 * Badge variant per preparedness verdict, returned by /api/progress.
 */
const VERDICT_VARIANTS = {
  "On Track": "green",
  "Building Momentum": "blue",
  "Needs Attention": "amber",
  "At Risk": "red",
  "Not Enough Data": "slate",
};

/**
 * Icon + accent color per preparedness verdict.
 */
const VERDICT_ICONS = {
  "On Track": { icon: TrendingUp, style: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300" },
  "Building Momentum": { icon: Activity, style: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300" },
  "Needs Attention": {
    icon: AlertTriangle,
    style: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300",
  },
  "At Risk": { icon: AlertOctagon, style: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" },
  "Not Enough Data": {
    icon: HelpCircle,
    style: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
};

/**
 * ───────────────────────────── PROGRESS PAGE ─────────────────────────────
 *
 * /dashboard/progress
 *
 * Shows weekly activity and velocity charts (rendered by Frakt) alongside
 * a preparedness verdict derived from completion rate and Frakt's
 * predictive velocity forecast.
 */
export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await fetch("/api/progress");
        const json = await response.json();

        if (json.success) {
          setData(json.data);
        } else {
          setError(json.message || "Failed to load progress.");
        }
      } catch (err) {
        console.error(err);
        setError("Something went wrong loading your progress.");
      } finally {
        setLoading(false);
      }
    };

    fetchProgress();
  }, []);

  if (loading) {
    return (
      <main className="p-6 md:p-10">
        <p className="text-slate-400 text-sm animate-pulse">
          Loading progress...
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="p-6 md:p-10">
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 text-sm max-w-lg animate-fade-in">
          {error || "Failed to load progress."}
        </div>
      </main>
    );
  }

  const {
    preparedness,
    activityChart,
    velocityChart,
    completionRate,
    completedCount,
    totalCount,
  } = data;

  const verdict =
    VERDICT_ICONS[preparedness.verdict] || VERDICT_ICONS["Not Enough Data"];
  const VerdictIcon = verdict.icon;

  return (
    <main className="p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
            <LineChart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">My Progress</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Your study activity and velocity over the last 6 weeks.
            </p>
          </div>
        </div>

        {/* Preparedness verdict */}
        <Card className="p-6 mb-6 animate-fade-in-up">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${verdict.style}`}
              >
                <VerdictIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Preparedness
                </h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-2xl">
                  {preparedness.summary}
                </p>
              </div>
            </div>

            <Badge
              variant={VERDICT_VARIANTS[preparedness.verdict] || "slate"}
              className="text-sm px-4 py-2"
            >
              {preparedness.verdict}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-center">
            <div>
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-2">
                <Percent className="w-4 h-4 text-brand-600 dark:text-brand-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {completionRate}%
              </p>
              <p className="text-xs text-slate-400 mt-1">Completion rate</p>
            </div>

            <div>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {completedCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Sessions completed
              </p>
            </div>

            <div>
              <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center mx-auto mb-2">
                <ListTodo className="w-4 h-4 text-sky-600 dark:text-sky-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {totalCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">Total sessions</p>
            </div>

            <div>
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-2">
                <Gauge className="w-4 h-4 text-violet-600 dark:text-violet-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {velocityChart.confidence != null
                  ? `${Math.round(velocityChart.confidence * 100)}%`
                  : "—"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Forecast confidence
              </p>
            </div>
          </div>
        </Card>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="animate-fade-in-up animation-delay-100">
            <ChartCard
              title="Weekly Activity"
              subtitle="Minutes studied per week"
              chart={activityChart}
            />
          </div>

          <div className="animate-fade-in-up animation-delay-200">
            <ChartCard
              title="Weekly Velocity"
              subtitle={
                velocityChart.aiModel
                  ? `Forecast model: ${velocityChart.aiModel}`
                  : "Sessions completed per week, with forecast"
              }
              chart={velocityChart}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
