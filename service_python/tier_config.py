# service_python/tier_config.py

TIER_LIMITS = {
    "free": {"rate": "5/minute", "quota": 100},
    "pro": {"rate": "50/minute", "quota": 5000},
    "enterprise": {"rate": "200/minute", "quota": 100000},
}
