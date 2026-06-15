// app/api/student/profile/route.js
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import StudentProfile from '@/models/StudentProfile';
import { logEvent } from '@/lib/audit/logEvent';

/**
 * PATCH /api/student/profile
 *
 * Updates the authenticated student's cohort and enrolled courses.
 * Called from the profile setup page after registration, and
 * optionally from the dashboard settings at any time.
 *
 * @body {string} cohort - The student's selected cohort.
 * @body {Array<{code: string, name: string}>} enrolledCourses - Course list.
 * @returns {NextResponse} Updated student profile document.
 */
export async function PATCH(request) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { cohort, enrolledCourses } = await request.json();

    if (!cohort || !Array.isArray(enrolledCourses)) {
      return NextResponse.json(
        { success: false, message: "Invalid profile data." },
        { status: 400 }
      );
    }

    const updated = await StudentProfile.findOneAndUpdate(
      { userId: session.user.id },
      { cohort, enrolledCourses },
      { returnDocument: "after" }
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, message: "Student profile not found." },
        { status: 404 }
      );
    }

    await logEvent({
      userId: session.user.id,
      action: "PROFILE_UPDATED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, data: updated },
      { status: 200 }
    );

  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}