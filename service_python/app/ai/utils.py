# service_python/app/ai/utils.py
"""
Frakt Predictive Intelligence Utilities.

A specialized toolkit for data preprocessing and post-inference
optimization. This module provides the mathematical weighting logic
used to bias models toward recent performance and enforces safety
guardrails on AI-generated outputs.

Architecture Note:
All functions are designed to operate on NumPy arrays for high-performance
vectorized math, ensuring the AI engine remains responsive even under
heavy multi-tenant loads.
"""

import numpy as np
from . import constants


# =============================================================================
# SECTION 1: DATA PREPROCESSING (MODEL BIASING)
# =============================================================================
def get_exponential_weights(n_points: int) -> np.ndarray:
    """
    Generates an exponential decay vector for sample weighting.

    The most recent data point receives a weight of 1.0, with older points
    decreasing in influence according to RECENCY_WEIGHT_STRENGTH.
    """
    weights = np.exp(constants.RECENCY_WEIGHT_STRENGTH * np.arange(n_points))
    return weights / weights.max()


# =============================================================================
# SECTION 2: INFERENCE GUARDRAILS (POST-PROCESSING)
# =============================================================================
def apply_prediction_limits(preds, y):
    """
    Applies heuristic guardrails to the model output.

    Ensures that predictions:
    1. Are never negative (Floor: 0).
    2. Do not exceed a percentage-based ceiling of historical performance.
    3. Are rounded to 2 decimal places for consistent presentation.
    """
    historical_max = np.max(y)

    limit = (
        historical_max * constants.GROWTH_CEILING
        if historical_max > 0
        else constants.DEFAULT_MAX_VALUE
    )

    return [max(0, min(round(float(p), 2), limit)) for p in preds]
