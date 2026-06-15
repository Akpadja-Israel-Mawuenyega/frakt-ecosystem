"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  GraduationCap,
  BookOpen,
  Search,
  Plus,
  Trash2,
  ArrowRight,
  BookMarked,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";

import Card from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";

/**
 * Available cohorts for the current academic year.
 * In production this would be fetched from the LMS integration.
 * For the prototype, this list is hardcoded to match the
 * seeded timetable data.
 */
const COHORTS = [
  "Level 100 CS A",
  "Level 100 CS B",
  "Level 200 CS A",
  "Level 200 CS B",
  "Level 300 CS A",
  "Level 300 CS B",
  "Level 400 CS A",
  "Level 400 CS B",
  "Level 200 MATH A",
  "Level 200 MATH C",
];

/**
 * Display labels for the learningResources `type` enum.
 */
const RESOURCE_TYPE_LABELS = {
  url: "Link",
  text: "Note",
  scholar_paper: "Academic Paper",
};

/**
 * Badge variant per learningResources `type` enum.
 */
const RESOURCE_TYPE_VARIANTS = {
  url: "blue",
  text: "slate",
  scholar_paper: "violet",
};

const inputClass =
  "border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition";

/**
 * /dashboard/profile
 *
 * Academic profile setup page — step 2 of onboarding.
 * Allows a student to set their cohort and manually add
 * enrolled courses. This is a temporary flow that simulates
 * what would otherwise come from an LMS API integration.
 *
 * On save, redirects to /dashboard where the AI planner
 * will now have real course data to work with.
 */
