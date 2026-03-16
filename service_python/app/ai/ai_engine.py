import numpy as np
from sklearn.linear_model import Ridge, BayesianRidge
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from app.configs.logging_config import logger
from . import constants, utils


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

    @staticmethod
    def _auto_select_model(data: np.ndarray) -> str:
        """
        Heuristic-based router to select the most appropriate model type.

        - Small datasets (< 8 points) use 'linear' to prevent overfitting.
        - Low-variance data uses 'seasonal' (Bayesian) for stability.
        - Standard datasets use 'polynomial' to capture non-linear trends.
        """
        if len(data) < 8:
            return "linear"

        if np.std(data) < constants.LOW_VARIANCE_THRESHOLD:
            return "seasonal"

        return "polynomial"

    @staticmethod
    def _generate_future_x(x: np.ndarray, steps: int) -> np.ndarray:
        """
        Calculates future X coordinates based on the existing X-axis cadence.
        
        Ensures that predictions follow the same spacing as the input data,
        whether that is sequential indices or custom coordinate values.
        """
        last_x = x[-1][0]
        if len(x) > 1:
            # Calculate average delta to maintain trend spacing
            delta = (x[-1][0] - x[0][0]) / (len(x) - 1)
        else:
            delta = 1.0

        future = np.arange(
            last_x + delta,
            last_x + delta + (steps * delta),
            delta
        ).reshape(-1, 1)
        
        return future[:steps]

    @staticmethod
    def get_trend(data: list, method: str = "auto") -> dict:
        """
        Main entry point for the predictive suite.

        Performs rigorous input validation, handles numeric conversion,
        calculates recency weights, and routes the request to the
        appropriate fit method. Supports both sequential lists and 
        coordinate pairs.
        """
        try:
            # -------- UNIVERSAL VALIDATION & EXTRACTION --------
            if not isinstance(data, (list, tuple)) or len(data) == 0:
                return {"error": "Invalid input format"}

            # Support for [[x, y], [x, y]] coordinate pairs
            if isinstance(data[0], (list, tuple)):
                try:
                    data_array = np.array(data, dtype=float)
                    if data_array.shape[1] != 2:
                        return {"error": "Coordinate pairs must be [x, y]"}
                    x = data_array[:, 0].reshape(-1, 1)
                    y = data_array[:, 1]
                except (ValueError, IndexError):
                    return {"error": "Invalid coordinate data structure"}
            else:
                # Support for sequential [y1, y2, y3] data
                if not all(isinstance(val, (int, float)) and np.isfinite(val) for val in data):
                    return {"error": "Data contains invalid numeric values"}
                y = np.array(data, dtype=float)
                x = np.arange(len(y)).reshape(-1, 1)

            # Validate dataset size constraints
            if not (constants.MIN_REQUIRED_POINTS <= len(y) <= constants.MAX_ALLOWED_POINTS):
                return {
                    "error": f"Data must contain between "
                    f"{constants.MIN_REQUIRED_POINTS} and "
                    f"{constants.MAX_ALLOWED_POINTS} points"
                }

            # Guard against constant data
            if np.std(y) == 0:
                return {"error": "Data lacks variability for prediction"}

            # Recency weighting: prioritize newer data points
            weights = utils.get_exponential_weights(len(y))

            # Auto model selection based on data characteristics
            if method == "auto":
                method = PredictiveEngine._auto_select_model(y)

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

    @staticmethod
    def _fit_linear(x: np.ndarray, y: np.ndarray, weights: np.ndarray) -> dict:
        """
        Performs Weighted Ridge Regression (L2 Regularized).

        Best for data with a clear, steady directional trend without
        significant curvature.
        """
        model = Ridge(alpha=constants.LINEAR_REGULARIZATION)
        model.fit(x, y, sample_weight=weights)

        future_x = PredictiveEngine._generate_future_x(x, constants.FORECAST_STEPS)
        preds = model.predict(future_x).flatten()
        safe_preds = utils.apply_prediction_limits(preds, y)

        return {
            "forecast_x": future_x.flatten().tolist(),
            "forecast_y": list(safe_preds),
            "method": f"Weighted Ridge (alpha={constants.LINEAR_REGULARIZATION})",
            "confidence": round(float(model.score(x, y, sample_weight=weights)), 4),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }

    @staticmethod
    def _fit_polynomial(x: np.ndarray, y: np.ndarray, weights: np.ndarray) -> dict:
        """
        Performs Weighted Quadratic Regression via a Pipeline.

        Uses PolynomialFeatures(degree=2) to capture acceleration/momentum
        in the trend. Ridge regularization prevents extreme sensitivities.
        """
        model = make_pipeline(
            PolynomialFeatures(degree=2),
            Ridge(alpha=constants.POLY_REGULARIZATION),
        )

        # Pipeline requires the step name prefix for sample weights
        model.fit(x, y, ridge__sample_weight=weights)

        future_x = PredictiveEngine._generate_future_x(x, constants.FORECAST_STEPS)
        preds = model.predict(future_x).flatten()
        safe_preds = utils.apply_prediction_limits(preds, y)

        return {
            "forecast_x": future_x.flatten().tolist(),
            "forecast_y": list(safe_preds),
            "method": "Weighted Polynomial Pipeline",
            "confidence": round(
                float(model.score(x, y, ridge__sample_weight=weights)), 4
            ),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }

    @staticmethod
    def _fit_seasonal(x: np.ndarray, y: np.ndarray, weights: np.ndarray) -> dict:
        """
        Performs Bayesian Ridge Regression.

        Calculates uncertainty (std) to derive a confidence score.
        Highly effective for data with high variance or where probabilistic
        caution is required.
        """
        model = BayesianRidge()
        model.fit(x, y, sample_weight=weights)

        future_x = PredictiveEngine._generate_future_x(x, constants.FORECAST_STEPS)
        preds, std = model.predict(future_x, return_std=True)
        safe_preds = utils.apply_prediction_limits(preds, y)

        # Invert the standard deviation into a normalized 0-1 confidence scale
        confidence = 1 / (1 + np.mean(std))

        return {
            "forecast_x": future_x.flatten().tolist(),
            "forecast_y": list(safe_preds),
            "method": "Weighted Bayesian Inference",
            "confidence": round(float(confidence), 4),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }