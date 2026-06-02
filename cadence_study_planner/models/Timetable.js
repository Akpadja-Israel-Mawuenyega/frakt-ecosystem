import mongoose from 'mongoose';

/**
 * @typedef {Object} TimetableAssignment
 * @property {string|null} assignedClass - The specific cohort group occupying this slot (e.g., 'L400_CS_A'), or null if open.
 * @property {string|null} assignedCourse - The combined tracking code and name descriptor (e.g., 'CS401 - Networks').
 * @property {string|null} assignedLecturer - The full name of the instructor locked to this time block block.
 */

/**
 * @typedef {Object} TimeSlotGroup
 * @property {string} timeSlot - The exact string block interval coordinates (e.g., '08:30-11:30').
 * @property {TimetableAssignment[]} assignments - Collection of parallel cohort bookings assigned to this discrete time block.
 */

/**
 * @typedef {Object} Timetable
 * @property {mongoose.Types.ObjectId} _id - Unique database identifier for the compiled master timetable instance.
 * @property {string} academicYear - The targeting operational academic session string (defaults to "2025/2026").
 * @property {number} semester - The active academic semester number tracking indicator (defaults to 2).
 * @property {Object} scheduleMatrix - A key-value map where keys are working days (e.g., 'Monday') pointing to time slot configuration arrays.
 * @property {Date} createdAt - Timestamp indicating when this target matrix configuration was first saved.
 * @property {Date} updatedAt - Timestamp tracking the last structural change or recompile save execution.
 */

/**
 * Mongoose Schema blueprint governing the saved output matrix processed by the greedy conflict constraint resolver.
 * @type {mongoose.Schema<Timetable>}
 */
const TimetableSchema = new mongoose.Schema({
  academicYear: { 
    type: String, 
    required: true, 
    default: "2025/2026" 
  },
  semester: { 
    type: Number, 
    required: true, 
    default: 2 
  },
  // We use Mixed here because the scheduler generates a plain JS object.
  // This avoids CastErrors where Mongoose tries to force a Map instance
  // onto a standard POJO (Plain Old JavaScript Object).
  scheduleMatrix: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, { timestamps: true });

/**
 * Data Access Object mapping explicitly to the 'timetables' collection.
 * @type {mongoose.Model<Timetable>}
 */
const Timetable = mongoose.models.Timetable || mongoose.model('Timetable', TimetableSchema, 'timetables');

export default Timetable;