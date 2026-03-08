# routers/__init__.py

"""
Main routing package for the Frakt service.
Exports all API routers for centralized registration in the main application.
"""

from .template_router import router as template_router
from .generation_router import router as generation_router

__all__ = ["template_router", "generation_router"]
