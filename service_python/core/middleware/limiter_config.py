from slowapi import Limiter
from service_python.core.middleware.middlewares import get_customer_api_key

limiter = Limiter(key_func=get_customer_api_key)
