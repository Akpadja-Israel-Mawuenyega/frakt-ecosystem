import mongoose from 'mongoose';
import CourseReferenceSchema from '@/models/shared/CourseReference';

/**
 * ───────────────────────────── LEARNING RESOURCE ────────────────────────────
 * AI-ingestible academic resource attached to a student profile.
 *
 * Supports:
 * - URLs
 * - Uploaded text notes
 * - OpenAlex papers
 * - Future embeddings/vectorization
 *
 * @typedef {Object} LearningResource
 * @property {string} title - Human-readable display title.
 * @property {'url'|'text'|'scholar_paper'} type - Resource classification.
 * @property {string} contentData - Core payload content.
 * @property {Date} addedAt - Resource insertion timestamp.
 */
const LearningResourceSchema = new mongoose.Schema({

  title: {
    type: String,
    required: true,
    trim: true
  },

  type: {
    type: String,
    enum: ['url', 'text', 'scholar_paper'],
    required: true
  },

  contentData: {
    type: String,
    required: true
  },

  addedAt: {
    type: Date,
    default: Date.now
  }

});

/**
 * ───────────────────────────── STUDENT PROFILE ──────────────────────────────
 * Centralized academic + AI personalization profile.
 *
 * Powers:
 * - AI study planner
 * - Personal timetable generation
 * - Resource indexing
 * - Future recommendation systems
 * - Adaptive scheduling
 *
 * @typedef {Object} StudentProfile
 * @property {mongoose.Types.ObjectId} _id - MongoDB document ID.
 * @property {mongoose.Types.ObjectId} userId - Reference to the associated User account.
 * @property {string} studentId - Institutional student identifier (e.g., matric number).
 * @property {string} name - Full legal name of the student.
 * @property {string} cohort - Cohort identifier matching timetable assignments (e.g., "Level 300 CS A").
 * @property {CourseReference[]} enrolledCourses - Array of courses the student is enrolled in, using the canonical CourseReference structure.
 * @property {LearningResource[]} learningResources - Array of AI-ingestible academic resources attached to the student profile.
 * @property {Object} preferences - Optional AI preference payload for future personalized scheduling features (e.g., preferredStudyTime, avoidFridays).
 * @property {Date} createdAt - Timestamp of when the profile was created.
 * @property {Date} updatedAt - Timestamp of when the profile was last updated.
 */
const StudentProfileSchema = new mongoose.Schema({

  /**
   * Authentication account linkage.
   */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  /**
   * Institutional registry number.
   */
  studentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  /**
   * Full legal student name.
   */
  name: {
    type: String,
    required: true,
    trim: true
  },

  /**
   * Cohort identifier matching timetable assignments.
   *
   * Example:
   * "Level 300 CS A"
   */
  cohort: {
    type: String,
    required: true,
    trim: true
  },

  /**
   * Canonical enrolled course array.
   *
   * Uses SAME structure as institutional timetable engine.
   */
  enrolledCourses: {
    type: [CourseReferenceSchema],
    default: []
  },

  /**
   * AI planner academic context resources.
   */
  learningResources: {
    type: [LearningResourceSchema],
    default: []
  }, 

  /**
   * Optional AI preference payload for future personalized scheduling features.
   */
  preferences: {
    type: new mongoose.Schema({
      preferredStudyTime: {
        type: String,
        enum: ['morning', 'afternoon', 'evening'],
        default: 'evening'
      },

      avoidFridays: {
        type: Boolean,
        default: false
      },

      maxDailyStudyBlocks: {
        type: Number,
        default: 2,
        min: 1,
        max: 6
      }

    }, { _id: false }),

    default: () => ({})
  }
}, {
  timestamps: true
});

/**
 * ───────────────────────────── MODEL EXPORT ─────────────────────────────
 */
const StudentProfile =
  mongoose.models.StudentProfile ||
  mongoose.model(
    'StudentProfile',
    StudentProfileSchema,
    'student_profiles'
  );

export default StudentProfile;