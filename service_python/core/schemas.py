# service_python/schemas.py
from pydantic import BaseModel, Field
from typing import Dict, Optional, Any


class SvgGenerationRequest(BaseModel):
    """
    Data Transfer Object (DTO) for SVG generation requests.

    This schema validates the payload sent by clients when they want
    to render an SVG based on an existing template and their specific data.
    """

    template_name: str = Field(
        ...,
        description="The unique identifier/name of the stored template.",
        example="revenue_dashboard_v1",
    )
    params: Dict[str, Any] = Field(
        ...,
        description="Dynamic data from the client's database to be injected into the template.",
        example={"current_month": 4500, "previous_month": 3200},
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional styling overrides such as theme colors, branding, or chart dimensions.",
        example={"color_scheme": "dark", "width": 800},
    )


class TemplateCreate(BaseModel):
    """
    Schema for administrative template registration.

    Used when creating or updating the Python-based SVG templates
    stored in the central repository.
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
        description="Mapping of parameter names to their expected types or descriptions for client-side validation.",
        example={"data_points": "List of integers", "title": "String"},
    )
    metadata: Optional[Dict[str, str]] = Field(
        default=None,
        description="Additional context about the template (e.g., author, version, or category).",
    )
