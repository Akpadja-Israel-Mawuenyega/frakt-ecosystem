import { NextResponse } from "next/server";
import crypto from "crypto";

import connectDB from "@/lib/db";
import User from "@/models/User";
import { logEvent } from "@/lib/audit/logEvent";
import { sendMail } from "@/lib/mail/sendMail";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a password reset link.";

/**
 * POST /api/auth/forgot-password
 *
 * Starts a password reset: if a (non-OAuth) account exists for the given
 * email, generates a reset token, stores its hash + expiry on the user,
 * and emails a reset link. Always responds with the same generic message
 * so callers can't enumerate registered emails.
 *
 * @body {string} email - Account email address.
 */
export async function POST(request) {
  try {
    await connectDB();

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (user && user.passwordHash !== "GOOGLE_OAUTH_ACCOUNT") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      user.resetPasswordTokenHash = tokenHash;
      user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();

      const origin = new URL(request.url).origin;
      const resetUrl = `${origin}/reset-password?token=${rawToken}`;

      await sendMail({
        to: user.email,
        subject: "Reset your Cadence password",
        text: `We received a request to reset your Cadence password.\n\nReset it here (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #1e293b;">Reset your Cadence password</h2>
            <p style="color: #475569;">We received a request to reset your Cadence password. This link is valid for 1 hour.</p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}" style="background: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Reset password
              </a>
            </p>
            <p style="color: #94a3b8; font-size: 13px;">
              If the button doesn't work, copy and paste this link into your browser:<br />
              <a href="${resetUrl}" style="color: #7c3aed;">${resetUrl}</a>
            </p>
            <p style="color: #94a3b8; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });

      await logEvent({
        userId: user._id,
        action: "PASSWORD_RESET_REQUESTED",
        request,
        statusCode: 200,
      });
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE }, { status: 200 });
  } catch (error) {
    console.error("Forgot Password Error:", error);

    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
