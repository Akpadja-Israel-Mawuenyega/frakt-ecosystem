"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Sparkles,
  Calendar,
  Clock,
  Trash2,
  CheckCircle2,
  ListTodo,
  BookOpen,
  BookMarked,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";

/**
 * Badge variant per priority level, used on each upcoming session card.
 */
const PRIORITY_VARIANTS = {
  low: "slate",
  medium: "amber",
  high: "red",
};

/**
 * Formats an ISO date string as a short, readable date.
 */
const formatDate = (value) => {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/**
 * ───────────────────────────── PLANNER PAGE ─────────────────────────────
 *
 * Central planner workspace.
 *
 * Responsibilities:
 * - trigger AI plan generation
 * - display generated sessions, split into Upcoming / Completed
 * - mark sessions complete/incomplete and delete them
 */
export default function PlannerPage() {
  /**
   * ───────────────────────── STATE ─────────────────────────
   */

  const [sessions, setSessions] = useState([]);

  const [loading, setLoading] = useState(false);

  const [actionId, setActionId] = useState(null);

  /**
   * ───────────────────────── RESOURCES STATE ─────────────────────────
   * Tracks which session cards have their "resources" panel open, the
   * OpenAlex search results per session, and the student's already-saved
   * learning resources (for dedup / save-state on the "Save" buttons).
   */

  const [expandedIds, setExpandedIds] = useState(new Set());

  const [resourceData, setResourceData] = useState({});

  const [savedResources, setSavedResources] = useState([]);

  const [savingKey, setSavingKey] = useState(null);

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
   * ───────────────────────── TOGGLE COMPLETION ─────────────────────────
   */

  const toggleComplete = async (sessionToToggle) => {
    setActionId(sessionToToggle._id);

    try {
      const response = await fetch(
        `/api/study-sessions/${sessionToToggle._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: !sessionToToggle.completed }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setSessions((prev) =>
          prev.map((s) => (s._id === sessionToToggle._id ? data.session : s))
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setActionId(null);
    }
  };

  /**
   * ───────────────────────── DELETE SESSION ─────────────────────────
   */

  const deleteSession = async (sessionId) => {
    setActionId(sessionId);

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setSessions((prev) => prev.filter((s) => s._id !== sessionId));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setActionId(null);
    }
  };

  /**
   * ───────────────────────── LOAD SAVED RESOURCES ─────────────────────────
   */

  const fetchSavedResources = async () => {
    try {
      const response = await fetch("/api/student/profile/resources");
      const data = await response.json();

      if (response.ok && data.success) {
        setSavedResources(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  /**
   * ───────────────────────── SEARCH OPENALEX FOR A SESSION ─────────────────────────
   */

  const fetchResourcesFor = async (session) => {
    const query = session.title || session.course?.name || "";
    if (!query) return;

    setResourceData((prev) => ({
      ...prev,
      [session._id]: { loading: true, error: "", results: [] },
    }));

    try {
      const response = await fetch(
        `/api/scholar/search?q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        setResourceData((prev) => ({
          ...prev,
          [session._id]: {
            loading: false,
            error: data?.message || "Search failed. Please try again.",
            results: [],
          },
        }));
        return;
      }

      setResourceData((prev) => ({
        ...prev,
        [session._id]: { loading: false, error: "", results: data.data },
      }));
    } catch (error) {
      console.error(error);
      setResourceData((prev) => ({
        ...prev,
        [session._id]: {
          loading: false,
          error: "Something went wrong. Please try again.",
          results: [],
        },
      }));
    }
  };

  /**
   * ───────────────────────── TOGGLE RESOURCES PANEL ─────────────────────────
   */

  const toggleResources = (session) => {
    const alreadyOpen = expandedIds.has(session._id);

    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (alreadyOpen) {
        next.delete(session._id);
      } else {
        next.add(session._id);
      }
      return next;
    });

    if (!alreadyOpen && !resourceData[session._id]) {
      fetchResourcesFor(session);
    }
  };

  /**
   * ───────────────────────── SAVE A RESOURCE TO PROFILE ─────────────────────────
   */

  const handleSaveResource = async (result) => {
    setSavingKey(result.title);

    try {
      const response = await fetch("/api/student/profile/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          type: "scholar_paper",
          contentData: result.contentData,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSavedResources(data.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSavingKey(null);
    }
  };

  /**
   * Whether a search result has already been saved as a resource
   * (matched by title, since OpenAlex results don't carry a stable id).
   */
  const isResourceSaved = (title) =>
    savedResources.some((resource) => resource.title === title);

  /**
   * ───────────────────────── INITIAL LOAD ─────────────────────────
   */

  useEffect(() => {
    fetchSessions();
    fetchSavedResources();
  }, []);

  /**
   * ───────────────────────── DERIVED LISTS ─────────────────────────
   */

  const upcoming = sessions
    .filter((s) => !s.completed)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const completed = sessions
    .filter((s) => s.completed)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  /**
   * ───────────────────────── UI ─────────────────────────
   */

  return (
    <main className="p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
              <CalendarClock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                AI Study Planner
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Generate intelligent study schedules.
              </p>
            </div>
          </div>

          <button
            onClick={generatePlan}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <Sparkles className={`w-4 h-4 ${loading ? "animate-pulse" : ""}`} />
            {loading ? "Generating..." : "Generate Plan"}
          </button>
        </div>

        {/* Upcoming sessions */}

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Upcoming ({upcoming.length})
          </h2>

          {upcoming.length === 0 ? (
            <Card className="p-8 text-center animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-3">
                <ListTodo className="w-6 h-6 text-brand-600 dark:text-brand-300" />
              </div>
              <p className="text-sm text-slate-400">
                No upcoming sessions. Generate a plan to get started.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {upcoming.map((session, i) => (
                <Card
                  key={session._id}
                  hover
                  className="p-6 animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i, 5) * 0.05}s` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={actionId === session._id}
                        onChange={() => toggleComplete(session)}
                        className="mt-1.5 w-4 h-4 accent-brand-600"
                        aria-label="Mark session complete"
                      />

                      <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                          {session.title}
                        </h3>

                        <p className="text-slate-500 dark:text-slate-400 mt-1">
                          {session.course?.name}
                        </p>

                        {session.description && (
                          <p className="text-slate-400 text-sm mt-3">
                            {session.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <Badge
                        variant={
                          PRIORITY_VARIANTS[session.priority] || "amber"
                        }
                      >
                        {session.priority}
                      </Badge>

                      <p className="flex items-center justify-end gap-1.5 text-sm text-slate-400 mt-3">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(session.date)}
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <Clock className="w-3.5 h-3.5" />
                        {session.duration} mins
                      </p>

                      <button
                        onClick={() => deleteSession(session._id)}
                        disabled={actionId === session._id}
                        className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition mt-3 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>

                      <button
                        onClick={() => toggleResources(session)}
                        className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 transition mt-2"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        {expandedIds.has(session._id) ? "Hide resources" : "Find resources"}
                        {expandedIds.has(session._id) ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Resources panel */}
                  {expandedIds.has(session._id) && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
                        <BookMarked className="w-3.5 h-3.5" />
                        Academic resources for &ldquo;{session.title}&rdquo;
                      </p>

                      {resourceData[session._id]?.loading && (
                        <p className="text-sm text-slate-400 italic">
                          Searching OpenAlex...
                        </p>
                      )}

                      {resourceData[session._id]?.error && (
                        <p className="text-xs text-red-500">
                          {resourceData[session._id].error}
                        </p>
                      )}

                      {!resourceData[session._id]?.loading &&
                        !resourceData[session._id]?.error &&
                        resourceData[session._id]?.results?.length === 0 && (
                          <p className="text-sm text-slate-400 italic">
                            No related papers found.
                          </p>
                        )}

                      {resourceData[session._id]?.results?.length > 0 && (
                        <ul className="space-y-2">
                          {resourceData[session._id].results.map((result) => (
                            <li
                              key={result.title}
                              className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {result.title}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                    {result.contentData}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleSaveResource(result)}
                                  disabled={
                                    savingKey === result.title ||
                                    isResourceSaved(result.title)
                                  }
                                  className="shrink-0 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
                                >
                                  {isResourceSaved(result.title)
                                    ? "Saved"
                                    : savingKey === result.title
                                    ? "Saving..."
                                    : "Save"}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Completed sessions */}

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Completed ({completed.length})
          </h2>

          {completed.length === 0 ? (
            <Card className="p-8 text-center animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />
              </div>
              <p className="text-sm text-slate-400">Nothing completed yet.</p>
            </Card>
          ) : (
            <div className="grid gap-3">
              {completed.map((session) => (
                <Card key={session._id} className="p-5 opacity-70">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={true}
                        disabled={actionId === session._id}
                        onChange={() => toggleComplete(session)}
                        className="mt-1 w-4 h-4 accent-brand-600"
                        aria-label="Mark session incomplete"
                      />

                      <div>
                        <h3 className="font-semibold line-through text-slate-700 dark:text-slate-300">
                          {session.title}
                        </h3>

                        <p className="text-slate-400 text-sm">
                          {session.course?.name}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="flex items-center justify-end gap-1.5 text-sm text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(session.date)}
                      </p>

                      <button
                        onClick={() => deleteSession(session._id)}
                        disabled={actionId === session._id}
                        className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition mt-3 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
