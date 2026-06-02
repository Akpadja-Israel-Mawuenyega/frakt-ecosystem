import mongoose from 'mongoose';

/**
 * @typedef {Object} LearningResource
 * @property {string} title - The display name of the resource (e.g., Paper title, web bookmark name).
 * @property {'url'|'text'|'scholar_paper'} type - The architectural format classification of the target payload.
 * @property {string} contentData - The contextual storage payload (URL string, raw text blocks, or abstract metadata).
 * @property {Date} addedAt - The timestamp when this resource vector was appended to the profile.
 */

/**
 * @typedef {Object} StudentProfile
 * @property {mongoose.Types.ObjectId} _id - The unique identifier for this profile.
 * @property {mongoose.Types.ObjectId} userId - Reference linking directly back to the matching credential record in the User collection.
 * @property {string} studentId - The official academic registry index number for the student.
 * @property {string} name - The student's full name.
 * @property {string} cohort - The academic track identifier matching structural master timetable slots (e.g., 'L400_CS_A').
 * @property {string[]} enrolledCourses - Array of course codes currently assigned to this student context for AI indexing.
 * @property {LearningResource[]} learningResources - Embedded document array hosting the student's scraped or uploaded study assets.
 * @property {Date} createdAt - Profile generation timestamp.
 * @property {Date} updatedAt - Last database update timestamp.
 */

/**
 * Mongoose Schema blueprint governing localized student academic parameters and AI study planner source arrays.
 * @type {mongoose.Schema<StudentProfile>}
 */
const StudentProfileSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  studentId: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  cohort: { 
    type: String, 
    required: true 
  },
  enrolledCourses: [{ 
    type: String, 
    trim: true 
  }],
  learningResources: [{
    title: { type: String, required: true },
    type: { type: String, enum: ['url', 'text', 'scholar_paper'], required: true },
    contentData: { type: String, required: true },
    addedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

/**
 * Data Access Object mapping explicitly to the 'student_profiles' collection.
 * @type {mongoose.Model<StudentProfile>}
 */
export default mongoose.models.StudentProfile || mongoose.model('StudentProfile', StudentProfileSchema, 'student_profiles');