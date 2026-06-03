import mongoose from 'mongoose';

/**
 * ───────────────────────────── COURSE REFERENCE ─────────────────────────────
 * Canonical course identity object shared across:
 * - Institutional timetable generation
 * - Personal AI timetable synthesis
 * - Conflict detection
 * - Analytics
 * - Calendar export pipelines
 *
 * This structure must remain stable across the platform.
 */
const CourseReferenceSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  }

}, { _id: false });

export default CourseReferenceSchema;