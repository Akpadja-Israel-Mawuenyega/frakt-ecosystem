# service_python/audit.py
"""
Centralized Audit Logging Module
This module defines the `log_event` function, which serves as the single point of entry for 
recording immutable audit logs across the Frakt API infrastructure. 
It captures critical events,administrative actions, and sandbox execution 
outcomes with standardized metadata for forensic analysis.
"""

from fastapi import Request

from app.database.models import AuditLog, LogSeverity
from sqlalchemy.orm import Session


def log_event(
    db: Session,
    customer_id: str,
    action: str,
    request: Request = None,
    status_code: int = 200,
    severity: LogSeverity = LogSeverity.INFO,
    endpoint: str = None,
):
    """
    The central 'Black Box' recorder function for the Frakt API infrastructure.

    Args:
        db (Session): Active SQLAlchemy database session for persistence.
        customer_id (UUID/Binary): The unique identifier of the tenant actor.
        action (str): A standardized slug representing the event (e.g., 'SVG_GENERATE').
        endpoint (str): The specific API route or internal method invoked.
        status_code (int): The resulting HTTP or internal execution status code.
        severity (LogSeverity, optional): The categorized impact level.
            Defaults to LogSeverity.INFO.

    Returns:
        None: Records are committed directly to the persistence layer.
    """
    # Extract metadata safely from the Request object
    ip_addr = request.client.host if request else "0.0.0.0"
    user_agent = request.headers.get("user-agent", "Unknown") if request else "Unknown"
    path = request.url.path if request else endpoint

    new_log = AuditLog(
        customer_id=str(customer_id),
        action=action,
        severity=severity,
        endpoint=path,
        status_code=status_code,
        ip_address=ip_addr,
        user_agent=user_agent,
    )
    db.add(new_log)
