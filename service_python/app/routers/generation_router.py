# service_python/app/routers/generation_router.py
"""
Frakt SVG Generation & Inference Router.

This is the primary engine room of the Frakt service. It orchestrates
the high-level workflow of transforming raw JSON data into stamped,
AI-enhanced SVG assets.

Architectural Workflow:
1.  Identity Resolution: Validates the tenant via the 'x-api-key' middleware.
2.  Template Retrieval: Fetches the sandboxed Python logic from the DB.
3.  Predictive Inference: If requested, routes data through the AI Engine
    to generate future-trend coordinates.
4.  Sandboxed Execution: Dispatches the template code and params to the
    isolated UDS (User Defined Service) worker.
5.  Post-Processing: Stamps Y-axis scales, X-axis labels, and interactive
    elements onto the raw SVG return.
6.  Usage Metering: Incrementally updates the tenant's usage count.

Security Note:
This router enforces strict multi-tenant boundaries; a customer can only
invoke templates they explicitly own.
"""

from httpx import AsyncClient
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import update

from app.configs.limiter_config import limiter
from app.configs.logging_config import logger
from app.configs.tier_config import TIER_LIMITS
from app.audit import log_event, LogSeverity
from app.middleware.middleware import get_current_active_customer, get_tier_limit
from app.database.database import get_db
from app.database.models import Customer, SVGTemplate
from app.database.schemas import SvgGenerationRequest
from app.ai.ai_engine import PredictiveEngine
from app.routers.utils import (
    get_worker,
    append_svg_assets,
    extend_labels_for_forecast,
    calculate_clean_scale,
    map_to_pixel,
)


# =============================================================================
# SECTION 1: ROUTER INITIALIZATION
# =============================================================================
router = APIRouter(
    tags=["SVG Template Generation"],
    responses={404: {"description": "Not found"}},
)


