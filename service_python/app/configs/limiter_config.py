# service_python/app/configs/limiter_config.py
"""
Frakt Throttling Engine.

Initializes the global SlowAPI limiter using a secure, hash-based key
function to identify customer buckets without exposing raw API credentials.
"""


from slowapi import Limiter
from app.middleware.middleware import get_customer_limit_key

limiter = Limiter(key_func=get_customer_limit_key)
