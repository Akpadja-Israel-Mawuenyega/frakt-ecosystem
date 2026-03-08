# template_router.py

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session

from core.middleware.limiter_config import limiter
from logging_config import logger
from core.middleware import get_current_customer, get_tier_limit
from database import (
    get_db,
    Customer,
    SVGTemplate,
    TemplateCreate,
    TemplateUpdate,
    TemplateResponse,
)

router = APIRouter(
    prefix="/templates",
    tags=["SVG Template Management"],
    responses={404: {"description": "Not found"}},
)


# --- CREATE ---
@router.post("/", status_code=status.HTTP_201_CREATED)
@limiter.limit(get_tier_limit)
def create_template(
    request: Request,
    template_data: TemplateCreate,
    customer: Customer = Depends(get_current_customer),
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
    db.commit()
    db.refresh(new_template)

    logger.info(
        f"Template '{new_template.template_name}' created by user {customer.id}"
    )
    return {"message": "Template created", "id": new_template.id}


# --- LIST ALL ---
@router.get("/", response_model=List[TemplateResponse])
def list_templates(
    customer: Customer = Depends(get_current_customer), db: Session = Depends(get_db)
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


# --- GET ONE ---
@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: int,
    customer: Customer = Depends(get_current_customer),
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


# --- UPDATE ---
@router.patch("/{template_id}")
def update_template(
    template_id: int,
    update_data: TemplateUpdate,
    customer: Customer = Depends(get_current_customer),
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
    logger.info(f"Template {template_id} updated by user {customer.id}")
    return {"message": "Template updated successfully"}


# --- DELETE ---
@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    customer: Customer = Depends(get_current_customer),
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
    logger.warning(f"Template {template_id} deleted by user {customer.id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
