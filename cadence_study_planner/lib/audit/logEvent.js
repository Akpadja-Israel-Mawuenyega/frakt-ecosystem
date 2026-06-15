import connectDB from "@/lib/db";
import AuditLog from "@/models/AuditLog";

/**
 * Standardized severity taxonomy, mirroring Frakt's LogSeverity enum.
 */
export const LogSeverity = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
};

/**
 * Central "black box" recorder for Cadence — the same role Frakt's
 * log_event() plays for the analytics service.
 *
 * Never throws: a failed audit write must not break the request it's
 * describing. Errors are swallowed after a console warning.
 *
 * @param {object} params
 * @param {string|null} [params.userId] - Acting user's ObjectId (string), or null for system/anonymous events.
 * @param {string} params.action - Standardized event slug, e.g. "STUDY_SESSION_CREATED".
 * @param {Request} [params.request] - Incoming request, used to derive endpoint/IP/user-agent.
 * @param {number} [params.statusCode] - HTTP status code associated with the event.
 * @param {string} [params.severity] - One of LogSeverity. Defaults to INFO.
 * @param {string} [params.endpoint] - Explicit endpoint path, used when no request is available.
 */
export async function logEvent({
  userId = null,
  action,
  request = null,
  statusCode = 200,
  severity = LogSeverity.INFO,
  endpoint = null,
}) {
  try {
    await connectDB();

    let ipAddress = "0.0.0.0";
    let userAgent = "Unknown";
    let path = endpoint;

    if (request) {
      const forwardedFor = request.headers.get("x-forwarded-for");
      ipAddress =
        (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
        request.headers.get("x-real-ip") ||
        "0.0.0.0";

      userAgent = request.headers.get("user-agent") || "Unknown";

      if (!path) {
        path = new URL(request.url).pathname;
      }
    }

    await AuditLog.create({
      userId,
      action,
      severity,
      endpoint: path,
      statusCode,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error("logEvent failed:", error.message);
  }
}
