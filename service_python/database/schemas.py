# service_python/schemas.py

from pydantic import BaseModel, Field
from typing import Dict, Optional, Any


class SvgGenerationRequest(BaseModel):
    """
    Data Transfer Object (DTO) for SVG Rendering.

    This schema encapsulates the data required to trigger a sandboxed
    execution. It separates dynamic parameters (data) from structural
    overrides (metadata) to ensure a clean interface for client-side
    dashboards and BI tools.
    """

    template_name: str = Field(
        ...,
        description="The unique name of the stored template.",
        example="revenue_dashboard_v1",
    )
    params: Dict[str, Any] = Field(
        ...,
        description="Dynamic data to be injected into the template.",
        example={"current_month": 4500, "previous_month": 3200},
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional styling overrides or branding.",
        example={"color_scheme": "dark"},
    )


class TemplateCreate(BaseModel):
    """
    Schema for Template Ingestion and Registration.

    Enforces strict validation on new SVG logic before it enters the
    repository. This ensures that only well-formed Python code and
    schema definitions are persisted, reducing runtime rendering errors.
    """

    template_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="A unique, URL-friendly name for the template.",
    )
    template_code: str = Field(
        ...,
        min_length=1,
        description="The sandboxed Python code that generates the SVG string.",
    )
    required_params: Dict[str, Any] = Field(
        ...,
        description="Mapping of parameter names to expected types/descriptions.",
        example={"data_points": "List", "title": "str"},
    )


class TemplateUpdate(BaseModel):
    """
    Partial Update Payload for Template Refactoring.

    Implements a PATCH-compatible schema where all fields are optional.
    The model is designed to be dumped with 'exclude_unset=True' to
    perform selective updates on the SQLAlchemy model without
    overwriting existing logic with null values.
    """

    template_name: Optional[str] = Field(None, min_length=1, max_length=100)
    template_code: Optional[str] = Field(None, min_length=1)
    required_params: Optional[Dict[str, Any]] = None


class TemplateResponse(BaseModel):
    """
    Authenticated Template View Model.

    Provides a sanitized view of the SVGTemplate database record.
    By setting 'from_attributes = True', this schema allows the
    FastAPI router to automatically serialize SQLAlchemy ORM objects
    while enforcing the specific structure of the public API.
    """

    id: int
    owner_id: int
    template_name: str
    template_code: str
    required_params: Dict[str, Any]

    class Config:
        from_attributes = True
