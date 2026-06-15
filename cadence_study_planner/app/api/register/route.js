import { NextResponse } from 'next/server';

import bcrypt from 'bcryptjs';

import { nanoid } from 'nanoid';

import connectDB from '@/lib/db';

import User from '@/models/User';
import StudentProfile from '@/models/StudentProfile';
import { logEvent } from '@/lib/audit/logEvent';

/**
 * ───────────────────────────── REGISTER ROUTE ─────────────────────────────
 * Creates:
 * - User authentication identity
 * - Student academic profile
 *
 * Architecture:
 * User → authentication + authorization
 * StudentProfile → academic intelligence layer
 *
 * Default role:
 * - student
 */
export async function POST(request) {

  try {

    /**
     * Ensure database connection.
     */
    await connectDB();

    /**
     * Parse request payload.
     */
    const body = await request.json();

    const {
      name,
      email,
      password
    } = body;


    const studentId = `STU-${nanoid(8)}`;
    const cohort = "UNASSIGNED";

    /**
     * ───────────────────────── VALIDATION ─────────────────────────
     */

    if (
      !name ||
      !email ||
      !password
    ) {

      return NextResponse.json(
        {
          success: false,
          message: 'Missing required registration fields.'
        },
        {
          status: 400
        }
      );
    }

    /**
     * Normalize email.
     */
    const normalizedEmail = email
      .toLowerCase()
      .trim();

    /**
     * Prevent duplicate accounts.
     */
    const existingUser = await User.findOne({
      email: normalizedEmail
    });

    if (existingUser) {

      return NextResponse.json(
        {
          success: false,
          message: 'Account already exists.'
        },
        {
          status: 409
        }
      );
    }

    /**
     * Prevent duplicate student profiles.
     */
    const existingStudent = await StudentProfile.findOne({
      studentId
    });

    if (existingStudent) {

      return NextResponse.json(
        {
          success: false,
          message: 'Student ID already registered.'
        },
        {
          status: 409
        }
      );
    }

    /**
     * ───────────────────── PASSWORD SECURITY ─────────────────────
     */

    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    /**
     * ───────────────────────── CREATE USER ────────────────────────
     */

    const user = await User.create({

      name,

      email: normalizedEmail,

      passwordHash: hashedPassword,

      role: 'student'
    });

    /**
     * ─────────────────── CREATE STUDENT PROFILE ───────────────────
     */

    await StudentProfile.create({

      userId: user._id,

      studentId,

      name,

      cohort,

      enrolledCourses: [],

      learningResources: [],

      preferences: {}
    });

    /**
     * ───────────────────────── AUDIT TRAIL ─────────────────────────
     */

    await logEvent({
      userId: user._id,
      action: 'USER_REGISTERED',
      request,
      statusCode: 201,
    });

    /**
     * ───────────────────────── SUCCESS RESPONSE ───────────────────
     */

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully.'
      },
      {
        status: 201
      }
    );

  } catch (error) {

    console.error(
      'Registration Error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: 'Registration failed.',
        error: error.message
      },
      {
        status: 500
      }
    );
  }
}