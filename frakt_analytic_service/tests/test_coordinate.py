"""
Coordinate mapping & label extension unit tests.

All functions under test are pure (no I/O, no DB).  The fixed 0-300 Y domain
is intentional — these tests assert that it stays fixed regardless of input.
"""

import pytest
from app.routers.utils import (
    map_to_pixel,
    calculate_clean_scale,
    extend_labels_for_forecast,
    append_svg_assets,
)


# ---------------------------------------------------------------------------
# map_to_pixel
# Canvas: height=250, padding=20  →  usable_height=210
# pixel = height - (padding + relative_pos * usable_height)
# ---------------------------------------------------------------------------
class TestMapToPixel:
    H = 250  # canvas height used throughout

    def test_zero_value_maps_to_canvas_bottom(self):
        # relative_pos=0.0  →  250 - (20 + 0) = 230
        assert map_to_pixel(0, 0, 300, self.H) == 230.0

    def test_max_value_maps_to_canvas_top(self):
        # relative_pos=1.0  →  250 - (20 + 210) = 20
        assert map_to_pixel(300, 0, 300, self.H) == 20.0

    def test_midpoint_value_maps_to_vertical_centre(self):
        # relative_pos=0.5  →  250 - (20 + 105) = 125
        assert map_to_pixel(150, 0, 300, self.H) == 125.0

    def test_quarter_value_maps_correctly(self):
        # relative_pos=0.25  →  250 - (20 + 52.5) = 177.5
        assert map_to_pixel(75, 0, 300, self.H) == pytest.approx(177.5)

    def test_output_stays_within_padded_canvas_for_domain_values(self):
        for v in range(0, 301, 25):
            pixel = map_to_pixel(v, 0, 300, self.H)
            assert 20 <= pixel <= 230


# ---------------------------------------------------------------------------
# calculate_clean_scale — always returns fixed 0-300 domain
# ---------------------------------------------------------------------------
class TestCalculateCleanScale:
    def test_domain_is_always_zero_to_three_hundred(self):
        for data in ([1, 2], [500, 1000], [0.001, 0.002], [10_000]):
            y_min, y_range, _ = calculate_clean_scale(data)
            assert y_min == 0
            assert y_range == 300

    def test_steps_are_evenly_spaced_at_100_intervals(self):
        _, _, steps = calculate_clean_scale([42])
        assert steps == [0.0, 100.0, 200.0, 300.0]

    def test_data_values_do_not_affect_scale(self):
        _, _, steps_a = calculate_clean_scale([1, 2, 3])
        _, _, steps_b = calculate_clean_scale([999, 1000, 2000])
        assert steps_a == steps_b


# ---------------------------------------------------------------------------
# extend_labels_for_forecast
# ---------------------------------------------------------------------------
class TestExtendLabelsForForecast:
    def test_numeric_labels_extrapolated_by_detected_step(self):
        result = extend_labels_for_forecast(["180", "190", "200"], 2)
        assert result == ["180", "190", "200", "210", "220"]

    def test_numeric_step_can_be_negative(self):
        result = extend_labels_for_forecast(["300", "200", "100"], 2)
        assert result == ["300", "200", "100", "0", "-100"]

    def test_month_labels_wrap_around_december(self):
        result = extend_labels_for_forecast(["Nov", "Dec"], 2)
        assert result == ["Nov", "Dec", "Jan", "Feb"]

    def test_month_labels_wrap_mid_year(self):
        result = extend_labels_for_forecast(["Jun", "Jul"], 1)
        assert result == ["Jun", "Jul", "Aug"]

    def test_fallback_appends_plus_n_suffix(self):
        result = extend_labels_for_forecast(["Batch A"], 3)
        assert result == ["Batch A", "Batch A+1", "Batch A+2", "Batch A+3"]

    def test_zero_forecast_count_returns_original_labels(self):
        original = ["Jan", "Feb", "Mar"]
        result = extend_labels_for_forecast(original, 0)
        assert result == original

    def test_empty_labels_returned_unchanged(self):
        result = extend_labels_for_forecast([], 3)
        assert result == []


# ---------------------------------------------------------------------------
# append_svg_assets — integration smoke test
# ---------------------------------------------------------------------------
class TestAppendSvgAssets:
    BASE_SVG = '<svg viewBox="0 0 800 250" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'

    def test_appended_svg_still_closes_with_svg_tag(self):
        result = append_svg_assets(
            self.BASE_SVG,
            labels=["Jan", "Feb", "Mar"],
            raw_points=[50.0, 100.0, 150.0],
            history_count=3,
        )
        assert result.endswith("</svg>")

    def test_x_axis_labels_appear_in_output(self):
        result = append_svg_assets(
            self.BASE_SVG,
            labels=["Alpha", "Beta", "Gamma"],
            raw_points=[50.0, 100.0, 150.0],
            history_count=3,
        )
        assert "Alpha" in result
        assert "Beta" in result
        assert "Gamma" in result

    def test_forecast_boundary_line_injected_when_history_count_set(self):
        result = append_svg_assets(
            self.BASE_SVG,
            labels=["A", "B", "C", "D"],
            raw_points=[50.0, 100.0, 120.0, 140.0],
            history_count=2,
        )
        assert "forecast-boundary" in result
        assert "stroke-dasharray" in result

    def test_no_forecast_boundary_when_all_points_are_history(self):
        result = append_svg_assets(
            self.BASE_SVG,
            labels=["A", "B", "C"],
            raw_points=[50.0, 100.0, 150.0],
            history_count=3,
        )
        assert "forecast-boundary" not in result

    def test_empty_raw_points_returns_svg_unchanged(self):
        result = append_svg_assets(self.BASE_SVG, labels=[], raw_points=[], history_count=0)
        assert result == self.BASE_SVG
