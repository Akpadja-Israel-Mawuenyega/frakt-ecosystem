"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarClock,
  Clock,
  CheckCircle2,
  BookOpen,
  CalendarDays,
  Sparkles,
} from "lucide-react";

import DashboardCard from "../../components/dashboard/DashboardCard";

/**
 * Formats minutes as a compact "Xh Ym" string.
 */
const formatMinutes = (minutes) => {
  if (!minutes) return "0 mins";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins} mins`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

/**
 * Formats an ISO date as a short, readable date.
 */
const formatDate = (value) => {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export default function Dashboard() {
  const { data: session } = useSession();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await fetch("/api/dashboard/summary");
        const data = await response.json();

        if (data.success) {
          setSummary(data.data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  return (
    <div className="p-6 md:p-10">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          Welcome, {session?.user?.name} 👋
        </h1>

        <p className="text-slate-500 dark:text-slate-400 mt-1">
          {summary?.cohort && summary.cohort !== "UNASSIGNED"
            ? summary.cohort
            : `Role: ${session?.user?.role}`}
        </p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm animate-pulse">
          Loading dashboard...
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="animate-fade-in-up">
            <DashboardCard
              title="Upcoming Sessions"
              value={summary?.upcomingCount ?? 0}
              subtitle="View your study planner"
              href="/planner"
              icon={CalendarClock}
              accent="brand"
            />
          </div>

          <div className="animate-fade-in-up animation-delay-100">
            <DashboardCard
              title="Planned This Week"
              value={formatMinutes(summary?.weekMinutes)}
              subtitle="Across the next 7 days"
              href="/planner"
              icon={Clock}
              accent="sky"
            />
          </div>

          <div className="animate-fade-in-up animation-delay-200">
            <DashboardCard
              title="Completion Rate"
              value={`${summary?.completionRate ?? 0}%`}
              subtitle={`${summary?.completedCount ?? 0} of ${
                summary?.totalCount ?? 0
              } sessions done`}
              href="/dashboard/progress"
              icon={CheckCircle2}
              accent="emerald"
            />
          </div>

          <div className="animate-fade-in-up">
            <DashboardCard
              title="Enrolled Courses"
              value={summary?.enrolledCoursesCount ?? 0}
              subtitle="Manage academic profile"
              href="/dashboard/profile"
              icon={BookOpen}
              accent="violet"
            />
          </div>

          <div className="animate-fade-in-up animation-delay-100">
            <DashboardCard
              title="Next Session"
              value={summary?.nextSession ? summary.nextSession.title : "—"}
              subtitle={
                summary?.nextSession
                  ? `${summary.nextSession.courseName} · ${formatDate(
                      summary.nextSession.date
                    )}`
                  : "Nothing scheduled yet"
              }
              href="/planner"
              icon={CalendarDays}
              accent="amber"
            />
          </div>

          <div className="animate-fade-in-up animation-delay-200">
            <DashboardCard
              title="AI Assistant"
              value="Generate Plan"
              subtitle="Create an optimized weekly schedule"
              href="/planner"
              icon={Sparkles}
              variant="gradient"
            />
          </div>
        </div>
      )}
    </div>
  );
}
