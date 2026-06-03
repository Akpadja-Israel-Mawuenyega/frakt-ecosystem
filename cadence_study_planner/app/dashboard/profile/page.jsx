"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

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

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-medium mb-1">
            Set up your academic profile
          </h1>
          <p className="text-gray-500 text-sm">
            This helps Cadence generate a study plan tailored to your courses.
            You can update this at any time.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 border border-red-200 p-3 text-sm">
            {error}
          </div>
        )}

        {/* Cohort selector */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <label className="block text-sm font-medium mb-3">Your cohort</label>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black bg-white"
          >
            <option value="">Select your cohort...</option>
            {COHORTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Course manager */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <label className="block text-sm font-medium mb-1">
            Enrolled courses
          </label>
          <p className="text-xs text-gray-400 mb-4">
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
              className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            />
            <input
              type="text"
              placeholder="Course name (e.g. Algorithms)"
              value={courseInput.name}
              onChange={(e) =>
                setCourseInput((prev) => ({ ...prev, name: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && handleAddCourse()}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            />
            <button
              onClick={handleAddCourse}
              className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Add
            </button>
          </div>

          {/* Course list */}
          {courses.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No courses added yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {courses.map((course) => (
                <li
                  key={course.code}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="text-sm font-medium">{course.code}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      — {course.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveCourse(course.code)}
                    className="text-xs text-red-500 hover:text-red-700 transition"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-black text-white py-3 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save and go to dashboard →"}
        </button>

        {/* Skip option */}
        <p className="text-center text-xs text-gray-400 mt-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="underline hover:text-gray-600 transition"
          >
            Skip for now
          </button>{" "}
          — you can complete this later from your dashboard.
        </p>
      </div>
    </main>
  );
}
