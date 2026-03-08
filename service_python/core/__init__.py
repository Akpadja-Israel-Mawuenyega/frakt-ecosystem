"""
Frakt Core: Infrastructure and Analytical Support Layer.

Provides the cross-cutting concerns essential to the Frakt architecture,
including:
- AI Engine: Supervised learning pipelines for predictive visualization.
- Middleware: Tier-based rate limiting, authentication, and global
  exception mapping.

This layer decouples specialized domain logic from the routing tier
to ensure a clean, maintainable microservice boundary.
"""
