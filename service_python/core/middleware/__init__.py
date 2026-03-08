# core/middleware/__init__.py

"""
Middleware Package
Handles cross-cutting concerns including authentication and global error handling.
"""

from .error_handlers import register_error_handlers
from .middleware import get_cached_tier, get_tier_limit, get_current_customer, get_customer_api_key

__all__ = ["register_error_handlers", "get_cached_tier", "get_tier_limit", "get_customer_api_key", "get_current_customer"]
