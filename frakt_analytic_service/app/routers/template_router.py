# service_python/app/routers/template_router.py
"""
Frakt Template Management Router.

This module provides the administrative interface for managing sandboxed
SVG generation logic. it enables multi-tenant CRUD operations while
enforcing strict ownership boundaries via lookups.

Architectural Workflow:
1.  Identity Verification: Resolves the tenant via the 'x-api-key' middleware.
2.  Schema Validation: Utilizes Pydantic models (TemplateCreate/Update)
    to sanitize incoming Python code and JSON parameters.
3.  Ownership Enforcement: Every database query is scoped to the
    'current_customer.id' to prevent cross-tenant data leakage.
4.  Conflict Resolution: Handles naming collisions (e.g., duplicate
    template names for a single user) via global error handlers.

Security Note:
The 'template_code' stored here is executed in a restricted environment.
This router ensures that only authenticated users can modify the
logic associated with their unique Namespace.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session

from app.configs.limiter_config import limiter
from app.configs.logging_config import logger
from app.audit import log_event, LogSeverity
from app.middleware.middleware import get_current_active_customer, get_tier_limit
from app.database.database import get_db
from app.database.models import Customer, SVGTemplate
from app.database.schemas import TemplateCreate, TemplateUpdate, TemplateResponse


# =============================================================================
# SECTION 1: ROUTER INITIALIZATION
# =============================================================================
router = APIRouter(
    prefix="/templates",
    tags=["SVG Template Management"],
    responses={404: {"description": "Not found"}},
)


# =============================================================================
# SECTION 2A: TEMPLATE CREATION ENDPOINT
# =============================================================================
@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit(get_tier_limit)
def create_template(
    request: Request,
    template_data: TemplateCreate,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Register a new SVG generation template.

    This endpoint stores sandboxed Python code and its required parameter
    definitions. It enforces unique naming per user to prevent overwriting
    existing logic.

    **Process:**
    1. Checks if a template with the same name already exists for the customer.
    2. Initializes a new SVGTemplate instance linked to the customer's ID.
    3. Persists the Python code and parameter schema to the database.

    **Error Handling:**
    - 409 Conflict: If the template name is already in use by the same user.
    - 503 Service Unavailable: If a database transaction failure occurs.
    """
    exists = (
        db.query(SVGTemplate.id)
        .filter(
            SVGTemplate.template_name == template_data.template_name,
            SVGTemplate.owner_id == customer.id,
        )
        .first()
    )

    if exists:
        raise HTTPException(status_code=409, detail="Template name already exists.")

    new_template = SVGTemplate(
        owner_id=customer.id,
        template_name=template_data.template_name,
        template_code=template_data.template_code,
        required_params=template_data.required_params,
    )
    db.add(new_template)
    db.flush()
    log_event(
        db=db,
        customer_id=customer.id,
        action="TEMPLATE_CREATED",
        endpoint=f"/templates/{new_template.id}",
        request=request,
        status_code=201,
        severity=LogSeverity.INFO,
    )
    db.commit()
    db.refresh(new_template)

    logger.info(
        f"Template '{new_template.template_name}' created by user {customer.id}"
    )
    return {"message": "Template created", "id": new_template.id}


# =============================================================================
# SECTION 2B: BULK TEMPLATE RETRIEVAL ENDPOINT
# =============================================================================
@router.get("/", response_model=List[TemplateResponse])
@limiter.limit(get_tier_limit)
def list_templates(
    request: Request,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Retrieve all templates owned by the authenticated customer.

    Returns a list of all stored templates, including their unique IDs,
    names, and the Python logic associated with them. This is typically
    used for populating a dashboard or selection menu.

    **Security:**
    - Filters results strictly by `owner_id` to ensure data isolation.
    """
    return db.query(SVGTemplate).filter(SVGTemplate.owner_id == customer.id).all()


# =============================================================================
# SECTION 2C: SINGLE TEMPLATE RETRIEVAL ENDPOINT
# =============================================================================
@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: str,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Retrieve full details of a specific template by its ID.

    **Process:**
    1. Queries the database for the specific template ID.
    2. Verifies that the authenticated customer is the rightful owner.

    **Error Handling:**
    - 404 Not Found: If the ID does not exist or belongs to another user.
    """
    template = (
        db.query(SVGTemplate)
        .filter(SVGTemplate.id == template_id, SVGTemplate.owner_id == customer.id)
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")
    return template


# =============================================================================
# SECTION 2D: TEMPLATE UPDATE ENDPOINT
# =============================================================================
@router.patch("/{template_id}")
def update_template(
    request: Request,
    template_id: str,
    update_data: TemplateUpdate,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Partially update an existing template.

    Allows modification of the template name, the underlying Python code,
    or the required parameter definitions.

    **Process:**
    1. Locates the template while enforcing ownership.
    2. Merges only the fields provided in the request body (ignoring nulls).
    3. Commits the changes to the persistent store.

    **Error Handling:**
    - 404 Not Found: If the template is missing or unauthorized.
    - 503 Service Unavailable: If the database commit fails.
    """
    template = (
        db.query(SVGTemplate)
        .filter(SVGTemplate.id == template_id, SVGTemplate.owner_id == customer.id)
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    data = update_data.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(template, key, value)

    db.commit()
    log_event(
        db=db,
        customer_id=customer.id,
        action="TEMPLATE_UPDATED",
        request=request,
        endpoint=f"/templates/{template_id}",
        status_code=200,
        severity=LogSeverity.INFO,
    )
    db.commit()
    logger.info(f"Template {template_id} updated by user {customer.id}")
    return {"message": "Template updated successfully"}


# =============================================================================
# SECTION 2E: TEMPLATE DELETE ENDPOINT
# =============================================================================
@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    request: Request,
    template_id: str,
    customer: Customer = Depends(get_current_active_customer),
    db: Session = Depends(get_db),
):
    """
    Permanently remove a template from the repository.

    **Process:**
    1. Validates existence and ownership.
    2. Deletes the record and commits the transaction.

    **Response:**
    - Returns an empty 204 No Content response upon successful deletion.

    **Error Handling:**
    - 404 Not Found: If the template is missing or unauthorized.
    - 503 Service Unavailable: If the database is locked or unreachable.
    """
    template = (
        db.query(SVGTemplate)
        .filter(SVGTemplate.id == template_id, SVGTemplate.owner_id == customer.id)
        .first()
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    db.delete(template)
    db.commit()
    log_event(
        db=db,
        customer_id=customer.id,
        action="TEMPLATE_DELETED",
        request=request,
        endpoint=f"/templates/{template_id}",
        status_code=204,
        severity=LogSeverity.WARNING,  # Warning because this is an irreversible action
    )
    logger.warning(f"Template {template_id} deleted by user {customer.id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
