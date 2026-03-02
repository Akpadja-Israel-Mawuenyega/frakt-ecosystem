# generation_router.py

from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import update
from httpx import AsyncClient

from limiter_config import limiter
from logging_config import logger
from middlewares import get_current_customer, get_tier_limit
from database import get_db
from tier_config import TIER_LIMITS
from models import Customer, SVGTemplate
from schemas import SvgGenerationRequest, TemplateCreate
from ai_engine import PredictiveEngine


router = APIRouter(
    tags=["SVG Generation"],
    responses={404: {"description": "Not found"}},
)


def get_worker(request: Request) -> AsyncClient:
    return request.app.state.worker_client


@router.post("/templates", status_code=status.HTTP_201_CREATED)
@limiter.limit(get_tier_limit)
def create_template(
    request: Request,
    template_data: TemplateCreate,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Creates a template at the endpoint **/templates**."""
    exists = (
        db.query(SVGTemplate.id)
        .filter(
            SVGTemplate.template_name == template_data.template_name,
            SVGTemplate.owner_id == customer.id,
        )
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Template name exists.")

    new_template = SVGTemplate(
        owner_id=customer.id,
        template_name=template_data.template_name,
        template_code=template_data.template_code,
        required_params=template_data.required_params,
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return {"message": "Template created", "id": new_template.id}


@router.post("/generate", status_code=status.HTTP_200_OK)
@limiter.limit(get_tier_limit)
async def generate_svg(
    request: Request,
    data: SvgGenerationRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
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

    try:
        result = db.execute(
            update(Customer)
            .where(Customer.id == customer.id)
            .where(Customer.usage_count < tier_config["quota"])
            .values(usage_count=Customer.usage_count + 1)
        )

        if result.rowcount == 0:
            raise HTTPException(status_code=403, detail="Quota exceeded.")

        worker_client = get_worker(request)
        payload = {
            "template_code": template.template_code,
            "params": data.params,
            "metadata": data.metadata,
        }

        response = await worker_client.post("/execute", json=payload, timeout=2.1)

        if response.status_code != 200:
            error_msg = response.json().get("detail", "Sandbox execution failed")
            raise HTTPException(status_code=response.status_code, detail=error_msg)

        svg_content = response.json()["output"]

        db.commit()
        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={"Cache-Control": "no-cache"},
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Critical generation failure: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")


@router.post("/generate-predictive", status_code=status.HTTP_200_OK)
@limiter.limit(get_tier_limit)
async def generate_predictive_svg(
    request: Request,
    data: SvgGenerationRequest,
    mode: str = "both",
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
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

    try:
        raw_points = data.params.get("points", [])
        # User provides method in metadata: {"ai_method": "linear" | "polynomial" | "seasonal"}
        requested_method = (data.metadata or {}).get("ai_method", "polynomial")

        ai_results = None
        if mode in ["predictive", "both"]:
            ai_results = PredictiveEngine.get_trend(raw_points, method=requested_method)
            if "error" in ai_results:
                raise HTTPException(status_code=400, detail=ai_results["error"])

        # 2. Package for Sandbox
        unified_params = {
            "base_data": raw_points,
            "mode": mode,
            "ai_results": ai_results,
        }

        # 3. Atomic Billing (Premium Rate: 2 Credits)
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

        # 4. Execute User-Code in Sandbox
        worker_client = get_worker(request)
        payload = {
            "template_code": template.template_code,
            "params": unified_params,
            "metadata": data.metadata,
        }

        response = await worker_client.post("/execute", json=payload, timeout=2.1)

        if response.status_code != 200:
            raise HTTPException(
                status_code=400, detail=response.json().get("detail", "Logic Error")
            )

        svg_content = response.json()["output"]
        db.commit()

        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={
                "X-Usage-Charged": str(credits_to_deduct),
                "X-AI-Model": ai_results.get("method", requested_method),
            },
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Critical System Failure: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")
