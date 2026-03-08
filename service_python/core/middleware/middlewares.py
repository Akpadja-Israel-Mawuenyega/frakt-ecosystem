#core/middleware/middlewares.py

import time
from fastapi import Request, Depends, status, Header, HTTPException
from sqlalchemy.orm import Session
from database import get_db, Customer
from tier_config import TIER_LIMITS
from logging_config import logger


from slowapi.util import get_remote_address


_tier_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 60


def get_cached_tier(api_key: str) -> str:
    """
    Retrieves the customer's subscription tier with a TTL-based cache.

    This prevents the rate-limiter from hitting the database on every single
    request by caching the tier for 60 seconds.
    """

    now = time.time()
    if api_key in _tier_cache:
        tier, ts = _tier_cache[api_key]
        if now - ts < CACHE_TTL:
            return tier
    from database import SessionLocal

    with SessionLocal() as db:
        customer = db.query(Customer).filter(Customer.api_key == api_key).first()
        tier = customer.tier if customer else "free"
    _tier_cache[api_key] = (tier, now)
    return tier


def get_tier_limit(request: Request) -> str:
    """
    Dynamic rate-limit selector for SlowAPI.

    Extracts the API key from headers to determine the customer's tier
    and returns the corresponding rate limit string (e.g., "5/minute").
    """

    api_key = request.headers.get("x-api-key")
    if not api_key:
        return TIER_LIMITS["free"]["rate"]

    tier = get_cached_tier(api_key)
    return TIER_LIMITS.get(tier, TIER_LIMITS["free"])["rate"]


def get_customer_api_key(request: Request):
    """
    Key generator for the rate limiter.

    Prioritizes the 'x-api-key' header for identification, falling back
    to the remote IP address if no key is provided.
    """
    api_key = request.headers.get("x-api-key")
    return api_key or get_remote_address(request)


async def get_current_customer(
    x_api_key: str = Header(..., description="Customer's API Key"),
    db: Session = Depends(get_db),
) -> Customer:
    """
    Dependency for authenticating and retrieving the Customer object.

    Validates the customer's **API key**, 'x-api-key', against the database.
    Raises 401 Unauthorized if the key is missing, invalid, or inactive.
    """
    customer = db.query(Customer).filter(Customer.api_key == x_api_key).one_or_none()
    if not customer or not customer.is_active:
        logger.warning(f"Unauthorized access attempt: {x_api_key}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key.",
        )
    return customer
