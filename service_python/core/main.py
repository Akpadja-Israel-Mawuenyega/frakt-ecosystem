from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import update

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from logging_config import logger
from generator import generate_svg_from_template, executor, TemplateExecutionError
from database import init_db, get_db
from tier_config import TIER_LIMITS
from models import Customer, SVGTemplate
from schemas import SvgGenerationRequest, TemplateCreate
from ai_engine import PredictiveEngine


def get_customer_tier_key(request: Request):
    api_key = request.headers.get("x-api-key")
    return api_key or get_remote_address(request)


limiter = Limiter(key_func=get_customer_tier_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Frakt API...")
    init_db()
    yield
    logger.info("Shutting down Frakt API...\n")
    logger.info("Cleaning up worker processes.")
    executor.shutdown(wait=True)


app = FastAPI(
    title="Frakt API",
    description="Secured, Multi-tenant, Metered SVG Generation Service.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


async def get_current_customer(
    x_api_key: str = Header(..., description="Customer's API Key"),
    db: Session = Depends(get_db),
) -> Customer:
    customer = db.query(Customer).filter(Customer.api_key == x_api_key).one_or_none()
    if not customer or not customer.is_active:
        logger.warning(f"Unauthorized access attempt: {x_api_key}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key.",
        )
    return customer


@app.post("/templates", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_template(
    request: Request,  # Added this to fix the limiter crash
    template_data: TemplateCreate,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
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


@app.post("/generate")
@limiter.limit("20/minute")
def generate_svg(
    request: Request,
    data: SvgGenerationRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
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
        raise HTTPException(status_code=403, detail="Private template access denied.")

    try:
        svg_content = generate_svg_from_template(
            template_code=template.template_code,
            params=data.params,
            metadata=data.metadata,
        )
        db.execute(
            update(Customer)
            .where(Customer.id == customer.id)
            .values(usage_count=Customer.usage_count + 1)
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


@app.post("/generate-predictive")
@limiter.limit("10/minute")
def generate_predictive_svg(
    request: Request,
    data: SvgGenerationRequest,
    mode: str = "both",
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
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
        raise HTTPException(status_code=403, detail="Access denied.")

    layers = {}
    try:
        if mode in ["normal", "both"]:
            layers["base"] = generate_svg_from_template(
                template_code=template.template_code,
                params={**data.params, "is_predictive": False},
                metadata=data.metadata,
            )
        if mode in ["predictive", "both"]:
            raw_points = data.params.get("points", [])
            ai_results = PredictiveEngine.get_trend(raw_points)
            if "error" in ai_results:
                raise HTTPException(status_code=400, detail=ai_results["error"])
            layers["overlay"] = generate_svg_from_template(
                template_code=template.template_code,
                params=ai_results,
                metadata=data.metadata,
            )

        db.execute(
            update(Customer)
            .where(Customer.id == customer.id)
            .values(usage_count=Customer.usage_count + 1)
        )
        db.commit()
        return {"status": "success", "layers": layers}
    except TemplateExecutionError as tee:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Execution Error: {str(tee)}")
    except Exception as e:
        db.rollback()
        logger.error(f"Predictive failure: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
