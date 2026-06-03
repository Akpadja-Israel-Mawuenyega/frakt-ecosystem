import mongoose from "mongoose";

/**
 * Individual scheduled study block.
 * Core unit of the planner engine.
 */
const StudySessionSchema = new mongoose.Schema(
  {
    /**
     * Session owner.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Related academic course.
     */
    course: {
      code: {
        type: String,
        required: true,
      },

      name: {
        type: String,
        required: true,
      },
    },

    /**
     * Session title.
     */
    title: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Optional notes/objectives.
     */
    description: {
      type: String,
      default: "",
    },

    /**
     * Scheduled date.
     */
    date: {
      type: Date,
      required: true,
      index: true,
    },

    /**
     * Session duration in minutes.
     */
    duration: {
      type: Number,
      required: true,
      default: 60,
    },

    /**
     * Session intensity/importance.
     */
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    /**
     * Completion tracking.
     */
    completed: {
      type: Boolean,
      default: false,
    },

    /**
     * AI-generated or manually created.
     */
    source: {
      type: String,
      enum: ["manual", "ai"],
      default: "manual",
    },
  },
  {
    timestamps: true,
  }
);

export default
  mongoose.models.StudySession ||
  mongoose.model("StudySession", StudySessionSchema);