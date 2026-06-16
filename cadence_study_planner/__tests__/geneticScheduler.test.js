/**
 * Genetic Algorithm timetable scheduler tests.
 *
 * The GA is randomized, but for small inputs (4–6 sessions over 15 slots)
 * 200 generations + 3 hill-climbing passes reliably produces zero
 * hard-constraint violations.  Tests assert structural guarantees that must
 * hold on every run, not specific slot assignments.
 */

const {
  runGeneticScheduler,
  DAYS,
  TIME_SLOTS,
} = require("../lib/scheduler/geneticScheduler.js");

// ---------------------------------------------------------------------------
// Shared fixture — small enough for fast GA convergence
// ---------------------------------------------------------------------------
const SAMPLE_DEMANDS = [
  {
    cohort: "CS A",
    lecturer: "Dr Smith",
    courseCode: "CS101",
    courseName: "Intro CS",
    weeklySlotsRequired: 2,
  },
  {
    cohort: "CS B",
    lecturer: "Dr Jones",
    courseCode: "MATH201",
    courseName: "Calculus",
    weeklySlotsRequired: 1,
  },
  {
    cohort: "CS A",
    lecturer: "Dr Brown",
    courseCode: "PHYS101",
    courseName: "Physics",
    weeklySlotsRequired: 1,
  },
];

let matrix;

beforeAll(() => {
  // Run once — the GA takes ~100 ms for this input size
  matrix = runGeneticScheduler(SAMPLE_DEMANDS);
});

// ---------------------------------------------------------------------------
// Matrix structure
// ---------------------------------------------------------------------------
describe("schedule matrix structure", () => {
  test("has exactly five day keys", () => {
    expect(Object.keys(matrix).sort()).toEqual([...DAYS].sort());
  });

  test("each day has exactly three time-slot entries", () => {
    for (const day of DAYS) {
      expect(matrix[day]).toHaveLength(TIME_SLOTS.length);
    }
  });

  test("each time-slot entry has timeSlot and assignments fields", () => {
    for (const day of DAYS) {
      for (const entry of matrix[day]) {
        expect(typeof entry.timeSlot).toBe("string");
        expect(Array.isArray(entry.assignments)).toBe(true);
      }
    }
  });

  test("timeSlot labels match the exported TIME_SLOTS constant", () => {
    for (const day of DAYS) {
      const labels = matrix[day].map((e) => e.timeSlot);
      expect(labels).toEqual(TIME_SLOTS);
    }
  });
});

// ---------------------------------------------------------------------------
// Session count
// ---------------------------------------------------------------------------
describe("session allocation", () => {
  test("every required session is placed in the schedule", () => {
    const totalRequired = SAMPLE_DEMANDS.reduce(
      (sum, d) => sum + (d.weeklySlotsRequired || 1),
      0
    );

    let totalAssigned = 0;
    for (const day of DAYS) {
      for (const entry of matrix[day]) {
        totalAssigned += entry.assignments.length;
      }
    }

    expect(totalAssigned).toBe(totalRequired);
  });

  test("each assignment has assignedClass, assignedLecturer, and assignedCourse", () => {
    for (const day of DAYS) {
      for (const entry of matrix[day]) {
        for (const a of entry.assignments) {
          expect(typeof a.assignedClass).toBe("string");
          expect(typeof a.assignedLecturer).toBe("string");
          expect(typeof a.assignedCourse.code).toBe("string");
          expect(typeof a.assignedCourse.name).toBe("string");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Hard-constraint verification — zero violations required
// ---------------------------------------------------------------------------
describe("hard constraints (zero violations)", () => {
  test("no cohort is double-booked in the same slot", () => {
    for (const day of DAYS) {
      for (const entry of matrix[day]) {
        const cohorts = entry.assignments.map((a) => a.assignedClass);
        expect(new Set(cohorts).size).toBe(cohorts.length);
      }
    }
  });

  test("no lecturer is double-booked in the same slot", () => {
    for (const day of DAYS) {
      for (const entry of matrix[day]) {
        const lecturers = entry.assignments.map((a) => a.assignedLecturer);
        expect(new Set(lecturers).size).toBe(lecturers.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  test("empty demands produce a valid empty matrix", () => {
    const empty = runGeneticScheduler([]);
    expect(Object.keys(empty).sort()).toEqual([...DAYS].sort());
    for (const day of DAYS) {
      for (const entry of empty[day]) {
        expect(entry.assignments).toHaveLength(0);
      }
    }
  });

  test("demand with weeklySlotsRequired=0 still allocates one session", () => {
    const one = runGeneticScheduler([
      {
        cohort: "X",
        lecturer: "Dr X",
        courseCode: "X1",
        courseName: "X Course",
        weeklySlotsRequired: 0,
      },
    ]);
    let total = 0;
    for (const day of DAYS) {
      for (const entry of one[day]) {
        total += entry.assignments.length;
      }
    }
    // buildSessions uses Math.max(1, weeklySlotsRequired)
    expect(total).toBe(1);
  });

  test("demands with conflicting lecturers still produce zero hard violations after refinement", () => {
    // Two courses with the same lecturer — GA must separate them into different slots
    const conflicting = [
      { cohort: "A", lecturer: "Same", courseCode: "C1", courseName: "One", weeklySlotsRequired: 1 },
      { cohort: "B", lecturer: "Same", courseCode: "C2", courseName: "Two", weeklySlotsRequired: 1 },
      { cohort: "C", lecturer: "Other", courseCode: "C3", courseName: "Three", weeklySlotsRequired: 1 },
    ];
    const m = runGeneticScheduler(conflicting);
    for (const day of DAYS) {
      for (const entry of m[day]) {
        const lecturers = entry.assignments.map((a) => a.assignedLecturer);
        expect(new Set(lecturers).size).toBe(lecturers.length);
      }
    }
  });
});
