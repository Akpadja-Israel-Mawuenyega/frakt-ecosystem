/**
 * Frakt SVG template used by Cadence: cadence_line_forecast_v1
 *
 * A general-purpose line chart with an optional dashed forecast extension.
 * Cadence registers this template ONCE with Frakt (see setup-frakt.mjs);
 * after that it lives in Frakt's database and Cadence only references it
 * by name over HTTP:
 *
 * - /v1/generate            -> renders the solid "history" line only
 *                              (params: points, stroke_color)
 * - /v1/generate-predictive -> renders the solid history line plus a dashed
 *                              forecast continuation
 *                              (params: points, forecast_x, forecast_y, stroke_color)
 *
 * `metadata.title` (optional) is stamped as a small label in the top-left
 * corner of the chart.
 *
 * The template body is Python executed inside Frakt's RestrictedPython
 * sandbox, which imposes these constraints (see Frakt's worker/generator.py):
 *   - No `for` loops or comprehensions (_getiter_ is not provided)
 *   - No subscript access, e.g. `x[0]` (_getitem_ is not provided)
 *   - No tuple/list unpacking, e.g. `a, b = pair` (_unpack_sequence_ is not provided)
 *   - No augmented assignment, e.g. `x += 1` (_inplacevar_ is not provided)
 *   - `while` loops, method calls (.get/.pop/.append/.join), f-strings,
 *     and plain re-assignment ARE available.
 *
 * The template therefore consumes lists destructively via `.pop(0)` inside
 * `while` loops instead of `for`/indexing.
 */

export const TEMPLATE_NAME = "cadence_line_forecast_v1";

export const TEMPLATE_CODE = `
points = list(params.get("points", []))
forecast_x = list(params.get("forecast_x", []))
forecast_y = list(params.get("forecast_y", []))
stroke = params.get("stroke_color", "#2ecc71")
title = metadata.get("title", "")

history_path = ""
last_x = 0
last_y = 0
first = True
while len(points) > 0:
    p = points.pop(0)
    px = p.pop(0)
    py = p.pop(0)
    if first:
        history_path = "M " + str(px) + " " + str(py)
        first = False
    else:
        history_path = history_path + " L " + str(px) + " " + str(py)
    last_x = px
    last_y = py

forecast_path = ""
if len(forecast_x) > 0:
    forecast_path = "M " + str(last_x) + " " + str(last_y)
    while len(forecast_x) > 0:
        fx = forecast_x.pop(0)
        fy = forecast_y.pop(0)
        forecast_path = forecast_path + " L " + str(fx) + " " + str(fy)

history_line = ""
if history_path != "":
    history_line = (
        '<path d="' + history_path + '" fill="none" stroke="' + stroke
        + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />'
    )

forecast_line = ""
if forecast_path != "":
    forecast_line = (
        '<path d="' + forecast_path + '" fill="none" stroke="' + stroke
        + '" stroke-width="2" stroke-dasharray="6,4" opacity="0.55" stroke-linecap="round" />'
    )

title_text = ""
if title != "":
    title_text = (
        '<text x="50" y="22" font-family="sans-serif" font-size="14" '
        + 'font-weight="600" fill="#333">' + title + '</text>'
    )

svg_output = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 250">'
    + '<rect width="800" height="250" fill="#ffffff" />'
    + title_text
    + history_line
    + forecast_line
    + '</svg>'
)
`;

export const REQUIRED_PARAMS = {
  points:
    "list[[x, y]] - history line coordinates, auto pixel-mapped by /v1/generate and /v1/generate-predictive",
  forecast_x:
    "list[float] - forecast pixel x-coordinates, only present on /v1/generate-predictive responses",
  forecast_y:
    "list[float] - forecast pixel y-coordinates, only present on /v1/generate-predictive responses",
  stroke_color:
    "str - hex color for both the history and forecast line, e.g. '#2ecc71'",
  "title (metadata)":
    "str - optional chart title stamped in the top-left corner",
};
