import numpy as np
from sklearn.linear_model import Ridge, BayesianRidge
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from service_python.logging_config import logger


class PredictiveEngine:
    """
    Advanced Inference Engine using Supervised Learning.

    This engine provides multi-model time-series forecasting tailored for
    sporadic or momentum-based data (e.g., sports stats, user growth).
    It utilizes weighted regression to prioritize recent performance and
    includes heuristic guardrails to prevent mathematical 'runaway' in predictions.

    Features:
    - Ridge Regression: Linear trend analysis with L2 regularization.
    - Polynomial Pipeline: Quadratic feature mapping for momentum detection.
    - Bayesian Inference: Probabilistic estimation for low-variance data.
    - Exponential Recency Weighting: Prioritizes recent data points.
    - Automatic Model Selection: Heuristic-based routing for optimal accuracy.
    """

    # ---------------- GLOBAL CONFIG ----------------

    MIN_REQUIRED_POINTS = 5
    MAX_ALLOWED_POINTS = 500
    FORECAST_STEPS = 3

    # ---------------- HYPERPARAMETERS ----------------

    LINEAR_REGULARIZATION = 1.0
    POLY_REGULARIZATION = 0.5
    RECENCY_WEIGHT_STRENGTH = 0.1

    # ---------------- GUARDRAILS ----------------

    GROWTH_CEILING = 1.5
    DEFAULT_MAX_VALUE = 10.0
    LOW_VARIANCE_THRESHOLD = 0.05

    # -------------------------------------------------

    @staticmethod
    def _get_exponential_weights(n_points: int) -> np.ndarray:
        """
        Generates an exponential decay vector for sample weighting.

        The most recent data point receives a weight of 1.0, with older points
        decreasing in influence according to RECENCY_WEIGHT_STRENGTH.
        """
        weights = np.exp(PredictiveEngine.RECENCY_WEIGHT_STRENGTH * np.arange(n_points))
        return weights / weights.max()

    # -------------------------------------------------

    @staticmethod
    def _auto_select_model(data: list) -> str:
        """
        Heuristic-based router to select the most appropriate model type.

        - Small datasets (< 8 points) use 'linear' to prevent overfitting.
        - Low-variance data uses 'seasonal' (Bayesian) for stability.
        - Standard datasets use 'polynomial' to capture non-linear trends.
        """
        if len(data) < 8:
            return "linear"

        if np.std(data) < PredictiveEngine.LOW_VARIANCE_THRESHOLD:
            return "seasonal"

        return "polynomial"

    # -------------------------------------------------

    @staticmethod
    def get_trend(data: list, method: str = "auto") -> dict:
        """
        Main entry point for the predictive suite.

        Performs rigorous input validation, handles numeric conversion,
        calculates recency weights, and routes the request to the
        appropriate fit method.

        Args:
            data (list): A list of numeric data points.
            method (str): "linear", "polynomial", "seasonal", or "auto".

        Returns:
            dict: Contains 'forecast', 'method', 'confidence', and 'is_growth'.
        """
        try:
            # -------- VALIDATION --------

            if not isinstance(data, (list, tuple)):
                return {"error": "Invalid input format"}

            if not (
                PredictiveEngine.MIN_REQUIRED_POINTS
                <= len(data)
                <= PredictiveEngine.MAX_ALLOWED_POINTS
            ):
                return {
                    "error": f"Data must contain between "
                    f"{PredictiveEngine.MIN_REQUIRED_POINTS} and "
                    f"{PredictiveEngine.MAX_ALLOWED_POINTS} points"
                }

            if not all(isinstance(x, (int, float)) and np.isfinite(x) for x in data):
                return {"error": "Data contains invalid numeric values"}

            # Convert safely
            y = np.array(data, dtype=float)

            # Guard against constant data
            if np.std(y) == 0:
                return {"error": "Data lacks variability for prediction"}

            x = np.arange(len(y)).reshape(-1, 1)

            # Recency weighting
            weights = PredictiveEngine._get_exponential_weights(len(y))

            # Auto model selection
            if method == "auto":
                method = PredictiveEngine._auto_select_model(data)

            # -------- ROUTING --------

            if method == "linear":
                return PredictiveEngine._fit_linear(x, y, weights)

            elif method == "seasonal":
                return PredictiveEngine._fit_seasonal(x, y, weights)

            else:
                return PredictiveEngine._fit_polynomial(x, y, weights)

        except Exception as e:
            logger.error(f"Predictive engine failure: {e}")
            return {"error": "Machine learning processing failure"}

    # -------------------------------------------------

    @staticmethod
    def _apply_prediction_limits(preds, y):
        """
        Applies heuristic guardrails to the model output.

        Ensures that predictions:
        1. Are never negative (Floor: 0).
        2. Do not exceed a percentage-based ceiling of historical performance.
        3. Are rounded to 2 decimal places for consistent presentation.
        """
        historical_max = np.max(y)

        limit = (
            historical_max * PredictiveEngine.GROWTH_CEILING
            if historical_max > 0
            else PredictiveEngine.DEFAULT_MAX_VALUE
        )

        return [max(0, min(round(float(p), 2), limit)) for p in preds]

    # -------------------------------------------------

    @staticmethod
    def _fit_linear(x, y, weights):
        """
        Performs Weighted Ridge Regression (L2 Regularized).

        Best for data with a clear, steady directional trend without
        significant curvature.
        """
        model = Ridge(alpha=PredictiveEngine.LINEAR_REGULARIZATION)
        model.fit(x, y, sample_weight=weights)

        future_x = np.arange(len(y), len(y) + PredictiveEngine.FORECAST_STEPS).reshape(
            -1, 1
        )

        preds = model.predict(future_x).flatten()

        safe_preds = PredictiveEngine._apply_prediction_limits(preds, y)

        return {
            "forecast": safe_preds,
            "method": f"Weighted Ridge (α={PredictiveEngine.LINEAR_REGULARIZATION})",
            "confidence": round(float(model.score(x, y, sample_weight=weights)), 4),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }

    # -------------------------------------------------

    @staticmethod
    def _fit_polynomial(x, y, weights):
        """
        Performs Weighted Quadratic Regression via a Pipeline.

        Uses PolynomialFeatures(degree=2) to capture acceleration/momentum
        in the trend. Ridge regularization prevents extreme sensitivities.
        """
        model = make_pipeline(
            PolynomialFeatures(degree=2),
            Ridge(alpha=PredictiveEngine.POLY_REGULARIZATION),
        )

        model.fit(x, y, ridge__sample_weight=weights)

        future_x = np.arange(len(y), len(y) + PredictiveEngine.FORECAST_STEPS).reshape(
            -1, 1
        )

        preds = model.predict(future_x).flatten()

        safe_preds = PredictiveEngine._apply_prediction_limits(preds, y)

        return {
            "forecast": safe_preds,
            "method": "Weighted Polynomial Pipeline",
            "confidence": round(
                float(model.score(x, y, ridge__sample_weight=weights)), 4
            ),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }

    # -------------------------------------------------

    @staticmethod
    def _fit_seasonal(x, y, weights):
        """
        Performs Bayesian Ridge Regression.

        Calculates uncertainty (std) to derive a confidence score.
        Highly effective for data with high variance or where probabilistic
        caution is required.
        """
        model = BayesianRidge()
        model.fit(x, y, sample_weight=weights)

        future_x = np.arange(len(y), len(y) + PredictiveEngine.FORECAST_STEPS).reshape(
            -1, 1
        )

        preds, std = model.predict(future_x, return_std=True)

        safe_preds = PredictiveEngine._apply_prediction_limits(preds, y)

        # Invert the standard deviation into a normalized 0-1 confidence scale
        confidence = 1 / (1 + np.mean(std))

        return {
            "forecast": safe_preds,
            "method": "Weighted Bayesian Inference",
            "confidence": round(float(confidence), 4),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }
