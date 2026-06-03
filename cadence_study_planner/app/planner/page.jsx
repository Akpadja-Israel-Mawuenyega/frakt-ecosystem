"use client";

import { useEffect, useState } from "react";

/**
 * ───────────────────────────── PLANNER PAGE ─────────────────────────────
 *
 * Central planner workspace.
 *
 * Responsibilities:
 * - trigger AI plan generation
 * - display generated sessions
 * - future calendar rendering
 * - session completion tracking
 */
export default function PlannerPage() {
  /**
   * ───────────────────────── STATE ─────────────────────────
   */

  const [sessions, setSessions] = useState([]);

  const [loading, setLoading] = useState(false);

  /**
   * ───────────────────────── FETCH EXISTING SESSIONS ─────────────────────────
   */

  const fetchSessions = async () => {
    try {
      const response = await fetch("/api/study-sessions");

      const data = await response.json();

      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (error) {
      console.error(error);
    }
  };

  /**
   * ───────────────────────── GENERATE AI PLAN ─────────────────────────
   */

  const generatePlan = async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/ai/generate-plan", {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        await fetchSessions();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ───────────────────────── INITIAL LOAD ─────────────────────────
   */

  useEffect(() => {
    fetchSessions();
  }, []);

  /**
   * ───────────────────────── UI ─────────────────────────
   */

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold">AI Study Planner</h1>

            <p className="text-gray-600 mt-2">
              Generate intelligent study schedules.
            </p>
          </div>

          <button
            onClick={generatePlan}
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-xl font-medium hover:opacity-90 transition"
          >
            {loading ? "Generating..." : "Generate Plan"}
          </button>
        </div>

        {/* Sessions */}

        <div className="grid gap-4">
          {sessions.map((session) => (
            <div key={session._id} className="bg-white rounded-2xl p-6 shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{session.title}</h2>

                  <p className="text-gray-600 mt-1">{session.course.name}</p>

                  <p className="text-gray-500 text-sm mt-3">
                    {session.description}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-sm bg-gray-100 px-3 py-1 rounded-full">
                    {session.priority}
                  </span>

                  <p className="text-sm text-gray-500 mt-3">
                    {session.duration} mins
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
