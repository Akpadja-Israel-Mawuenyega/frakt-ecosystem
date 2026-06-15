import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";

import connectDB from "@/lib/db";
import User from "@/models/User";
import { logEvent } from "@/lib/audit/logEvent";

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/auth/reset-password
 *
 * Completes a password reset: verifies the reset token (hashed and
 * matched against the stored hash) and its expiry, then sets a new
 * password and clears the reset token fields.
 *
 * @body {string} token - Raw reset token from the emailed link.
 * @body {string} newPassword - New password (min 8 characters).
 */
export async function POST(request) {
  try {
    await connectDB();

    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Token and new password are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { success: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "This reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    await logEvent({
      userId: user._id,
      action: "PASSWORD_RESET",
      request,
      statusCode: 200,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your password has been reset. You can now sign in.",
        email: user.email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset Password Error:", error);

    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
