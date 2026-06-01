# service_python/app/routers/utils.py
"""
Frakt Route Utilities.

A centralized collection of stateless logic used across the generation
and management routers. This module handles coordinate mapping,
AI-driven label extension, and secure credential provisioning.

Architecture Note:
All SVG rendering logic (scaling, mapping, and asset stamping) uses a
unified coordinate system to ensure consistency between the Python
generation worker and the FastAPI middleware.
"""

import re
import secrets

from fastapi import Request
from httpx import AsyncClient
from app.middleware.middleware import hash_api_key


# =============================================================================
# SECTION 1: AUTHENTICATION & SECURITY
# =============================================================================
def generate_secure_api_key(prefix: str = "frakt_live") -> tuple[str, str]:
    """
    Generates a high-entropy API key and its corresponding SHA-256 hash.

    Returns:
        tuple: (raw_key, hashed_key)
    """
    # 32 bytes of randomness = ~43 characters of entropy
    token = secrets.token_urlsafe(32)
    raw_key = f"{prefix}_{token}"

    # One-way hash for DB storage
    hashed_key = hash_api_key(raw_key)

    return raw_key, hashed_key


# =============================================================================
# SECTION 2: MATHEMATICAL MAPPING & SCALING
# =============================================================================
def extend_labels_for_forecast(user_labels: list, forecast_count: int) -> list:
    """
    Intelligently extends labels for stocks, dates, or generic steps.
    """
    if not user_labels or forecast_count <= 0:
        return user_labels

    extended = list(user_labels)
    last_val = user_labels[-1]

    # 1. Numeric/Stock Price Logic: (e.g., ["180", "190"] -> "200", "210")
    try:
        if len(user_labels) >= 2:
            v2, v1 = float(user_labels[-1]), float(user_labels[-2])
            step = v2 - v1
            for i in range(1, forecast_count + 1):
                new_val = v2 + (step * i)
                # Format: remove .0 if it's an integer, else round to 2 decimals
                label = str(int(new_val) if new_val.is_integer() else round(new_val, 2))
                extended.append(label)
            return extended
    except (ValueError, TypeError):
        pass

    # 2. Calendar Logic: (e.g., ["Oct", "Nov", "Dec"] -> "Jan", "Feb")
    months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ]
    if str(last_val) in months:
        idx = months.index(str(last_val))
        for i in range(1, forecast_count + 1):
            extended.append(months[(idx + i) % 12])
        return extended

    # 3. Fallback: (e.g., ["Batch A"] -> "Batch A+1")
    for i in range(1, forecast_count + 1):
        extended.append(f"{last_val}+{i}")

    return extended


def calculate_clean_scale(all_y_values: list):
    """
    Returns a fixed coordinate system.
    Ideal for comparing multiple charts side-by-side.
    """
    # 1. HARDCODED BOUNDARIES: Define your "Graph Sheet"
    # These could be pulled from a user-specific config in your DB
    y_min_calc = 0
    y_max_calc = 300  # Or whatever your "ceiling" is

    # 2. FIXED STEPS: Always 100, 200, 300 etc.
    # No more $83.33 or $153 labels.
    clean_step = (y_max_calc - y_min_calc) / 3
    steps = [y_min_calc + (i * clean_step) for i in range(4)]

    y_range_calc = y_max_calc - y_min_calc

    return y_min_calc, y_range_calc, steps


def map_to_pixel(val, y_min, y_range, height):
    """
    Maps a data value to an SVG Y-coordinate.
    """
    padding = 20  # Keep points 20px away from the top/bottom edges
    usable_height = height - (padding * 2)

    # Normalized position (0.0 to 1.0)
    relative_pos = (val - y_min) / y_range

    # Map to the "Safe Zone" (20px to 230px if height is 250)
    return height - (padding + (relative_pos * usable_height))


