"""
PredictiveEngine unit tests.

Covers: auto model-selection heuristics, forecast horizon, floor/ceiling
guardrails, recency weighting direction, confidence bounds, and input
validation.  All tests run in-process — no HTTP, no DB, no sandbox.
"""

import pytest
from app.ai.ai_engine import PredictiveEngine
from app.ai import constants


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_RISING = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
_FALLING = [100.0, 90.0, 80.0, 70.0, 60.0, 50.0, 40.0, 30.0, 20.0, 10.0]
_SMALL = [10.0, 20.0, 30.0, 40.0, 50.0]  # 5 points — below the < 8 threshold


# ---------------------------------------------------------------------------
# Auto model selection
# ---------------------------------------------------------------------------
class TestAutoModelSelection:
    def test_small_dataset_selects_linear(self):
        result = PredictiveEngine.get_trend(_SMALL, method="auto")
        assert "error" not in result
        assert "Ridge" in result["method"]

    def test_normal_dataset_selects_polynomial(self):
        # 10 points, substantial variance — polynomial branch
        result = PredictiveEngine.get_trend(_RISING, method="auto")
        assert "error" not in result
        assert "Polynomial" in result["method"]

    def test_low_variance_dataset_selects_seasonal(self):
        # Values clustered tightly — std << LOW_VARIANCE_THRESHOLD
        data = [1.001, 1.002, 1.001, 1.000, 1.001,
                1.002, 1.001, 1.000, 1.001, 1.002]
        result = PredictiveEngine.get_trend(data, method="auto")
        assert "error" not in result
        assert "Bayesian" in result["method"]


# ---------------------------------------------------------------------------
# Forecast shape
# ---------------------------------------------------------------------------
class TestForecastShape:
    def test_forecast_extends_by_exactly_three_steps(self):
        result = PredictiveEngine.get_trend(_RISING, method="linear")
        assert "error" not in result
        assert len(result["forecast_y"]) == constants.FORECAST_STEPS
        assert len(result["forecast_x"]) == constants.FORECAST_STEPS

    @pytest.mark.parametrize("method", ["linear", "polynomial", "seasonal"])
    def test_all_models_return_required_keys(self, method):
        result = PredictiveEngine.get_trend(_RISING, method=method)
        assert "error" not in result
        for key in ("forecast_x", "forecast_y", "method", "confidence", "is_growth"):
            assert key in result


# ---------------------------------------------------------------------------
# Guardrails
# ---------------------------------------------------------------------------
class TestGuardrails:
    def test_floor_guardrail_prevents_negative_predictions(self):
        # Steeply falling data would extrapolate below zero without the floor
        result = PredictiveEngine.get_trend(_FALLING, method="linear")
        assert "error" not in result
        assert all(v >= 0.0 for v in result["forecast_y"])

    def test_ceiling_guardrail_caps_growth_at_150_percent_of_historical_max(self):
        # Exponential input: model would predict values beyond 1.5× without cap
        data = [1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 256.0, 512.0]
        result = PredictiveEngine.get_trend(data, method="polynomial")
        assert "error" not in result
        ceiling = max(data) * constants.GROWTH_CEILING
        assert all(v <= ceiling for v in result["forecast_y"])

    def test_predictions_are_rounded_to_two_decimal_places(self):
        result = PredictiveEngine.get_trend(_RISING, method="linear")
        assert "error" not in result
        for v in result["forecast_y"]:
            assert round(v, 2) == v


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------
class TestInputValidation:
    def test_constant_data_returns_error(self):
        result = PredictiveEngine.get_trend([50.0] * 8)
        assert "error" in result
        assert "variability" in result["error"].lower()

    def test_too_few_points_returns_error(self):
        result = PredictiveEngine.get_trend([10.0, 20.0, 30.0])
        assert "error" in result

    def test_too_many_points_returns_error(self):
        result = PredictiveEngine.get_trend(list(range(constants.MAX_ALLOWED_POINTS + 1)))
        assert "error" in result

    def test_empty_list_returns_error(self):
        result = PredictiveEngine.get_trend([])
        assert "error" in result

    def test_coordinate_pair_format_is_accepted(self):
        data = [[i, float(i * 10)] for i in range(10)]
        result = PredictiveEngine.get_trend(data, method="linear")
        assert "error" not in result


# ---------------------------------------------------------------------------
# Confidence & is_growth direction
# ---------------------------------------------------------------------------
class TestConfidenceAndGrowth:
    def test_confidence_is_between_zero_and_one(self):
        for method in ("linear", "polynomial", "seasonal"):
            result = PredictiveEngine.get_trend(_RISING, method=method)
            assert "error" not in result
            assert 0.0 <= result["confidence"] <= 1.0

    def test_is_growth_true_for_rising_data(self):
        result = PredictiveEngine.get_trend(_RISING, method="linear")
        assert result["is_growth"] is True

    def test_is_growth_false_for_falling_data(self):
        result = PredictiveEngine.get_trend(_FALLING, method="linear")
        assert result["is_growth"] is False


# ---------------------------------------------------------------------------
# Recency weighting: recent trend should dominate
# ---------------------------------------------------------------------------
class TestRecencyWeighting:
    def test_recent_acceleration_shifts_forecast_upward(self):
        """
        Both sequences have the same mean, but seq_b rockets at the end.
        The exponential recency weights should make seq_b forecast higher
        than seq_a, demonstrating that newer data dominates.
        """
        seq_a = [50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0]
        seq_b = [10.0, 15.0, 10.0, 12.0, 14.0, 20.0, 40.0, 60.0, 80.0, 100.0]

        result_a = PredictiveEngine.get_trend(seq_a[:5] + [51.0, 52.0, 53.0, 54.0, 55.0], method="linear")
        result_b = PredictiveEngine.get_trend(seq_b, method="linear")

        assert "error" not in result_a
        assert "error" not in result_b
        # seq_b has strong upward momentum at the end — its forecast should be higher
        assert max(result_b["forecast_y"]) > max(result_a["forecast_y"])
