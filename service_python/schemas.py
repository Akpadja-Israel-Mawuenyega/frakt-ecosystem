# service_python/schemas.py
from pydantic import BaseModel, Field
from typing import Dict, Optional, Any

# SVG generation request class
class SvgGenerationRequest(BaseModel):
    template_name: str = Field(..., description="Name of the template to generate.")
    params = Dict[str, Any] = Field(..., description="Dynamic parameters for the template.")
    
    metadata = Optional[Dict[str, Any]] = Field(None, description="Optional styling metadata.") 

# Template creation schema class
class TemplateCreate(BaseModel):
    template_name: str = Field(..., description="Unique name for the template.")
    template_code: str = Field(..., description="The Python code logic for SVG generation.")
    required_params_json: str = Field(..., description="JSON string which defines required input parameters.")
    
    is_premium: bool = False