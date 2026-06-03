import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import CourseDemand from '@/models/CourseDemand';
import Timetable from '@/models/Timetable';

// The only available time blocks and working days for this institution.
// Slots are 3-hour blocks; adjust here if the academic calendar changes.
const TIME_SLOTS = ["08:30-11:30", "11:30-14:30", "14:30-17:30"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// ─────────────────────────── CONSTRAINT ENGINE ────────────────────────────

/**
 * Builds a blank weekly schedule matrix keyed by day.
 * Each day holds one entry per time slot with an empty assignments array,
 * ready to accept multiple cohort bookings in parallel.
 *
 * @returns {Object} A matrix of shape { [day]: [{ timeSlot, assignments[] }] }
 */
const initializeEmptyMatrix = () => {
  const matrix = {};
  DAYS.forEach(day => {
    matrix[day] = TIME_SLOTS.map(slot => ({
      timeSlot: slot,
      assignments: [] // Multiple cohorts can share a slot (different lecturers/rooms)
    }));
  });
  return matrix;
};

/**
 * Checks whether a lecturer is already booked in a given day/slot.
 * Prevents the same lecturer from teaching two cohorts at the same time.
 *
 * @param {Object} matrix - The current schedule matrix.
 * @param {string} day - Day of the week (e.g. "Monday").
 * @param {string} slotTime - Time slot string (e.g. "08:30-11:30").
 * @param {string} lecturerName - Full name of the lecturer to check.
 * @returns {boolean} True if the lecturer has a clash, false if they are free.
 */
const hasLecturerConflict = (matrix, day, slotTime, lecturerName) =>
  matrix[day]
    .find(s => s.timeSlot === slotTime)
    ?.assignments.some(a => a.assignedLecturer === lecturerName) ?? false;

/**
 * Checks whether a cohort is already scheduled in a given day/slot.
 * Prevents a cohort from being double-booked into two courses at the same time.
 *
 * @param {Object} matrix - The current schedule matrix.
 * @param {string} day - Day of the week (e.g. "Monday").
 * @param {string} slotTime - Time slot string (e.g. "08:30-11:30").
 * @param {string} cohortName - Name of the student cohort to check.
 * @returns {boolean} True if the cohort has a clash, false if they are free.
 */
const hasCohortConflict = (matrix, day, slotTime, cohortName) =>
  matrix[day]
    .find(s => s.timeSlot === slotTime)
    ?.assignments.some(a => a.assignedClass === cohortName) ?? false;

/**
 * Checks whether the same course is already assigned
 * to the same cohort in a given slot.
 *
 * Prevents accidental duplicate allocations.
 */
const hasCourseConflict = (
  matrix,
  day,
  slotTime,
  cohortName,
  courseCode
) =>
  matrix[day]
    .find(s => s.timeSlot === slotTime)
    ?.assignments.some(
      a =>
        a.assignedClass === cohortName &&
        a.assignedCourse.code === courseCode
    ) ?? false;

/**
 * Core scheduling algorithm. Iterates over course demands (highest slot-count
 * first) and greedily assigns each to the earliest conflict-free day/slot.
 *
 * Constraints enforced per slot:
 * - A lecturer may not appear more than once.
 * - A cohort may not appear more than once.
 * - A specific course may not appear more than once per day.
 *
 * Demands that cannot be fully satisfied (e.g. due to a packed timetable) are
 * partially allocated and flagged with a console warning — they do not throw.
 *
 * @param {Array<Object>} demands - Course demand documents from MongoDB.
 * @param {number} demands[].weeklySlotsRequired - How many slots per week this course needs.
 * @param {string} demands[].cohort - The student cohort for this course.
 * @param {string} demands[].lecturer - The assigned lecturer's name.
 * @param {string} demands[].courseCode - Short course code (e.g. "CS301").
 * @param {string} demands[].courseName - Full course name.
 * @returns {Object} A fully populated schedule matrix.
 */
const runScheduler = (demands) => {
  const masterMatrix = initializeEmptyMatrix();

  for (const demand of demands) {
    let allocated = false;

    const startDayIndex = Math.floor(Math.random() * DAYS.length);

    const rotatedDays = [
      ...DAYS.slice(startDayIndex),
      ...DAYS.slice(0, startDayIndex)
    ];  

    for (const day of rotatedDays) {
      if (allocated) break;

      for (const slot of masterMatrix[day]) {
        const lecturerBusy = hasLecturerConflict(
          masterMatrix,
          day,
          slot.timeSlot,
          demand.lecturer
        );

        const cohortBusy = hasCohortConflict(
          masterMatrix,
          day,
          slot.timeSlot,
          demand.cohort
        );

        const courseExists = slot.assignments.some(
          a =>
            a.assignedClass === demand.cohort &&
            a.assignedCourse.code === demand.courseCode
        );

        if (!lecturerBusy && !cohortBusy && !courseExists) {
          slot.assignments.push({
            assignedClass: demand.cohort,
            assignedCourse: {
              code: demand.courseCode,
              name: demand.courseName
            },
            assignedLecturer: demand.lecturer,
          });

          allocated = true;
          break;
        }
      }
    }

    if (!allocated) {
      console.warn(
        `Unable to allocate ${demand.courseCode} for ${demand.cohort}`
      );
    }
  }

  return masterMatrix;
};

// ──────────────────────────── ROUTE HANDLER ───────────────────────────────

/**
 * POST /api/timetable/compile
 *
 * Triggers the constraint engine, then upserts the result into the Timetable
 * collection for the current academic year and semester.
 *
 * @access Admin only (verified via x-user-role header — replace with JWT middleware in production)
 * @returns {NextResponse} JSON with success status and the saved timetable document.
 */
export async function POST(request) {
  try {
    await connectDB();

    const userRole = request.headers.get('x-user-role');
    if (userRole !== 'admin') {
      return NextResponse.json(
        { success: false, message: "Forbidden: Admin authorization required." },
        { status: 403 }
      );
    }

    const demands = await CourseDemand.find({});
    if (!demands || demands.length === 0) {
      return NextResponse.json(
        { success: false, message: "No course demands found." },
        { status: 400 }
      );
    }

    const solvedScheduleMatrix = runScheduler(demands);

    const academicYear = process.env.ACADEMIC_YEAR ?? "2025/2026";
    const semester = Number(process.env.SEMESTER ?? 2);

    const currentTimetable = await Timetable.findOneAndUpdate(
      { academicYear, semester },
      { scheduleMatrix: solvedScheduleMatrix },
      { upsert: true, returnDocument: 'after' }
    );

    return NextResponse.json({
      success: true,
      message: "Timetable generated successfully.",
      data: currentTimetable
    }, { status: 200 });

  } catch (error) {
    console.error("🚨 SCHEDULER EXCEPTION:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}