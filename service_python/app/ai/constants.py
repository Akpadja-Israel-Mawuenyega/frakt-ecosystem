"""
Frakt AI: Global Configuration & Guardrails
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
