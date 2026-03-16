from slowapi import Limiter
from app.middleware.middleware import get_customer_api_key

limiter = Limiter(key_func=get_customer_api_key)
