import mongoose from 'mongoose';

/**
 * @typedef {Object} CourseDemand
 * @property {mongoose.Types.ObjectId} _id - Unique operational ID of the demand constraint document.
 * @property {string} courseCode - The standardized short code for the course tracking (e.g., 'CS401').
 * @property {string} courseName - The complete string description of the academic module.
 * @property {'L400_CS_A'|'L400_CS_B'|'L300_CS_A'|'L300_CS_B'} cohort - The exact targeting group assigned to sit for this course.
 * @property {string} lecturer - The designated instructor's full name, acting as a lock parameter for clash detection.
 * @property {number} weeklySlotsRequired - Quantifiable block requirement metric where 1 unit represents a discrete 3-hour structural block.
 * @property {Date} createdAt - Timestamp when the administrative entry was introduced to the tracking system.
 * @property {Date} updatedAt - Timestamp tracking changes made to the constraint bounds.
 */

/**
 * Mongoose Schema blueprint governing administrative schedule demands fed into the greedy conflict constraint resolver.
 * @type {mongoose.Schema<CourseDemand>}
 */
const CourseDemandSchema = new mongoose.Schema({
  courseCode: { 
    type: String, 
    required: true, 
    trim: true 
  },
  courseName: { 
    type: String, 
    required: true 
  },
  cohort: { 
    type: String, 
    required: true, 
    enum: ['L400_CS_A', 'L400_CS_B', 'L300_CS_A', 'L300_CS_B'] 
  },
  lecturer: { 
    type: String, 
    required: true, 
    trim: true 
  },
  weeklySlotsRequired: { 
    type: Number, 
    default: 1 
  }
}, { timestamps: true });

/**
 * Data Access Object mapping explicitly to the 'course_demands' collection.
 * @type {mongoose.Model<CourseDemand>}
 */
export default mongoose.models.CourseDemand || mongoose.model('CourseDemand', CourseDemandSchema, 'course_demands');