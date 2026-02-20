# generation_router.py

from fastapi import APIRouter, Depends, HTTPException, status, Header, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy import update

from limiter_config import limiter
from logging_config import logger
from generator import generate_svg_from_template, TemplateExecutionError
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
def generate_svg(
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

        svg_content = generate_svg_from_template(
            template_code=template.template_code,
            params=data.params,
            metadata=data.metadata,
        )

        db.commit()
        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={"Cache-Control": "no-cache"},
        )
    except TemplateExecutionError as tee:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(tee))
    except Exception as e:
        db.rollback()
        logger.error(f"Critical generation failure: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")


@router.post("/generate-predictive")
@limiter.limit(get_tier_limit)
def generate_predictive_svg(
    request: Request,
    data: SvgGenerationRequest,
    mode: str = "both",
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """
    Advanced generation endpoint with integrated AI forecasting.

    This controller performs a 'Charge-then-Execute' flow:
    1. Validates template ownership.
    2. Determines credit cost (AI modes are billed at 2x rate).
    3. Performs an atomic SQL update to increment usage count while enforcing quota.
    4. Runs the Linear Regression model via PredictiveEngine.
    5. Dispatches data to the isolated ProcessPool sandbox for SVG rendering.
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
        ai_results = None
        raw_points = data.params.get("points", [])

        if mode in ["predictive", "both"]:
            ai_results = PredictiveEngine.get_trend(raw_points)
            if "error" in ai_results:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ai_results["error"])

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
            raise HTTPException(status_code=403, detail="Quota exceeded.")

        svg_content = generate_svg_from_template(
            template_code=template.template_code,
            params=unified_params,
            metadata=data.metadata,
        )
        db.commit()

        return Response(
            content=svg_content,
            media_type="image/svg+xml",
            headers={"X-Layers-Generated": str(credits_to_deduct)},
        )
    except HTTPException:
        db.rollback()
        raise
    except TemplateExecutionError as tee:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Execution Error: {str(tee)}")
    except Exception as e:
        db.rollback()
        logger.error(f"Predictive failure: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")