# =============================================================================
# SECTION 2: PURE SVG GENERATION ENDPOINT
# =============================================================================
@router.post("/generate", status_code=status.HTTP_200_OK)
@limiter.limit(get_tier_limit)
async def generate_svg(
    request: Request,
    data: SvgGenerationRequest,
    customer: Customer = Depends(get_current_active_customer),
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

    raw_points = data.params.get("points", [])
    history_count = len(raw_points)
    user_labels = data.labels or []

    # Logic: Scale raw data points to pixel coordinates for the template line
    all_y_data = [p[1] if isinstance(p, list) else p for p in raw_points]
    y_min, y_range, _ = calculate_clean_scale(all_y_data)

    # Calculate standard X-spacing (800px width, 50px left margin, 20px right margin)
    margin_left = 50
    draw_width = 800 - 70
    x_step = draw_width / (history_count - 1) if history_count > 1 else 0

    render_points = [
        [margin_left + (i * x_step), map_to_pixel(all_y_data[i], y_min, y_range, 250)]
        for i in range(history_count)
    ]

    data.params["points"] = render_points
    final_labels = extend_labels_for_forecast(user_labels, 0)

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

    try:
        response = await worker_client.post("/execute", json=payload, timeout=2.1)
        response.raise_for_status()

        # Success path
        svg_content = response.json()["output"]

    except Exception as e:
        # 1. Log the CRITICAL event before the API crashes
        log_event(
            db=db,
            customer_id=customer.id if customer else "ANONYMOUS",
            action="SANDBOX_EXECUTION_CRASH",
            request=request,
            endpoint=request.url.path,
            status_code=500,
            severity=LogSeverity.CRITICAL,
        )
        db.commit()  # Ensure the log is saved before crashing
        # 2. Re-raise the exception to trigger global error handlers and return a 500 response
        logger.error(f"Worker Failure: {str(e)}")
        raise e

    if data.labels:
        # Pass original data for asset stamping to maintain scale consistency
        svg_content = append_svg_assets(
            svg_content, final_labels, all_y_data, history_count
        )

    log_event(
        db=db,
        customer_id=customer.id,
        action="SVG_RENDER_SUCCESS",
        request=request,
        endpoint="/v1/generate",
        status_code=200,
        severity=LogSeverity.INFO,
    )
    db.commit()
    logger.info(
        f"Generated SVG: Template='{data.template_name}' CustomerID={customer.id}"
    )

    return Response(
        content=svg_content,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-cache"},
    )


# =============================================================================
# SECTION 3: PREDICTIVE GENERATION ENDPOINT (PREMIUM)
# =============================================================================
@router.post("/generate-predictive", status_code=status.HTTP_200_OK)
@limiter.limit(get_tier_limit)
async def generate_predictive_svg(
    request: Request,
    data: SvgGenerationRequest,
    customer: Customer = Depends(get_current_active_customer),
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

    Returns:
        Response: A raw 'image/svg+xml' stream containing the primary chart
                  line, the dashed AI forecast, and injected axis metadata
                  (labels, dots, and scale).

    Raises:
        HTTPException:
            - 400: Prediction Engine failure (e.g., insufficient data points
                   for the requested AI method).
            - 403: Quota exceeded or attempted access to a private template
                   owned by another customer.
            - 404: The specified 'template_name' does not exist in the database.
            - 500: Sandbox execution timeout or critical worker subsystem failure.
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
    history_count = len(raw_points)

    # AI Method handling: Default to auto if not provided or set to none
    requested_method = data.ai_method if data.ai_method != "none" else "auto"

    ai_results = None
    # Predictive logic is always executed for this endpoint
    ai_results = PredictiveEngine.get_trend(raw_points, method=requested_method)
    if "error" in ai_results:
        raise HTTPException(status_code=400, detail=ai_results["error"])

    # Extract raw data for scaling
    forecast_y_raw = ai_results.get("forecast_y", []) if ai_results else []
    forecast_count = len(forecast_y_raw)
    history_y_raw = [p[1] if isinstance(p, list) else p for p in raw_points]

    # Shared Scaling Logic: History + Forecast
    all_y_data_raw = history_y_raw + forecast_y_raw
    y_min, y_range, _ = calculate_clean_scale(all_y_data_raw)

    # Standardized X calculation (Must match append_svg_assets exactly)
    margin_left = 50
    draw_width = 800 - 70
    total_len = history_count + forecast_count
    x_step = draw_width / (total_len - 1) if total_len > 1 else 0

    # Map coordinates to pixels
    render_points = [
        [
            margin_left + (i * x_step),
            map_to_pixel(history_y_raw[i], y_min, y_range, 250),
        ]
        for i in range(history_count)
    ]

    render_forecast_y = [map_to_pixel(y, y_min, y_range, 250) for y in forecast_y_raw]
    render_forecast_x = [
        margin_left + ((i + history_count) * x_step) for i in range(forecast_count)
    ]

    user_labels = data.labels or []
    final_labels = extend_labels_for_forecast(user_labels, forecast_count)

    # Ensure the template has a consistent way to see history and forecast
    unified_params = {
        "points": render_points,  # We pass the scaled pixels for the line
        "forecast_x": render_forecast_x,  # Pre-scaled forecast pixels for X-values
        "forecast_y": render_forecast_y,  # Pre-scaled forecast pixels for Y-values
        "labels": final_labels,
        "method": ai_results.get("method") if ai_results else "None",
        "confidence": ai_results.get("confidence") if ai_results else 0,
        "stroke_color": data.params.get("stroke_color", "#2ecc71"),
    }

    # Premium endpoint fixed charge
    credits_to_deduct = 2
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

    try:
        response = await worker_client.post("/execute", json=payload, timeout=2.1)
        response.raise_for_status()

        # Success path
        svg_content = response.json()["output"]

    except Exception as e:
        # 1. Log the CRITICAL event before the API crashes
        log_event(
            db=db,
            customer_id=customer.id if customer else "ANONYMOUS",
            action="SANDBOX_EXECUTION_CRASH",
            request=request,
            endpoint=request.url.path,
            status_code=500,
            severity=LogSeverity.CRITICAL,
        )
        db.commit()  # Ensure the log is saved before crashing
        # 2. Re-raise the exception to trigger global error handlers and return a 500 response
        logger.error(f"Worker Failure: {str(e)}")
        raise e

    # AUTO-APPEND Logic
    # This stamps the labels onto the SVG XML before returning it
    if final_labels:
        # Re-pass the raw Y data so append_svg_assets calculates the same Y-scale
        svg_content = append_svg_assets(
            svg_content, final_labels, all_y_data_raw, history_count
        )

    log_event(
        db=db,
        customer_id=customer.id,
        action=f"AI_PREDICTION_{requested_method.upper()}",
        request=request,
        endpoint="/v1/generate-predictive",
        status_code=200,
        severity=LogSeverity.INFO,
    )
    db.commit() 
    logger.info(f"Generated Predictive SVG: CustomerID={customer.id}")

    return Response(
        content=svg_content,
        media_type="image/svg+xml",
        headers={
            "X-Usage-Charged": str(credits_to_deduct),
            "X-AI-Model": (
                ai_results.get("method", requested_method) if ai_results else "none"
            ),
        },
    )