export default function ProfileSetupPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [cohort, setCohort] = useState("");
  const [courses, setCourses] = useState([]);
  const [courseInput, setCourseInput] = useState({ code: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resources, setResources] = useState([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);

  const [scholarQuery, setScholarQuery] = useState("");
  const [scholarResults, setScholarResults] = useState([]);
  const [scholarLoading, setScholarLoading] = useState(false);
  const [scholarError, setScholarError] = useState("");

  const [savingTitle, setSavingTitle] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  /**
   * Loads the student's previously saved learning resources on mount.
   */
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await fetch("/api/student/profile/resources");
        const data = await res.json();

        if (res.ok && data.success) {
          setResources(data.data);
        }
      } catch (err) {
        console.error("Failed to load learning resources:", err);
      } finally {
        setResourcesLoading(false);
      }
    };

    fetchResources();
  }, []);

  /**
   * Searches OpenAlex for academic papers related to the query.
   */
  const handleScholarSearch = async () => {
    const query = scholarQuery.trim();
    if (!query) return;

    setScholarLoading(true);
    setScholarError("");

    try {
      const res = await fetch(
        `/api/scholar/search?q=${encodeURIComponent(query)}&limit=5`
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setScholarError(data?.message || "Search failed. Please try again.");
        setScholarResults([]);
        return;
      }

      setScholarResults(data.data);
    } catch (err) {
      console.error("Scholar search error:", err);
      setScholarError("Something went wrong. Please try again.");
    } finally {
      setScholarLoading(false);
    }
  };

  /**
   * Saves an OpenAlex search result as a learning resource on the profile.
   */
  const handleAddResource = async (result) => {
    setSavingTitle(result.title);

    try {
      const res = await fetch("/api/student/profile/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          type: "scholar_paper",
          contentData: result.contentData,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResources(data.data);
      }
    } catch (err) {
      console.error("Failed to save learning resource:", err);
    } finally {
      setSavingTitle(null);
    }
  };

  /**
   * Removes a saved learning resource from the profile.
   */
  const handleRemoveResource = async (resourceId) => {
    setRemovingId(resourceId);

    try {
      const res = await fetch("/api/student/profile/resources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResources(data.data);
      }
    } catch (err) {
      console.error("Failed to remove learning resource:", err);
    } finally {
      setRemovingId(null);
    }
  };

  /**
   * Whether a search result has already been saved as a resource
   * (matched by title, since OpenAlex results don't carry a stable id).
   */
  const isResourceSaved = (title) =>
    resources.some((resource) => resource.title === title);

  /**
   * Adds a course to the local list.
   * Prevents duplicates by checking course code.
   */
  const handleAddCourse = () => {
    const code = courseInput.code.trim().toUpperCase();
    const name = courseInput.name.trim();

    if (!code || !name) return;

    const alreadyExists = courses.some((c) => c.code === code);
    if (alreadyExists) {
      setError(`${code} is already in your course list.`);
      return;
    }

    setCourses((prev) => [...prev, { code, name }]);
    setCourseInput({ code: "", name: "" });
    setError("");
  };

  /**
   * Removes a course from the local list by code.
   */
  const handleRemoveCourse = (code) => {
    setCourses((prev) => prev.filter((c) => c.code !== code));
  };

  /**
   * Submits cohort and enrolled courses to the profile API.
   * On success, redirects to the main dashboard.
   */
  const handleSave = async () => {
    if (!cohort) {
      setError("Please select your cohort.");
      return;
    }
    if (courses.length === 0) {
      setError("Please add at least one course.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/student/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort, enrolledCourses: courses }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.message || "Failed to save profile.");
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      console.error("Profile save error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Submits a password change for the current account.
   */
  const handleChangePassword = async (e) => {
    e.preventDefault();

    setPasswordError("");
    setPasswordSuccess("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await fetch("/api/student/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setPasswordError(data?.message || "Failed to update password.");
        return;
      }

      setPasswordSuccess(data.message || "Password updated successfully.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      console.error("Change password error:", err);
      setPasswordError("Something went wrong. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <main className="min-h-full bg-app-gradient flex items-center justify-center p-6 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 animate-fade-in flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Academic Profile
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
              This helps Cadence tailor your study plan to your courses.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {/* Cohort selector */}
        <Card className="p-5 mb-4 animate-fade-in-up">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            <GraduationCap className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            Your cohort
          </label>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className={`w-full ${inputClass} py-3 bg-white dark:bg-slate-800`}
          >
            <option value="">Select your cohort...</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Card>

        {/* Course manager */}
        <Card className="p-5 mb-4 animate-fade-in-up animation-delay-100">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            <BookOpen className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            Enrolled courses
          </label>
          <p className="text-xs text-slate-400 mb-4">
            Add your courses manually. In future versions this will sync
            automatically from your university LMS.
          </p>

          {/* Course input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Code (e.g. CS301)"
              value={courseInput.code}
              onChange={(e) =>
                setCourseInput((prev) => ({ ...prev, code: e.target.value }))
              }
              className={`w-28 ${inputClass}`}
            />
            <input
              type="text"
              placeholder="Course name (e.g. Algorithms)"
              value={courseInput.name}
              onChange={(e) =>
                setCourseInput((prev) => ({ ...prev, name: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && handleAddCourse()}
              className={`flex-1 ${inputClass}`}
            />
            <button
              onClick={handleAddCourse}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {/* Course list */}
          {courses.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              No courses added yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {courses.map((course) => (
                <li
                  key={course.code}
                  className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3"
                >
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {course.code}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">
                      — {course.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveCourse(course.code)}
                    className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Learning resources */}
        <Card className="p-5 mb-4 animate-fade-in-up animation-delay-200">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            <BookMarked className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            Learning resources
          </label>
          <p className="text-xs text-slate-400 mb-4">
            Search academic papers from OpenAlex and save the ones relevant
            to your courses — the AI planner uses these for extra context.
          </p>

          {/* Scholar search */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Search a topic (e.g. graph algorithms)"
              value={scholarQuery}
              onChange={(e) => setScholarQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScholarSearch()}
              className={`flex-1 ${inputClass}`}
            />
            <button
              onClick={handleScholarSearch}
              disabled={scholarLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white rounded-xl shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 transition disabled:opacity-60"
            >
              <Search className="w-4 h-4" />
              {scholarLoading ? "Searching..." : "Search"}
            </button>
          </div>

          {scholarError && (
            <p className="text-xs text-red-500 mb-3">{scholarError}</p>
          )}

          {/* Search results */}
          {scholarResults.length > 0 && (
            <ul className="space-y-2 mb-4">
              {scholarResults.map((result) => (
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
                      onClick={() => handleAddResource(result)}
                      disabled={
                        savingTitle === result.title ||
                        isResourceSaved(result.title)
                      }
                      className="shrink-0 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
                    >
                      {isResourceSaved(result.title)
                        ? "Saved"
                        : savingTitle === result.title
                        ? "Saving..."
                        : "Save"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Saved resources */}
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Saved resources
          </p>

          {resourcesLoading ? (
            <p className="text-sm text-slate-400 italic">Loading...</p>
          ) : resources.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              No learning resources saved yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {resources.map((resource) => (
                <li
                  key={resource._id}
                  className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {resource.title}
                    </span>
                    <Badge
                      variant={RESOURCE_TYPE_VARIANTS[resource.type] || "slate"}
                    >
                      {RESOURCE_TYPE_LABELS[resource.type] || resource.type}
                    </Badge>
                  </div>
                  <button
                    onClick={() => handleRemoveResource(resource._id)}
                    disabled={removingId === resource._id}
                    className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50 shrink-0 ml-3"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {removingId === resource._id ? "Removing..." : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-fuchsia-600 text-white py-3 rounded-xl text-sm font-medium shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {loading ? "Saving..." : "Save and go to dashboard"}
          {!loading && <ArrowRight className="w-4 h-4" />}
        </button>

        {/* Skip option */}
        <p className="text-center text-xs text-slate-400 mt-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-brand-600 font-medium hover:underline transition"
          >
            Skip for now
          </button>{" "}
          — you can complete this later from your dashboard.
        </p>

        {/* Change password */}
        <Card className="p-5 mt-6 animate-fade-in-up animation-delay-300">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            Change password
          </label>
          <p className="text-xs text-slate-400 mb-4">
            Update the password used to sign in to Cadence.
          </p>

          {passwordError && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 text-sm animate-fade-in">
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 p-3 text-sm animate-fade-in">
              {passwordSuccess}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPasswords ? "text" : "password"}
                placeholder="Current password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))
                }
                className={`w-full ${inputClass} pl-9 pr-4 py-2.5`}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPasswords ? "text" : "password"}
                placeholder="New password (min. 8 characters)"
                required
                minLength={8}
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))
                }
                className={`w-full ${inputClass} pl-9 pr-11 py-2.5`}
              />
              <button
                type="button"
                onClick={() => setShowPasswords((prev) => !prev)}
                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPasswords ? "text" : "password"}
                placeholder="Confirm new password"
                required
                minLength={8}
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                className={`w-full ${inputClass} pl-9 pr-4 py-2.5`}
              />
            </div>

            <button
              type="submit"
              disabled={passwordLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60"
            >
              <KeyRound className="w-4 h-4" />
              {passwordLoading ? "Updating..." : "Update password"}
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}
