import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import connectDB from "@/lib/db";

import StudySession from "@/models/StudySession";

/**
 * ───────────────────────────── STUDY SESSION API ─────────────────────────────
 *
 * Central planner session management route.
 *
 * Responsibilities:
 * - fetch planner sessions
 * - create manual sessions
 * - future session updates
 * - planner analytics foundation
 *
 * Architecture:
 *
 * User
 *   ↓
 * StudySession
 *   ↓
 * Planner UI / Calendar / AI
 */

/**
 * ───────────────────────────── GET /api/study-sessions ─────────────────────────────
 *
 * Fetches all sessions belonging to
 * the authenticated user.
 *
 * Used by:
 * - planner dashboard
 * - calendar rendering
 * - analytics
 * - AI workload analysis
 */
export async function GET() {
  try {
    /**
     * ───────────────────────── DATABASE ─────────────────────────
     */

    await connectDB();

    /**
     * ───────────────────────── AUTH ─────────────────────────
     */

    const session = await getServerSession(
      authOptions
    );

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /**
     * ───────────────────────── FETCH SESSIONS ─────────────────────────
     */

    const sessions =
      await StudySession.find({
        userId: session.user.id,
      }).sort({
        date: 1,
      });

    /**
     * ───────────────────────── SUCCESS RESPONSE ─────────────────────────
     */

    return NextResponse.json(
      {
        success: true,

        sessions,
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    /**
     * ───────────────────────── ERROR HANDLER ─────────────────────────
     */

    console.error(
      "Study Session GET Error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Failed to fetch study sessions.",

        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * ───────────────────────────── POST /api/study-sessions ─────────────────────────────
 *
 * Creates a manual study session.
 *
 * This complements AI-generated sessions
 * by allowing students to manually plan
 * custom study blocks.
 */
export async function POST(request) {
  try {
    /**
     * ───────────────────────── DATABASE ─────────────────────────
     */

    await connectDB();

    /**
     * ───────────────────────── AUTH ─────────────────────────
     */

    const session = await getServerSession(
      authOptions
    );

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    /**
     * ───────────────────────── REQUEST BODY ─────────────────────────
     */

    const body = await request.json();

    const {
      course,
      title,
      description,
      date,
      duration,
      priority,
    } = body;

    /**
     * ───────────────────────── VALIDATION ─────────────────────────
     */

    if (
      !course ||
      !title ||
      !date
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing required session fields.",
        },
        {
          status: 400,
        }
      );
    }

    /**
     * ───────────────────────── CREATE SESSION ─────────────────────────
     */

    const createdSession =
      await StudySession.create({
        userId: session.user.id,

        course,

        title,

        description:
          description || "",

        date,

        duration:
          duration || 60,

        priority:
          priority || "medium",

        completed: false,

        source: "manual",
      });

    /**
     * ───────────────────────── SUCCESS RESPONSE ─────────────────────────
     */

    return NextResponse.json(
      {
        success: true,

        message:
          "Study session created successfully.",

        session: createdSession,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    /**
     * ───────────────────────── ERROR HANDLER ─────────────────────────
     */

    console.error(
      "Study Session POST Error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Failed to create study session.",

        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}