import mongoose from "mongoose";

/**
 * Immutable telemetry trail for Cadence.
 *
 * Mirrors the audit pattern used by Frakt's AuditLog/LogSeverity
 * (action/severity/endpoint/statusCode/ip/userAgent/timestamps), adapted
 * to a Mongo-native shape. Doubles as the data source for the admin
 * traffic analytics charts rendered via Frakt.
 */
const AuditLogSchema = new mongoose.Schema(
  {
    /**
     * Actor behind the event. Null for unauthenticated/system events
     * (e.g. a failed login attempt before identity is resolved).
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /**
     * Standardized event slug, e.g. "USER_REGISTERED", "STUDY_SESSION_CREATED".
     */
    action: {
      type: String,
      required: true,
    },

    /**
     * Categorized impact level — INFO, WARNING, ERROR, CRITICAL.
     */
    severity: {
      type: String,
      enum: ["INFO", "WARNING", "ERROR", "CRITICAL"],
      default: "INFO",
    },

    /**
     * API route path that triggered the event.
     */
    endpoint: {
      type: String,
      default: null,
    },

    /**
     * HTTP response code associated with the event.
     */
    statusCode: {
      type: Number,
      default: null,
    },

    /**
     * Originating IPv4/IPv6 address of the requester.
     */
    ipAddress: {
      type: String,
      default: null,
    },

    /**
     * Client user-agent string.
     */
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
