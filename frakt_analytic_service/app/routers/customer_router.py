# service_python/app/routers/customer_router.py
"""
Frakt Customer Identity & Account Management Router.

Handles the full lifecycle of a Frakt tenant account:
registration, API key issuance, key rotation, usage telemetry,
and account deactivation.

Security Architecture:
1.  Zero-Knowledge Key Storage: Raw API keys are never persisted.
    Only SHA-256 hashes are stored. The raw key is returned once
    on registration/rotation and never again.
2.  Ownership Enforcement: All account operations require the
    customer to authenticate with their API key first.
3.  Audit Trail: Key rotations and deactivations are logged
    as WARNING severity — irreversible or sensitive operations.
"""

import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session

from app.configs.logging_config import logger
from app.audit import log_event, LogSeverity
from app.middleware.middleware import get_current_active_customer
from app.database.database import get_db
from app.database.models import Customer
from app.database.schemas import (
    CustomerRegisterRequest,
    CustomerRegisterResponse,
    UsageResponse,
)

# =============================================================================
# SECTION 1: ROUTER INITIALIZATION
# =============================================================================

router = APIRouter(
    prefix="/customers",
    tags=["Customer Account Management"],
    responses={404: {"description": "Not found"}},
)


# =============================================================================
# SECTION 2: UTILITIES
# =============================================================================


def _hash_key(raw_key: str) -> str:
    """
    Produces a SHA-256 hash of the raw API key for zero-knowledge storage.
    The output is always 64 hex characters — matching the hashed_api_key
    column constraint in the Customer model.

    Args:
        raw_key: The plaintext API key to hash.

    Returns:
        A 64-character hex digest string.
    """
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _generate_api_key() -> str:
    """
    Generates a cryptographically secure API key with a 'frakt_live_' prefix.
    Uses secrets.token_urlsafe for CSPRNG-backed randomness — safe for
    use as a bearer credential.

    Returns:
        A prefixed, URL-safe API key string.
    """
    return f"frakt_live_{secrets.token_urlsafe(32)}"


# =============================================================================
# SECTION 3: REGISTRATION ENDPOINT
# =============================================================================


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=CustomerRegisterResponse,
)
def register_customer(
    request: Request,
    data: CustomerRegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Register a new Frakt tenant and issue an API key.

    This is the entry point for all new customers. On success,
    the raw API key is returned exactly once — it cannot be
    retrieved again. The customer should store it securely.

    Process:
    1. Check for an existing account with the same email.
    2. Generate a CSPRNG-backed API key with frakt_live_ prefix.
    3. Hash the key with SHA-256 and persist only the hash.
    4. Return the raw key to the customer — once only.

    Raises:
        HTTPException: 409 if the email is already registered.
    """
    existing = db.query(Customer).filter(Customer.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=409, detail="An account with this email already exists."
        )

    raw_key = _generate_api_key()
    hashed_key = _hash_key(raw_key)

    customer = Customer(
        name=data.name,
        email=data.email,
        hashed_api_key=hashed_key,
        tier="free",
        usage_count=0,
        is_active=True,
    )
    db.add(customer)
    db.flush()  # Resolve the ID before logging

    log_event(
        db=db,
        customer_id=customer.id,
        action="CUSTOMER_REGISTERED",
        request=request,
        endpoint="/v1/customers/register",
        status_code=201,
        severity=LogSeverity.INFO,
    )
    db.commit()

    logger.info(f"New customer registered: {customer.email} (ID: {customer.id})")

    return CustomerRegisterResponse(
        message="Account created. Store your API key securely — it will not be shown again.",
        customer_id=customer.id,
        api_key=raw_key,
    )


# =============================================================================
# SECTION 4: USAGE TELEMETRY ENDPOINT
# =============================================================================


@router.get("/me", response_model=UsageResponse)
def get_my_usage(
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Retrieve current usage telemetry for the authenticated customer.

    Returns live quota consumption, tier details, and account status.
    Intended for customer dashboards and pre-flight quota checks
    before dispatching generation requests.
    """
    from app.configs.tier_config import TIER_LIMITS

    tier_config = TIER_LIMITS.get(customer.tier, TIER_LIMITS["free"])

    return UsageResponse(
        customer_id=customer.id,
        name=customer.name,
        email=customer.email,
        tier=customer.tier,
        usage_count=customer.usage_count,
        quota=tier_config["quota"],
        is_active=customer.is_active,
    )


# =============================================================================
# SECTION 5: API KEY ROTATION ENDPOINT
# =============================================================================


@router.post("/rotate-key", status_code=status.HTTP_200_OK)
def rotate_api_key(
    request: Request,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Rotate the authenticated customer's API key.

    Generates a new CSPRNG-backed key, hashes it, and replaces
    the stored hash. The old key is immediately invalidated.
    The new raw key is returned once — it cannot be retrieved again.

    Use cases:
    - Suspected key compromise
    - Routine security rotation
    - Offboarding a team member who had key access

    Returns:
        A JSON object containing the new raw API key.
    """
    raw_key = _generate_api_key()
    hashed_key = _hash_key(raw_key)

    customer.hashed_api_key = hashed_key
    db.flush()

    log_event(
        db=db,
        customer_id=customer.id,
        action="API_KEY_ROTATED",
        request=request,
        endpoint="/v1/customers/rotate-key",
        status_code=200,
        severity=LogSeverity.WARNING,  # Sensitive — key material changed
    )
    db.commit()

    logger.warning(f"API key rotated for customer {customer.id}")

    return {
        "message": "API key rotated. Store your new key securely — it will not be shown again.",
        "api_key": raw_key,
    }


# =============================================================================
# SECTION 6: ACCOUNT DEACTIVATION ENDPOINT
# =============================================================================


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_account(
    request: Request,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Soft-delete the authenticated customer's account.

    Sets is_active to False rather than deleting the record,
    preserving the audit trail and preventing ID reuse.
    All API access is immediately revoked — the middleware
    checks is_active on every authenticated request.

    Note:
        This operation is irreversible via the API. Reactivation
        requires direct database intervention or a future admin endpoint.
    """
    customer.is_active = False
    db.flush()

    log_event(
        db=db,
        customer_id=customer.id,
        action="ACCOUNT_DEACTIVATED",
        request=request,
        endpoint="/v1/customers/me",
        status_code=204,
        severity=LogSeverity.WARNING,
    )
    db.commit()

    logger.warning(f"Account deactivated: {customer.id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
