import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";

import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { logEvent } from "@/lib/audit/logEvent";

const MIN_PASSWORD_LENGTH = 8;

/**
 * PATCH /api/student/profile/password
 *
 * Changes the authenticated user's password.
 *
 * @body {string} currentPassword - The user's current password.
 * @body {string} newPassword - The new password (min 8 characters).
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

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Current and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { success: false, message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const user = await User.findById(session.user.id);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found." },
        { status: 404 }
      );
    }

    if (user.passwordHash === "GOOGLE_OAUTH_ACCOUNT") {
      return NextResponse.json(
        { success: false, message: "This account uses Google Sign-In and has no password to change." },
        { status: 400 }
      );
    }

    const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!currentValid) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    await logEvent({
      userId: user._id,
      action: "PASSWORD_CHANGED",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      { success: true, message: "Password updated successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Change Password Error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update password.", error: error.message },
      { status: 500 }
    );
  }
}
