// app/api/scholar/search/route.js
import { NextResponse } from 'next/server';

/**
 * Reconstructs a plain text abstract from OpenAlex's inverted index format.
 * OpenAlex stores abstracts as { word: [position1, position2] } maps
 * rather than plain strings — this converts them back to readable text.
 *
 * @param {Object|null} invertedIndex - The abstract_inverted_index field from OpenAlex.
 * @returns {string} A readable abstract string, or a fallback if unavailable.
 */
const reconstructAbstract = (invertedIndex) => {
  if (!invertedIndex) return "Abstract not available.";

  const index = {};
  for (const [word, positions] of Object.entries(invertedIndex)) {
    positions.forEach(pos => { index[pos] = word; });
  }

  return Object.keys(index)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map(pos => index[pos])
    .join(" ");
};

/**
 * GET /api/scholar/search
 *
 * Queries the OpenAlex API for academic works related to a search term.
 * Returns results formatted to match the learningResources shape used
 * throughout Cadence, for seamless injection into the AI study planner.
 *
 * No API key required — OpenAlex is free and open access.
 *
 * @queryparam {string} q - The search term (e.g. a course name or topic).
 * @queryparam {number} [limit=3] - Max results to return per query (default 3).
 * @returns {NextResponse} JSON array of formatted academic resources.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = Number(searchParams.get('limit') ?? 3);

    if (!query) {
      return NextResponse.json(
        { success: false, message: "Missing search query parameter 'q'." },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}&select=title,abstract_inverted_index`,
      {
        headers: {
          // OpenAlex requests you identify your app — good practice, not required
          "User-Agent": "Cadence/1.0 (academic study planner)"
        }
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: "OpenAlex API request failed." },
        { status: 502 }
      );
    }

    const data = await res.json();

    const resources = data.results?.map(work => ({
      title: work.title ?? "Untitled",
      type: "Academic Paper",
      contentData: reconstructAbstract(work.abstract_inverted_index)
    })) ?? [];

    return NextResponse.json({ success: true, data: resources }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}