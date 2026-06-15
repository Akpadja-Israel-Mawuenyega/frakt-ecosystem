"use client";

import { useEffect, useState } from "react";
import { Layers, Plus, Pencil, Trash2, Check, X } from "lucide-react";

import Card from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";

const inputClass =
  "border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition";

/**
 * Badge variant per cohort code, just to give each cohort's rows a
 * distinct color in the table.
 */
const COHORT_BADGE_VARIANTS = {
  L400_CS_A: "violet",
  L400_CS_B: "blue",
  L300_CS_A: "amber",
  L300_CS_B: "green",
};

const emptyForm = {
  courseCode: "",
  courseName: "",
  cohort: "",
  lecturer: "",
  weeklySlotsRequired: 1,
};

/**
 * Sorts demands by cohort, then course code — matches the API's default
 * ordering so local updates don't visibly reshuffle the table.
 */
const sortDemands = (a, b) =>
  a.cohort === b.cohort
    ? a.courseCode.localeCompare(b.courseCode)
    : a.cohort.localeCompare(b.cohort);

/**
 * ───────────────────────────── COURSE DEMANDS PAGE ─────────────────────────────
 *
 * /admin/course-demands
 *
 * CRUD for the CourseDemand collection that feeds the genetic timetable
 * scheduler — lets admins define real course/cohort/lecturer/slot data
 * instead of relying on hand-inserted database records.
 */
export default function CourseDemandsPage() {
  const [demands, setDemands] = useState([]);
  const [cohortOptions, setCohortOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const fetchDemands = async () => {
      try {
        const res = await fetch("/api/admin/course-demands");
        const data = await res.json();

        if (data.success) {
          setDemands(data.data);
          setCohortOptions(data.cohortOptions || []);
        } else {
          setError(data.message || "Failed to load course demands.");
        }
      } catch (err) {
        console.error(err);
        setError("Something went wrong loading course demands.");
      } finally {
        setLoading(false);
      }
    };

    fetchDemands();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setCreating(true);

    try {
      const res = await fetch("/api/admin/course-demands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Failed to create course demand.");
        return;
      }

      setDemands((prev) => [...prev, data.data].sort(sortDemands));
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      setError("Something went wrong creating the course demand.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (demand) => {
    setError("");
    setEditingId(demand._id);
    setEditForm({
      courseCode: demand.courseCode,
      courseName: demand.courseName,
      cohort: demand.cohort,
      lecturer: demand.lecturer,
      weeklySlotsRequired: demand.weeklySlotsRequired,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleSaveEdit = async (id) => {
    setSavingId(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/course-demands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Failed to update course demand.");
        return;
      }

      setDemands((prev) =>
        prev.map((d) => (d._id === id ? data.data : d)).sort(sortDemands)
      );
      cancelEdit();
    } catch (err) {
      console.error(err);
      setError("Something went wrong updating the course demand.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/course-demands/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Failed to delete course demand.");
        return;
      }

      setDemands((prev) => prev.filter((d) => d._id !== id));
    } catch (err) {
      console.error(err);
      setError("Something went wrong deleting the course demand.");
    } finally {
      setDeletingId(null);
    }
  };

  const totalWeeklySessions = demands.reduce(
    (sum, d) => sum + (d.weeklySlotsRequired || 0),
    0
  );

  return (
    <main className="p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Course Demands
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Define the courses, cohorts, lecturers and weekly slot
              requirements the scheduling engine builds the timetable from.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Add form */}
        <Card className="p-6 mb-6 animate-fade-in-up">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Add a course demand
          </h3>

          <form
            onSubmit={handleCreate}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
          >
            <input
              type="text"
              placeholder="Code (e.g. CS401)"
              value={form.courseCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, courseCode: e.target.value }))
              }
              className={inputClass}
              required
            />
            <input
              type="text"
              placeholder="Course name"
              value={form.courseName}
              onChange={(e) =>
                setForm((f) => ({ ...f, courseName: e.target.value }))
              }
              className={`${inputClass} lg:col-span-2`}
              required
            />
            <select
              value={form.cohort}
              onChange={(e) =>
                setForm((f) => ({ ...f, cohort: e.target.value }))
              }
              className={`${inputClass} bg-white dark:bg-slate-800`}
              required
            >
              <option value="">Cohort...</option>
              {cohortOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Lecturer"
              value={form.lecturer}
              onChange={(e) =>
                setForm((f) => ({ ...f, lecturer: e.target.value }))
              }
              className={inputClass}
              required
            />
            <input
              type="number"
              min={1}
              max={15}
              placeholder="Slots/week"
              value={form.weeklySlotsRequired}
              onChange={(e) =>
                setForm((f) => ({ ...f, weeklySlotsRequired: e.target.value }))
              }
              className={inputClass}
              required
            />

            <button
              type="submit"
              disabled={creating}
              className="lg:col-span-6 inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 transition disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              {creating ? "Adding..." : "Add demand"}
            </button>
          </form>
        </Card>

        {/* List */}
        <Card className="p-6 animate-fade-in-up animation-delay-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              All demands ({demands.length})
            </h3>
            <p className="text-xs text-slate-400">
              Total weekly sessions: {totalWeeklySessions}
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 animate-pulse">
              Loading course demands...
            </p>
          ) : demands.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              No course demands yet. Add one above to start building the
              timetable.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="py-2 pr-3">Cohort</th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Course</th>
                    <th className="py-2 pr-3">Lecturer</th>
                    <th className="py-2 pr-3">Slots/wk</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {demands.map((demand) => {
                    const isEditing = editingId === demand._id;

                    return (
                      <tr key={demand._id}>
                        <td className="py-2.5 pr-3">
                          {isEditing ? (
                            <select
                              value={editForm.cohort}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, cohort: e.target.value }))
                              }
                              className={`${inputClass} bg-white dark:bg-slate-800 py-1.5`}
                            >
                              {cohortOptions.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant={COHORT_BADGE_VARIANTS[demand.cohort] || "slate"}>
                              {demand.cohort}
                            </Badge>
                          )}
                        </td>

                        <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.courseCode}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, courseCode: e.target.value }))
                              }
                              className={`${inputClass} py-1.5 w-24`}
                            />
                          ) : (
                            demand.courseCode
                          )}
                        </td>

                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.courseName}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, courseName: e.target.value }))
                              }
                              className={`${inputClass} py-1.5 w-full min-w-[10rem]`}
                            />
                          ) : (
                            demand.courseName
                          )}
                        </td>

                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editForm.lecturer}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, lecturer: e.target.value }))
                              }
                              className={`${inputClass} py-1.5 w-full min-w-[8rem]`}
                            />
                          ) : (
                            demand.lecturer
                          )}
                        </td>

                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                          {isEditing ? (
                            <input
                              type="number"
                              min={1}
                              max={15}
                              value={editForm.weeklySlotsRequired}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  weeklySlotsRequired: e.target.value,
                                }))
                              }
                              className={`${inputClass} py-1.5 w-20`}
                            />
                          ) : (
                            demand.weeklySlotsRequired
                          )}
                        </td>

                        <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-3">
                              <button
                                onClick={() => handleSaveEdit(demand._id)}
                                disabled={savingId === demand._id}
                                className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {savingId === demand._id ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition"
                              >
                                <X className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-3">
                              <button
                                onClick={() => startEdit(demand)}
                                className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(demand._id)}
                                disabled={deletingId === demand._id}
                                className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {deletingId === demand._id ? "Removing..." : "Remove"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
