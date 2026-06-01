# service_python/app/__init__.py

"""
Frakt API: The Sovereign Gateway.

This package serves as the primary orchestration layer for the Frakt architecture,
encapsulating the complete microservice lifecycle including:
- Database (db): Multi-tenant persistence and atomic metering.
- Router Layer: Versioned endpoints for templates and SVG generation.
- Middleware: Global error mapping and tier-aware security protocols.
- Analytical Support: Predictive visualization via the integrated AI Engine.

Architecture: High-Performance Gateway with UDS IPC Capability.
"""


__version__ = "1.0.0-rc1"
__stability__ = "Production-Ready"
