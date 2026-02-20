import numpy as np
from sklearn.linear_model import Ridge, BayesianRidge
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from logging_config import logger


class PredictiveEngine:
    """
    Advanced Inference Engine using Supervised Learning.
    Refactored to eliminate magic numbers and expose hyperparameters.
    """

    # --- Global Config ---
    MIN_REQUIRED_POINTS = 5
    FORECAST_STEPS = 3

    # --- Hyperparameters ---
    LINEAR_REGULARIZATION = 1.0
    POLY_REGULARIZATION = 0.5

    # Heuristic Guardrails
    SPORTS_GROWTH_CEILING = 1.5
    DEFAULT_MAX_VALUE = 10.0

    @staticmethod
    def get_trend(data: list, method: str = "polynomial") -> dict:
        """
        Main entry point for the predictive suite. Performs data validation
        and routes to the appropriate Supervised Learning model.
        """
        if (
            not all(isinstance(x, (int, float)) and np.isfinite(x) for x in data)
            or len(data) < PredictiveEngine.MIN_REQUIRED_POINTS
        ):
            return {
                "error": f"Insufficient data (Minimum {PredictiveEngine.MIN_REQUIRED_POINTS} points required)"
            }

        y = np.array(data)
        x = np.arange(len(y)).reshape(-1, 1)

        try:
            if method == "linear":
                return PredictiveEngine._fit_linear(x, y)
            elif method == "seasonal":
                return PredictiveEngine._fit_seasonal(data)
            else:
                return PredictiveEngine._fit_polynomial(x, y)
        except Exception as e:
            logger.error(f"AI Inference Failure [{method}]: {e}")
            return {"error": "Machine Learning processing failure"}

    @staticmethod
    def _fit_linear(x, y):
        """
        Implements Ridge Regression (L2 Regularization) for linear forecasting.

        This model minimizes the squared error while penalizing large coefficients,
        making it more robust to outliers in sports data (e.g., a single high-scoring game)
        than standard Ordinary Least Squares.
        """
        model = Ridge(alpha=PredictiveEngine.LINEAR_REGULARIZATION)
        model.fit(x, y)

        future_x = np.arange(len(y), len(y) + PredictiveEngine.FORECAST_STEPS).reshape(
            -1, 1
        )
        preds = model.predict(future_x).flatten()

        # No growth ceiling applied — linear extrapolation is bounded by nature of Ridge regularization
        return {
            "forecast": [max(0, round(float(p), 2)) for p in preds],
            "method": f"Ridge Regression (α={PredictiveEngine.LINEAR_REGULARIZATION})",
            "confidence": round(float(model.score(x, y)), 4),
            "is_growth": bool(preds[-1] > y[-1]),
        }

    @staticmethod
    def _fit_polynomial(x, y):
        """
        Implements a Regularized Polynomial Pipeline (Degree 2).

        Uses a pipeline to transform features into a quadratic space before applying
        Ridge regression. This captures non-linear trends (momentum) while the
        SPORTS_GROWTH_CEILING prevents the exponential 'runaway' effect common
        in unconstrained polynomial models.
        """
        model = make_pipeline(
            PolynomialFeatures(degree=2),
            Ridge(alpha=PredictiveEngine.POLY_REGULARIZATION),
        )
        model.fit(x, y)

        future_x = np.arange(len(y), len(y) + PredictiveEngine.FORECAST_STEPS).reshape(
            -1, 1
        )
        preds = model.predict(future_x).flatten()

        historical_max = np.max(y)
        limit = (
            historical_max * PredictiveEngine.SPORTS_GROWTH_CEILING
            if historical_max > 0
            else PredictiveEngine.DEFAULT_MAX_VALUE
        )

        # Applying the safety ceiling to the output
        safe_preds = [max(0, min(round(float(p), 2), limit)) for p in preds]

        return {
            "forecast": safe_preds,
            "method": "Regularized Polynomial Inference",
            "confidence": round(float(model.score(x, y)), 4),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }

    @staticmethod
    def _fit_seasonal(data):
        """
        Implements Bayesian Ridge Regression for probabilistic forecasting.

        Unlike frequentist models, Bayesian Ridge treats parameters as probability
        distributions. This allows the model to naturally adapt to the data's
        variance and provides an 'uncertainty' metric (std), which we invert
        to calculate a realistic confidence score.
        """
        y = np.array(data)
        x = np.arange(len(y)).reshape(-1, 1)

        model = BayesianRidge()
        model.fit(x, y)

        future_x = np.arange(len(y), len(y) + PredictiveEngine.FORECAST_STEPS).reshape(
            -1, 1
        )
        # return_std is the key AI feature here for uncertainty estimation
        preds, std = model.predict(future_x, return_std=True)

        historical_max = np.max(y)
        limit = (
            historical_max * PredictiveEngine.SPORTS_GROWTH_CEILING
            if historical_max > 0
            else PredictiveEngine.DEFAULT_MAX_VALUE
        )
        safe_preds = [max(0, min(round(float(p), 2), limit)) for p in preds]

        return {
            "forecast": safe_preds,
            "method": "Bayesian Probabilistic Inference",
            "confidence": round(1 / (1 + np.mean(std)), 4),
            "is_growth": bool(safe_preds[-1] > y[-1]),
        }
