# ai_engine.py
import numpy as np
from sklearn.linear_model import LinearRegression
from .logging_config import logger


class PredictiveEngine:
    """
    Machine Learning-powered forecasting engine using
    supervised learning algorithms for time-series analysis.
    """

    @staticmethod
    def get_trend(data: list) -> dict:
        """
        Processes raw data into sanitized primitives.
        Ensures NO numpy/ml objects reach the Kernel.
        """
        try:
            if not data or len(data) < 2:
                return {"error": "Insufficient data for forecasting."}

            y = np.array(data).reshape(-1, 1)
            x = np.arange(len(y)).reshape(-1, 1)
            model = LinearRegression().fit(x, y)

            # Predict next 3 steps
            future_x = np.arange(len(y), len(y) + 3).reshape(-1, 1)
            preds = model.predict(future_x).flatten()

            # Sanitization: Force everything to standard Python types
            return {
                "forecast": [round(float(p), 2) for p in preds],
                "is_growth": bool(preds[-1] > data[-1]),
                "confidence": round(float(model.score(x, y)), 4),
                "is_predictive": True,
            }
        except Exception as e:
            logger.error(f"AI Strategy Failure: {e}")
            return {"error": "Mathematical processing failed."}
