import mongoose from 'mongoose';
import CourseReferenceSchema from '@/models/shared/CourseReference';

/**
 * ─────────────────────────── TIMETABLE ASSIGNMENT ───────────────────────────
 * Represents one actual allocation inside a slot.
 *
 * Multiple assignments may exist in the same slot:
 * Example:
 * - Different cohorts
 * - Different rooms
 * - Different lecturers
 * - Same time block
 */
const TimetableAssignmentSchema = new mongoose.Schema({
  assignedClass: {
    type: String,
    default: null,
    trim: true
  },

  assignedCourse: {
    type: CourseReferenceSchema,
    default: null
  },

  assignedLecturer: {
    type: String,
    default: null,
    trim: true
  },

  assignedRoom: {
    type: String,
    default: null,
    trim: true
  }
}, { _id: false });

/**
 * ─────────────────────────────── TIME SLOT GROUP ────────────────────────────
 * Represents a single institutional time block.
 *
 * Example:
 * "08:30-11:30"
 */
const TimeSlotGroupSchema = new mongoose.Schema({
  timeSlot: {
    type: String,
    required: true,
    trim: true
  },

  assignments: {
    type: [TimetableAssignmentSchema],
    default: []
  }
}, { _id: false });

/**
 * ──────────────────────────────── MAIN MODEL ────────────────────────────────
 * Institutional timetable root document.
 *
 * scheduleMatrix structure:
 *
 * {
 *   Monday: [
 *     {
 *       timeSlot: "08:30-11:30",
 *       assignments: [...]
 *     }
 *   ],
 *
 *   Tuesday: [...]
 * }
 */
const TimetableSchema = new mongoose.Schema({
  academicYear: {
    type: String,
    required: true,
    default: "2025/2026",
    trim: true
  },

  semester: {
    type: Number,
    required: true,
    default: 2,
    min: 1
  },

  /**
   * Day-keyed timetable matrix.
   *
   * Uses Map instead of Mixed to enforce validation while
   * still supporting dynamic weekday keys.
   */
  scheduleMatrix: {
    type: Map,
    of: [TimeSlotGroupSchema],
    required: true
  },

  /**
   * Timetable classification.
   * Future-safe for:
   * - institutional
   * - personal
   * - draft
   * - optimized
   */
  type: {
    type: String,
    enum: ['institutional', 'personal'],
    default: 'institutional'
  },

  /**
   * Optional future linkage:
   * Personal timetable ownership.
   */
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  /**
   * Optional AI preference payload.
   * Example:
   * {
   *   prefersMorning: true,
   *   freeFriday: false
   * }
   */
  preferences: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  /**
   * Tracks which institutional timetable
   * a personal timetable was derived from.
   */
  generatedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timetable',
    default: null
  }

}, {
  timestamps: true
});

/**
 * Useful compound index:
 * Prevents duplicate institutional timetable versions
 * for the same academic session.
 */
TimetableSchema.index({
  academicYear: 1,
  semester: 1,
  type: 1
}, {
  unique: true,
  partialFilterExpression: {
    type: 'institutional'
  }
});

/**
 * ───────────────────────────── MODEL EXPORT ─────────────────────────────
 */
const Timetable =
  mongoose.models.Timetable ||
  mongoose.model(
    'Timetable',
    TimetableSchema,
    'timetables'
  );

export default Timetable;