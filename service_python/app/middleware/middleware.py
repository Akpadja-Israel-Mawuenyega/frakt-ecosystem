# service_python/app/middleware/middleware.py
"""
This module serves as the primary gateway for request authentication,
multi-tenant identity resolution, and performance-optimized rate limiting.
It implements a 'Zero-Plaintext' architecture where API keys are strictly
processed as SHA-256 hashes, ensuring that sensitive credentials never
exist in the database or memory in a recoverable format.

Key Components:
    - SHA-256 Hashing: Irreversible transformation of Bearer tokens.
    - TTL-Based Tier Cache: Prevents DB thrashing during high-frequency API calls.
    - Tier-Aware Rate Limiting: Dynamic bucket selection via SlowAPI.
    - Identity Resolution: Single-query injection of the 'Customer' ORM entity.
"""


import time
import hashlib
from fastapi import Request, Depends, status, Header, HTTPException
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from app.database.database import get_db, SessionLocal
from app.database.models import Customer
from app.configs.logging_config import logger
from app.configs.tier_config import TIER_LIMITS


# =============================================================================
# SECTION 1: GLOBAL CACHE & CRYPTOGRAPHY
# =============================================================================

# Key: SHA-256 Hash | Value: (tier_name, timestamp)
_tier_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 60


def hash_api_key(plain_key: str) -> str:
    """
    Standardizes SHA-256 hashing for API keys across the Frakt ecosystem.
    Ensures that raw keys never exist in persistence layers.
    """
    return hashlib.sha256(plain_key.encode()).hexdigest()


# =============================================================================
# SECTION 2: PERFORMANCE OPTIMIZATION (TIER CACHING)
# =============================================================================
def get_cached_tier(plain_api_key: str) -> str:
    """
    Retrieves the customer's subscription tier with a TTL-based memory cache.
    Identifies the customer by the SHA-256 HASH of their provided key.
    """
    now = time.time()
    key_hash = hash_api_key(plain_api_key)

    # 1. Memory Cache Check
    if key_hash in _tier_cache:
        tier, ts = _tier_cache[key_hash]
        if now - ts < CACHE_TTL:
            return tier

    # 2. DB Fallback (Using SessionLocal for the rate-limiter's isolated lookup)
    with SessionLocal() as db:
        customer = (
            db.query(Customer)
            .filter(Customer.hashed_api_key == key_hash, Customer.is_active == True)
            .first()
        )

        # If user isn't found or key is invalid, we default to 'free'
        tier = customer.tier if customer else "free"

    # 3. Update Cache
    _tier_cache[key_hash] = (tier, now)
    return tier


# =============================================================================
# SECTION 3: RATE LIMITING LOGIC (SLOWAPI)
# =============================================================================
def get_tier_limit(request: Request = None) -> str:
    """
    Dynamic rate-limit selector for the SlowAPI engine.
    Fetches the tier-specific 'rate' string (e.g., "5/minute").
    """
    if request is None:
        return TIER_LIMITS["free"]["rate"]

    api_key = request.headers.get("x-api-key")
    if not api_key:
        return TIER_LIMITS["free"]["rate"]

    # Get the tier name (e.g., "pro") from our hashed cache
    tier_name = get_cached_tier(api_key)

    # Access your specific dict structure: TIER_LIMITS["pro"]["rate"]
    tier_data = TIER_LIMITS.get(tier_name, TIER_LIMITS["free"])
    return tier_data["rate"]


def get_customer_limit_key(request: Request) -> str:
    """
    Fast, pre-auth key generator for the Limiter.
    Uses the hash of the key (if present) or the IP address as a fallback.
    """
    api_key = request.headers.get("x-api-key")
    if api_key:
        return hash_api_key(api_key)  # Returns the 64-char string
    return get_remote_address(request)


# =============================================================================
# SECTION 4: IDENTITY RESOLUTION (DEPENDENCY INJECTION)
# =============================================================================
async def get_current_active_customer(
    request: Request,
    x_api_key: str = Header(..., description="Customer's API Key"),
    db: Session = Depends(get_db),
) -> Customer:
    """
    The Single Source of Truth for Identity.
    Hashes the incoming header and performs a lookup.
    
    Returns:
        Customer: The SQLAlchemy ORM entity for the authenticated tenant.
    
    Raises:
        HTTPException: 401 Unauthorized if the key is invalid or the account is disabled.
    """
    incoming_hash = hash_api_key(x_api_key)

    customer = (
        db.query(Customer)
        .filter(Customer.hashed_api_key == incoming_hash, Customer.is_active == True)
        .one_or_none()
    )

    if not customer:
        logger.warning(f"Unauthorized access: Hash prefix {incoming_hash[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key.",
        )

    # This makes the 'customer' available to your Audit Middleware in main.py
    request.state.customer = customer
    
    return customer
