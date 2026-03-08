# generation_router.py

from httpx import AsyncClient
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import update

from core.middleware.limiter_config import limiter
from logging_config import logger
from core.middleware import get_current_customer, get_tier_limit
from service_python.routers.tier_config import TIER_LIMITS
from database import get_db, Customer, SVGTemplate, SvgGenerationRequest
from core.ai_engine import PredictiveEngine

router = APIRouter(
    tags=["SVG Template Generation"],
    responses={404: {"description": "Not found"}},
)


def get_worker(request: Request) -> AsyncClient:
    """
    Dependency provider for the sandboxed Worker execution client.

    Retrieves the persistent 'httpx.AsyncClient' from the application state.
    This client is initialized during the 'lifespan' startup sequence to
    utilize a High-Performance Unix Domain Socket (UDS) transport.

    Using this dependency ensures that the application leverages connection
    pooling rather than instantiating a new client per request, significantly
    reducing the latency of inter-container communication.

    Args:
        request (Request): The incoming FastAPI request object containing
                          the global 'app.state'.

    Returns:
        AsyncClient: The shared, non-blocking HTTP client configured
                     for UDS transport.
    """
    return request.app.state.worker_client


@router.post("/generate", status_code=status.HTTP_200_OK)
@limiter.limit(get_tier_limit)
async def generate_svg(
    request: Request,
    data: SvgGenerationRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
    worker_client: AsyncClient = Depends(get_worker),
):
    """
    Standard SVG Generation endpoint with atomic usage metering.

    This controller processes high-speed rendering requests by:
    1.  Verifying the existence and ownership of the requested template.
    2.  Performing an atomic 'Pre-flight Charge' via SQL to increment usage
        while strictly enforcing the customer's tier quota (Optimistic Concurrency).
    3.  Executing the Python-based template inside a secure, multi-processed
        sandbox to mitigate resource exhaustion or injection attacks.
    4.  Returning the final graphic as a raw 'image/svg+xml' response for
        direct embedding in client dashboards.

    Returns:
        Response: Raw SVG XML with no-cache headers.

    Raises:
        HTTPException: 403 (Quota Exceeded/Access Denied),
                       404 (Template Not Found),
                       400 (Sandbox execution failure).
    """
    tier_config = TIER_LIMITS.get(customer.tier, TIER_LIMITS["free"])

    if customer.usage_count >= tier_config["quota"]:
        raise HTTPException(status_code=403, detail="Quota exceeded.")

    template = (
        db.query(SVGTemplate)
        .filter(SVGTemplate.template_name == data.template_name)
        .one_or_none()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    if template.owner_id is not None and template.owner_id != customer.id:
        raise HTTPException(status_code=403, detail="Private template access denied.")

    result = db.execute(
        update(Customer)
        .where(Customer.id == customer.id)
        .where(Customer.usage_count < tier_config["quota"])
        .values(usage_count=Customer.usage_count + 1)
    )

    if result.rowcount == 0:
        raise HTTPException(status_code=403, detail="Quota exceeded.")

    payload = {
        "template_code": template.template_code,
        "params": data.params,
        "metadata": data.metadata,
    }

    response = await worker_client.post("/execute", json=payload, timeout=2.1)
    response.raise_for_status()

    svg_content = response.json()["output"]

    db.commit()
    logger.info(
        f"Generated SVG: Template='{data.template_name}' CustomerID={customer.id}"
    )

    return Response(
        content=svg_content,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/generate-predictive", status_code=status.HTTP_200_OK)
@limiter.limit(get_tier_limit)
async def generate_predictive_svg(
    request: Request,
    data: SvgGenerationRequest,
    mode: str = "both",
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
    worker_client: AsyncClient = Depends(get_worker),
):
    """
    Premium Generation Endpoint with Adaptive AI Inference.

    Engineering Flow:
    1.  **Identity & Quota**: Validates API Key and checks remaining tier usage.
    2.  **Model Selection**: Extracts 'ai_method' from metadata (defaults to polynomial).
    3.  **Validation-First Inference**: Runs PredictiveEngine BEFORE charging the user.
    4.  **Atomic Metering**: Increments usage count (2 credits) via Optimistic Concurrency.
    5.  **Isolated Rendering**: Dispatches data + AI results to the sandboxed ProcessPool.
    """
    tier_config = TIER_LIMITS.get(customer.tier, TIER_LIMITS["free"])

    if customer.usage_count >= tier_config["quota"]:
        raise HTTPException(status_code=403, detail="Quota exceeded.")

    template = (
        db.query(SVGTemplate)
        .filter(SVGTemplate.template_name == data.template_name)
        .one_or_none()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    if template.owner_id and template.owner_id != customer.id:
        raise HTTPException(
            status_code=403, detail="Access denied to private template."
        )

    raw_points = data.params.get("points", [])
    requested_method = (data.metadata or {}).get("ai_method", "auto")

    ai_results = None
    if mode in ["predictive", "both"]:
        ai_results = PredictiveEngine.get_trend(raw_points, method=requested_method)
        if "error" in ai_results:
            raise HTTPException(status_code=400, detail=ai_results["error"])

    unified_params = {
        "base_data": raw_points,
        "mode": mode,
        "ai_results": ai_results,
    }

    credits_to_deduct = 2 if mode in ["predictive", "both"] else 1
    result = db.execute(
        update(Customer)
        .where(Customer.id == customer.id)
        .where(Customer.usage_count + credits_to_deduct <= tier_config["quota"])
        .values(usage_count=Customer.usage_count + credits_to_deduct)
    )

    if result.rowcount == 0:
        raise HTTPException(
            status_code=403, detail="Quota exceeded during transaction."
        )

    payload = {
        "template_code": template.template_code,
        "params": unified_params,
        "metadata": data.metadata,
    }

    response = await worker_client.post("/execute", json=payload, timeout=2.1)
    response.raise_for_status()

    svg_content = response.json()["output"]
    db.commit()

    model_used = ai_results.get("method", requested_method) if ai_results else "none"
    logger.info(
        f"Generated Predictive SVG: Model={model_used} Credits={credits_to_deduct} CustomerID={customer.id}"
    )

    return Response(
        content=svg_content,
        media_type="image/svg+xml",
        headers={
            "X-Usage-Charged": str(credits_to_deduct),
            "X-AI-Model": model_used,
        },
    )
