/**
 * Thin client for the Frakt analytics service.
 *
 * Wraps Frakt's `/v1/generate` and `/v1/generate-predictive` SVG endpoints
 * so the rest of Cadence can request a chart without knowing about Frakt's
 * auth headers, pixel-scaling contract, or AI response headers.
 *
 * Frakt is an optional integration: if FRAKT_API_URL / FRAKT_API_KEY are not
 * configured, every export here resolves to `{ configured: false }` instead
 * of throwing, so callers can render an empty state instead of failing.
 */

const FRAKT_API_URL = process.env.FRAKT_API_URL;
const FRAKT_API_KEY = process.env.FRAKT_API_KEY;
const FRAKT_CHART_TEMPLATE =
  process.env.FRAKT_CHART_TEMPLATE || "cadence_line_forecast_v1";

// Frakt's own worker enforces a ~2s sandbox execution cap, so a healthy
// response is fast. 8s gives headroom for network/cold starts while still
// failing well before a page load feels "stuck".
const FRAKT_TIMEOUT_MS = 8000;

/**
 * Whether Frakt credentials are present in the environment.
 *
 * @returns {boolean}
 */
export function isFraktConfigured() {
  return Boolean(FRAKT_API_URL && FRAKT_API_KEY);
}

/**
 * Posts a payload to a Frakt SVG endpoint.
 *
 * @param {string} path - "/v1/generate" or "/v1/generate-predictive".
 * @param {object} body - Request payload matching Frakt's SvgGenerationRequest schema.
 * @returns {Promise<{configured: boolean, response?: Response, error?: string}>}
 */
async function postToFrakt(path, body) {
  if (!isFraktConfigured()) {
    return { configured: false };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FRAKT_TIMEOUT_MS);

  try {
    const response = await fetch(`${FRAKT_API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": FRAKT_API_KEY,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        configured: true,
        status: response.status,
        error: `Frakt responded with ${response.status}: ${detail}`,
      };
    }

    return { configured: true, response };
  } catch (error) {
    if (error.name === "AbortError") {
      return { configured: true, error: "Frakt request timed out." };
    }
    return { configured: true, error: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Renders a plain history-line chart via Frakt's `/v1/generate` endpoint.
 *
 * @param {object} options
 * @param {Array<[number, number]>} options.points - `[x, y]` coordinate pairs.
 * @param {Array<string>} [options.labels] - X-axis labels, one per point.
 * @param {string} [options.title] - Chart title rendered into the SVG.
 * @param {string} [options.strokeColor] - Line color (hex).
 * @returns {Promise<{configured: boolean, svg?: string, error?: string}>}
 */
export async function generateChart({
  points,
  labels,
  title,
  strokeColor = "#2ecc71",
}) {
  const result = await postToFrakt("/v1/generate", {
    template_name: FRAKT_CHART_TEMPLATE,
    params: { points, stroke_color: strokeColor },
    labels,
    metadata: { title },
  });

  if (!result.configured || result.error) {
    return result;
  }

  return { configured: true, svg: await result.response.text() };
}

/**
 * Renders a history + AI-forecast chart via Frakt's `/v1/generate-predictive`
 * endpoint.
 *
 * Beyond the SVG, Frakt's PredictiveEngine surfaces its trend analysis via
 * response headers (`X-AI-Model`, `X-AI-Confidence`, `X-AI-Is-Growth`,
 * `X-Usage-Charged`) — these are returned alongside the SVG so callers can
 * derive a "preparedness" verdict from the same prediction that draws the
 * dashed forecast line.
 *
 * @param {object} options
 * @param {Array<[number, number]>} options.points - `[x, y]` coordinate pairs.
 * @param {Array<string>} [options.labels] - X-axis labels, one per history point.
 * @param {string} [options.title] - Chart title rendered into the SVG.
 * @param {string} [options.strokeColor] - Line color (hex).
 * @param {"auto"|"linear"|"polynomial"|"seasonal"} [options.aiMethod] - Forecast model selection.
 * @returns {Promise<{configured: boolean, svg?: string, error?: string, aiModel?: string, confidence?: number, isGrowth?: boolean, usageCharged?: number}>}
 */
export async function generatePredictiveChart({
  points,
  labels,
  title,
  strokeColor = "#3498db",
  aiMethod = "auto",
}) {
  const result = await postToFrakt("/v1/generate-predictive", {
    template_name: FRAKT_CHART_TEMPLATE,
    params: { points, stroke_color: strokeColor },
    labels,
    ai_method: aiMethod,
    metadata: { title },
  });

  if (!result.configured || result.error) {
    return result;
  }

  const { response } = result;

  return {
    configured: true,
    svg: await response.text(),
    aiModel: response.headers.get("x-ai-model") || null,
    confidence: Number(response.headers.get("x-ai-confidence")) || 0,
    isGrowth: response.headers.get("x-ai-is-growth") === "true",
    usageCharged: Number(response.headers.get("x-usage-charged")) || 0,
  };
}
