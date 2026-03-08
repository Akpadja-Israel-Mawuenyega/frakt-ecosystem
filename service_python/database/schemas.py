# service_python/schemas.py
from pydantic import BaseModel, Field
from typing import Dict, Optional, Any


class SvgGenerationRequest(BaseModel):
    """Schema for rendering an SVG from an existing template."""

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
    """Schema for creating a new SVG template."""

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
    """Schema for updating an existing template. All fields optional."""

    template_name: Optional[str] = Field(None, min_length=1, max_length=100)
    template_code: Optional[str] = Field(None, min_length=1)
    required_params: Optional[Dict[str, Any]] = None


class TemplateResponse(BaseModel):
    """Schema for returning template data. Includes DB-generated fields."""

    id: int
    owner_id: int
    template_name: str
    template_code: str
    required_params: Dict[str, Any]

    class Config:
        from_attributes = True  # Critical for SQLAlchemy compatibility
