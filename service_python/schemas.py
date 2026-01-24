# service_python/schemas.py
from pydantic import BaseModel, Field
from typing import Dict, Optional, Any


class SvgGenerationRequest(BaseModel):
    template_name: str = Field(..., description="Name of the template to generate.")
    params: Dict[str, Any] = Field(..., description="Data pushed from the client's DB.")
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Styling info (colors, etc)."
    )


class TemplateCreate(BaseModel):
    template_name: str = Field(..., min_length=1, max_length=100)
    template_code: str = Field(..., min_length=1)
    required_params: Dict[str, Any] = Field(
        ..., description="Required param names mapped to a description or type hint."
    )
    metadata: Optional[Dict[str, str]] = None
