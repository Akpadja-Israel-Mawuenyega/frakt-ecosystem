import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import StudentProfile from "@/models/StudentProfile";
import { logEvent } from "@/lib/audit/logEvent";

const VALID_TYPES = ["url", "text", "scholar_paper"];

/**
 * GET /api/student/profile/resources
 *
 * Returns the authenticated student's learningResources — academic
 * material (OpenAlex papers, notes, links) attached to their profile
 * for the AI study planner to draw on.
 */
export async function GET() {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const profile = await StudentProfile.findOne({ userId: session.user.id });

    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Student profile not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: profile.learningResources },
      { status: 200 }
    );
  } catch (error) {
    console.error("Learning resources fetch error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/student/profile/resources
 *
 * Attaches a new learning resource to the authenticated student's
 * profile — used to save OpenAlex search results from /api/scholar/search,
 * as well as manually added links or notes.
 *
 * @body {string} title
 * @body {'url'|'text'|'scholar_paper'} type
 * @body {string} contentData
 */
export async function POST(request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { title, type, contentData } = await request.json();

    if (!title || !contentData || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, message: "Invalid learning resource." },
        { status: 400 }
      );
    }

    const profile = await StudentProfile.findOneAndUpdate(
      { userId: session.user.id },
      { $push: { learningResources: { title, type, contentData } } },
      { returnDocument: "after" }
    );

    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Student profile not found." },
        { status: 404 }
      );
    }

    await logEvent({
      userId: session.user.id,
      action: "LEARNING_RESOURCE_ADDED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, data: profile.learningResources },
      { status: 200 }
    );
  } catch (error) {
    console.error("Learning resource add error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/student/profile/resources
 *
 * Removes a learning resource from the authenticated student's profile.
 *
 * @body {string} resourceId - The `_id` of the learningResources subdocument to remove.
 */
export async function DELETE(request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { resourceId } = await request.json();

    if (!resourceId) {
      return NextResponse.json(
        { success: false, message: "Missing resourceId." },
        { status: 400 }
      );
    }

    const profile = await StudentProfile.findOneAndUpdate(
      { userId: session.user.id },
      { $pull: { learningResources: { _id: resourceId } } },
      { returnDocument: "after" }
    );

    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Student profile not found." },
        { status: 404 }
      );
    }

    await logEvent({
      userId: session.user.id,
      action: "LEARNING_RESOURCE_REMOVED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, data: profile.learningResources },
      { status: 200 }
    );
  } catch (error) {
    console.error("Learning resource delete error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
