import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from logging_config import logger


class PredictiveEngine:
    """
    A lightweight inference engine for time-series trend analysis.
    """

    # --- Configuration Constants ---
    MIN_REQUIRED_POINTS = 5
    FORECAST_STEPS = 3
    POLYNOMIAL_DEGREE = 2

    # Temporal Weighting: How much more we value new data vs old data
    START_WEIGHT = 0.5
    END_WEIGHT = 2.0

    @staticmethod
    def get_trend(data: list) -> dict:
        """
        Analyzes numerical trends and generates a multi-point forecast.

        The model applies a Degree-2 Polynomial fit with a temporal weighting
        strategy—giving 4x more importance to recent data points (2.0)
        compared to oldest points (0.5).

        Returns:
            dict: Contains the forecast, r2 confidence score, and momentum analysis.
            If data is insufficient or invalid, returns a descriptive error.
        """
        try:
            # Check against MIN_REQUIRED_POINTS
            if (
                not all(isinstance(x, (int, float)) for x in data)
                or len(data) < PredictiveEngine.MIN_REQUIRED_POINTS
            ):
                return {
                    "error": f"Insufficient data points (Min {PredictiveEngine.MIN_REQUIRED_POINTS} required)."
                }

            y = np.array(data, dtype=float)
            x = np.arange(len(y), dtype=float).reshape(-1, 1)

            if np.std(y) == 0:
                return {"error": "Data has no variance — cannot fit a trend."}

            # Weights: Creates a linear ramp from START_WEIGHT to END_WEIGHT
            weights = np.linspace(
                PredictiveEngine.START_WEIGHT, PredictiveEngine.END_WEIGHT, len(y)
            )

            # Model: Quadratic fit (Degree 2)
            model = make_pipeline(
                PolynomialFeatures(degree=PredictiveEngine.POLYNOMIAL_DEGREE),
                LinearRegression(),
            )

            model.fit(x, y, linearregression__sample_weight=weights)

            # Forecast: Project into the future by FORECAST_STEPS
            future_x = np.arange(
                len(y), len(y) + PredictiveEngine.FORECAST_STEPS
            ).reshape(-1, 1)
            preds = model.predict(future_x)

            # Round and floor results
            preds = [max(0, round(float(p), 2)) for p in preds]
            r2_score = model.score(x, y, sample_weight=weights)

            return {
                "forecast": preds,
                "confidence": max(0.0, round(float(r2_score), 4)),
                "is_growth": bool(preds[-1] > y[-1]),
                "model_meta": f"Sklearn Weighted Polynomial (Deg {PredictiveEngine.POLYNOMIAL_DEGREE})",
                "analysis": {
                    "current_momentum": "Positive" if preds[0] > y[-1] else "Negative",
                    "consistency_score": (
                        max(0, round(1 - np.std(y) / np.mean(y), 2))
                        if np.mean(y) != 0
                        else 0
                    ),
                },
            }

        except (ValueError, np.linalg.LinAlgError) as e:
            logger.warning(f"PredictiveEngine Math Error: {e}")
            return {"error": "Model fitting failed — check data uniformity."}
        except Exception as e:
            logger.error(f"Unexpected SKLearn Engine Error: {e}", exc_info=True)
            return {"error": "ML Inference failed."}
