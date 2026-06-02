import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Timetable from '@/models/Timetable';

/**
 * GET /api/timetable
 *
 * Fetches the currently active compiled timetable for a given academic year
 * and semester. Defaults to 2025/2026 Semester 2 if no params are supplied.
 *
 * @access Public (add auth middleware if timetable should be staff-only)
 * @queryparam {string} [year="2025/2026"] - Academic year (e.g. ?year=2025/2026)
 * @queryparam {number} [semester=2]       - Semester number (e.g. ?semester=2)
 * @returns {NextResponse} JSON with the timetable document, or 404 if none has been compiled yet.
 */
export async function GET(request) {
  try {
    await connectDB();

    // Read optional query params — falls back to current defaults if omitted,
    // keeping the endpoint fully backwards compatible.
    const { searchParams } = new URL(request.url);
    const academicYear = searchParams.get('year') ?? process.env.ACADEMIC_YEAR ?? "2025/2026";
    const semester = Number(searchParams.get('semester') ?? process.env.SEMESTER ?? 2);

    const timetable = await Timetable.findOne({ academicYear, semester });
    if (!timetable) {
      return NextResponse.json(
        { success: false, message: "No active timetable deployed." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: timetable }, { status: 200 });
  } catch (error) {
    // Surface raw error for debugging — sanitize in production
    console.error("🚨 DATABASE LAYER EXCEPTION:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}