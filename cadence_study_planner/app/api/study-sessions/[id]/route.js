import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import StudySession from "@/models/StudySession";
import { logEvent } from "@/lib/audit/logEvent";

/**
 * ───────────────────────────── STUDY SESSION ITEM API ─────────────────────────────
 *
 * Per-session management for the planner.
 *
 * Responsibilities:
 * - mark sessions complete / incomplete
 * - edit session details
 * - delete sessions
 *
 * All operations are scoped to the authenticated user's own sessions.
 */

/**
 * Loads a session owned by the authenticated user, or returns null.
 */
async function findOwnedSession(id, userId) {
  return StudySession.findOne({ _id: id, userId });
}

/**
 * ───────────────────────────── PATCH /api/study-sessions/[id] ─────────────────────────────
 *
 * Updates a study session.
 *
 * @body {boolean} [completed] - Marks the session done / not done.
 * @body {string} [title] - Updated title.
 * @body {string} [description] - Updated notes/objectives.
 * @body {string} [date] - Updated ISO date.
 * @body {number} [duration] - Updated duration in minutes.
 * @body {"low"|"medium"|"high"} [priority] - Updated priority.
 */
export async function PATCH(request, { params }) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await findOwnedSession(id, session.user.id);

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Study session not found." },
        { status: 404 }
      );
    }

    /**
     * ───────────────────────── FIELD UPDATES ─────────────────────────
     *
     * Only known, allow-listed fields can be patched. Undefined fields
     * are left untouched.
     */
    const updatableFields = [
      "title",
      "description",
      "date",
      "duration",
      "priority",
      "completed",
    ];

    const markedComplete =
      typeof body.completed === "boolean" &&
      body.completed === true &&
      existing.completed === false;

    for (const field of updatableFields) {
      if (body[field] !== undefined) {
        existing[field] = body[field];
      }
    }

    await existing.save();

    /**
     * ───────────────────────── AUDIT TRAIL ─────────────────────────
     */

    await logEvent({
      userId: session.user.id,
      action: markedComplete ? "STUDY_SESSION_COMPLETED" : "STUDY_SESSION_UPDATED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, session: existing },
      { status: 200 }
    );
  } catch (error) {
    console.error("Study Session PATCH Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to update study session.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * ───────────────────────────── DELETE /api/study-sessions/[id] ─────────────────────────────
 *
 * Removes a study session belonging to the authenticated user.
 */
export async function DELETE(request, { params }) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { id } = await params;

    const existing = await findOwnedSession(id, session.user.id);

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Study session not found." },
        { status: 404 }
      );
    }

    await existing.deleteOne();

    await logEvent({
      userId: session.user.id,
      action: "STUDY_SESSION_DELETED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, message: "Study session deleted." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Study Session DELETE Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete study session.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