def append_svg_assets(
    svg_content: str, labels: list, raw_points: list, history_count: int = None
) -> str:
    """
    Unified stamper using EXACT user-provided coordinates for data points.

    Args:
        svg_content: The raw SVG XML.
        labels: List of strings for the X-axis.
        raw_points: The original [[x, y], [x, y]] data from the request.
        history_count: Index where forecast starts.
    """
    if not raw_points:
        return svg_content

    # 1. Parse ViewBox
    vb_match = re.search(r'viewBox=["\']\d+\s+\d+\s+(\d+)\s+(\d+)["\']', svg_content)
    width, height = (
        (float(vb_match.group(1)), float(vb_match.group(2))) if vb_match else (800, 250)
    )

    # 2. Extract Values
    y_vals = [p[1] if isinstance(p, list) else p for p in raw_points]

    # Shared Scale Logic
    y_min_calc, y_range_calc, steps = calculate_clean_scale(y_vals)

    # --- PART A: Y-AXIS SCALE ---
    y_axis_xml = '<g id="y-axis" font-family="sans-serif" font-size="10" fill="#AAA" text-anchor="start">'
    for val in steps:
        y_pos = map_to_pixel(val, y_min_calc, y_range_calc, height)
        y_axis_xml += f'<text x="5" y="{y_pos + 4}">${int(val)}</text>'
    y_axis_xml += "</g>"

    # --- PART B: INTERACTIVE DATA POINTS ---
    dots_xml = '<g id="interactive-points">'
    margin_left = 50
    draw_width = width - 70

    # We need the total count of labels to calculate spacing correctly
    num_labels = len(labels)
    x_step = draw_width / (num_labels - 1) if num_labels > 1 else 0

    for i, curr_y_val in enumerate(y_vals):
        # CALCULATE X: Use the exact same math as the X-axis labels
        curr_x = margin_left + (i * x_step)

        # Map Y value using the shared pixel mapper
        y_pos = map_to_pixel(curr_y_val, y_min_calc, y_range_calc, height)

        # Determine color (history vs forecast)
        is_forecast = history_count is not None and i >= history_count
        fill_color = "#2ecc71" if not is_forecast else "#94dfb1"

        label_text = labels[i] if i < len(labels) else f"Point {i+1}"

        # THE FIX: Ensure cx="{curr_x}" is explicitly written
        dots_xml += f"""
        <circle cx="{curr_x}" cy="{y_pos}" r="5" fill="{fill_color}" stroke="white" stroke-width="2">
            <title>{label_text}: ${curr_y_val}</title>
        </circle>"""
    dots_xml += "</g>"

    # --- PART C: X-AXIS LABELS ---
    x_labels_xml = '<g id="x-labels" font-family="sans-serif" font-size="11" fill="#888" text-anchor="middle">'
    margin_left = 50
    draw_width = width - 70
    for i, text in enumerate(labels):
        x_pos = (
            margin_left + (i * (draw_width / (len(labels) - 1)))
            if len(labels) > 1
            else margin_left
        )
        x_labels_xml += f'<text x="{x_pos}" y="{height - 10}">{text}</text>'
    x_labels_xml += "</g>"

    # --- PART D: FORECAST BOUNDARY (Restored) ---
    boundary_xml = ""
    if history_count is not None and history_count < len(labels):
        # Calculate X based on the same logic used for dots/labels
        split_x = margin_left + ((history_count - 1) * (draw_width / (len(labels) - 1)))
        boundary_xml = f"""
        <g id="forecast-boundary">
            <line x1="{split_x}" y1="10" x2="{split_x}" y2="{height - 35}" stroke="#ccc" stroke-width="1" stroke-dasharray="4" />
            <text x="{split_x + 5}" y="25" font-size="10" fill="#aaa">Forecast</text>
        </g>
        """

    # Final Injection
    combined = f"{y_axis_xml}{x_labels_xml}{boundary_xml}{dots_xml}"
    return svg_content.replace("</svg>", f"{combined}</svg>")


# =============================================================================
# SECTION 4: INFRASTRUCTURE & WORKER ACCESS
# =============================================================================
def get_worker(request: Request) -> AsyncClient:
    """
    Dependency provider for the sandboxed Worker execution client.

    Retrieves the persistent 'httpx.AsyncClient' from the application state.
    This client is initialized during the 'lifespan' startup sequence to
    utilize a High-Performance Unix Domain Socket (UDS) transport.

    Using this dependency ensures that the application leverages connection
    pooling rather than instantiating a new client per request, significantly
    reducing the latency of inter-container communication.

    Args:
        request (Request): The incoming FastAPI request object containing
                          the global 'app.state'.

    Returns:
        AsyncClient: The shared, non-blocking HTTP client configured
                      for UDS transport.
    """
    return request.app.state.worker_client
