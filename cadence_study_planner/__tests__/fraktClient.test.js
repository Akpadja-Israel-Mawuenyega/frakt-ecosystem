/**
 * Frakt client wrapper tests.
 *
 * The module reads FRAKT_API_URL and FRAKT_API_KEY at import time, so tests
 * that need different env states use jest.resetModules() + require() to get a
 * fresh module binding.  global.fetch is mocked to avoid real HTTP calls.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load a fresh copy of the client module with the given env vars set. */
function loadClient(env = {}) {
  // Clear any previously set Frakt env vars
  delete process.env.FRAKT_API_URL;
  delete process.env.FRAKT_API_KEY;
  delete process.env.FRAKT_CHART_TEMPLATE;

  Object.entries(env).forEach(([k, v]) => {
    process.env[k] = v;
  });

  jest.resetModules();
  return require("../lib/frakt/client.js");
}

/** Build a minimal mock fetch Response. */
function mockResponse(opts = {}) {
  const {
    ok = true,
    status = 200,
    body = "<svg/>",
    headers = {},
  } = opts;

  const headerMap = new Map(Object.entries(headers));

  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(body),
    headers: { get: (k) => headerMap.get(k.toLowerCase()) ?? null },
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.FRAKT_API_URL;
  delete process.env.FRAKT_API_KEY;
  delete process.env.FRAKT_CHART_TEMPLATE;
});

// ---------------------------------------------------------------------------
// isFraktConfigured
// ---------------------------------------------------------------------------
describe("isFraktConfigured", () => {
  test("returns false when both env vars are absent", () => {
    const { isFraktConfigured } = loadClient();
    expect(isFraktConfigured()).toBe(false);
  });

  test("returns false when only URL is set", () => {
    const { isFraktConfigured } = loadClient({ FRAKT_API_URL: "http://frakt" });
    expect(isFraktConfigured()).toBe(false);
  });

  test("returns false when only API key is set", () => {
    const { isFraktConfigured } = loadClient({ FRAKT_API_KEY: "frakt_live_x" });
    expect(isFraktConfigured()).toBe(false);
  });

  test("returns true when both env vars are present", () => {
    const { isFraktConfigured } = loadClient({
      FRAKT_API_URL: "http://frakt",
      FRAKT_API_KEY: "frakt_live_x",
    });
    expect(isFraktConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateChart — unconfigured
// ---------------------------------------------------------------------------
describe("generateChart (not configured)", () => {
  test("resolves { configured: false } without calling fetch", async () => {
    const { generateChart } = loadClient();
    const result = await generateChart({ points: [[0, 10]] });

    expect(result).toEqual({ configured: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateChart — configured, happy path
// ---------------------------------------------------------------------------
describe("generateChart (configured)", () => {
  let generateChart;

  beforeEach(() => {
    ({ generateChart } = loadClient({
      FRAKT_API_URL: "http://frakt-test",
      FRAKT_API_KEY: "frakt_live_testkey",
      FRAKT_CHART_TEMPLATE: "my_template",
    }));
  });

  test("returns configured:true and svg string on success", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse({ body: "<svg>chart</svg>" }));

    const result = await generateChart({
      points: [[0, 10], [1, 20]],
      labels: ["A", "B"],
    });

    expect(result.configured).toBe(true);
    expect(result.svg).toBe("<svg>chart</svg>");
    expect(result.error).toBeUndefined();
  });

  test("sends POST to /v1/generate", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse());

    await generateChart({ points: [[0, 10]] });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe("http://frakt-test/v1/generate");
  });

  test("attaches x-api-key header", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse());

    await generateChart({ points: [[0, 10]] });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers["x-api-key"]).toBe("frakt_live_testkey");
  });

  test("includes template_name from env in request body", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse());

    await generateChart({ points: [[0, 10]] });

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.template_name).toBe("my_template");
  });

  test("returns error detail when Frakt responds with non-ok status", async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, body: "Quota exceeded" })
    );

    const result = await generateChart({ points: [[0, 10]] });

    expect(result.configured).toBe(true);
    expect(result.error).toContain("403");
    expect(result.svg).toBeUndefined();
  });

  test("returns error when fetch throws (e.g. network failure)", async () => {
    global.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await generateChart({ points: [[0, 10]] });

    expect(result.configured).toBe(true);
    expect(result.error).toBe("ECONNREFUSED");
  });

  test("returns timeout error when AbortController fires", async () => {
    // Simulate AbortError — the same object fetch throws when signal aborts
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    global.fetch.mockRejectedValueOnce(abortError);

    const result = await generateChart({ points: [[0, 10]] });

    expect(result.configured).toBe(true);
    expect(result.error).toMatch(/timed out/i);
  });
});

// ---------------------------------------------------------------------------
// generatePredictiveChart — AI metadata header extraction
// ---------------------------------------------------------------------------
describe("generatePredictiveChart (configured)", () => {
  let generatePredictiveChart;

  beforeEach(() => {
    ({ generatePredictiveChart } = loadClient({
      FRAKT_API_URL: "http://frakt-test",
      FRAKT_API_KEY: "frakt_live_testkey",
    }));
  });

  test("sends POST to /v1/generate-predictive", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse());

    await generatePredictiveChart({ points: [[0, 10]], aiMethod: "auto" });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe("http://frakt-test/v1/generate-predictive");
  });

  test("extracts all four AI metadata headers", async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        body: "<svg>forecast</svg>",
        headers: {
          "x-ai-model": "polynomial",
          "x-ai-confidence": "0.87",
          "x-ai-is-growth": "true",
          "x-usage-charged": "2",
        },
      })
    );

    const result = await generatePredictiveChart({
      points: [[0, 10], [1, 20]],
      aiMethod: "auto",
    });

    expect(result.configured).toBe(true);
    expect(result.svg).toBe("<svg>forecast</svg>");
    expect(result.aiModel).toBe("polynomial");
    expect(result.confidence).toBe(0.87);
    expect(result.isGrowth).toBe(true);
    expect(result.usageCharged).toBe(2);
  });

  test("isGrowth is false when header is 'false'", async () => {
    global.fetch.mockResolvedValueOnce(
      mockResponse({
        headers: {
          "x-ai-model": "linear",
          "x-ai-confidence": "0.55",
          "x-ai-is-growth": "false",
          "x-usage-charged": "2",
        },
      })
    );

    const result = await generatePredictiveChart({ points: [[0, 10]] });

    expect(result.isGrowth).toBe(false);
  });

  test("missing AI headers default to safe zero values", async () => {
    // Frakt may omit headers on certain error paths
    global.fetch.mockResolvedValueOnce(mockResponse({ headers: {} }));

    const result = await generatePredictiveChart({ points: [[0, 10]] });

    expect(result.aiModel).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.isGrowth).toBe(false);
    expect(result.usageCharged).toBe(0);
  });

  test("passes ai_method in request body", async () => {
    global.fetch.mockResolvedValueOnce(mockResponse());

    await generatePredictiveChart({ points: [[0, 10]], aiMethod: "seasonal" });

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.ai_method).toBe("seasonal");
  });
});
