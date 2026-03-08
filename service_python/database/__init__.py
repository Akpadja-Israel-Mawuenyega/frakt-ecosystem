# database/__init__.py

"""
Frakt Data Access Layer (DAL).

This package centralizes the persistence logic and data transfer objects (DTOs)
for the Frakt SVG service. It implements a decoupled architecture where:
1.  **Connection Management**: Handled via `get_db` and SQLAlchemy engines.
2.  **Object-Relational Mapping (ORM)**: Defined in `models.py` for MySQL/XAMPP.
3.  **Data Validation (Schemas)**: Defined in `schemas.py` using Pydantic V2.

By exposing these components here, the application achieves a 'Single Point of Import',
reducing circular dependencies between the API routers and the core AI engine.

Usage:
    from database import get_db, Customer, SVGTemplate
"""

from .models import Customer, SVGTemplate, Base
from .schemas import (
    SvgGenerationRequest,
    TemplateCreate,
    TemplateUpdate,
    TemplateResponse,
)
from .database import get_db

__all__ = [
    "get_db",
    "Base",
    "Customer",
    "SVGTemplate",
    "SvgGenerationRequest",
    "TemplateCreate",
    "TemplateUpdate",
    "TemplateResponse",
]
