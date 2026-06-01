# service_python/app/database/models.py
"""
Frakt Data Persistence Layer.

A centralized schema registry utilizing SQLAlchemy 2.0. This module defines
the core entities for the multi-tenant architecture, including identity
management, sandboxed logic repositories, and immutable security trails.

Key Architectural Pillars:
1.  Multi-tenancy: Strict 'owner_id' enforcement via String-based UUIDs and Foreign Keys.
2.  Security-First: Zero-knowledge API key storage (SHA-256 hashes only).
3.  Auditability: Automatic tracking of administrative actions and timestamps.
4.  Data Integrity: Cascade deletion and Unique Constraints to prevent orphans
    and collisions.
"""

import enum
import uuid
from sqlalchemy import (
    Column,
    Integer,
    String,
    Enum,
    DateTime,
    Boolean,
    ForeignKey,
    JSON,
    Text,
)
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """
    Unified metadata registry for SQLAlchemy 2.0.

    Serves as the root for all ORM models within the Frakt ecosystem,
    enabling centralized schema migrations and reflection.
    """

    pass


class Customer(Base):
    """
    Core Multi-tenant Identity & Metering Model.

    This model manages API authentication keys and tracks real-time usage
    counts against assigned subscription tiers.

    Attributes:
        id (str): Primary key. RFC 4122 UUID stored as a string for MySQL compatibility.
        name (str): Human-readable name or organization identifier.
        email (str): Unique contact address; used for account recovery and alerts.
        hashed_api_key (str): SHA-256 hash of the 'frakt_live_...' credential.
            The raw key is never stored.
        usage_count (int): Atomic counter used for 'Pre-flight Charge' logic
            against the monthly quota.
        tier (str): Subscription level (e.g., 'free', 'pro'). Determines
            rate_limits and total quota.
        is_active (bool): Governance flag. If False, all API access is
            immediately revoked.
        created_at (datetime): Timestamp of account creation (UTC).
        updated_at (datetime): Automatically updated timestamp of the last
            record modification.
        logs (relationship): One-to-many link to the AuditLog security trail.
        templates (relationship): One-to-many link to user-defined SVG logic.
    """

    __tablename__ = "customers"

    # Identification & Authentication/Authorization
    # We use String(36) and a lambda to ensure MySQL compatibility while keeping UUID logic
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100))
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_api_key = Column(String(64), unique=True, index=True, nullable=False)

    # Tier & Usage Tracking
    usage_count = Column(Integer, default=0)
    tier = Column(String(20), default="free")

    # Governance & Compliance
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship to audit logs and templates
    logs = relationship(
        "AuditLog", back_populates="customer", cascade="all, delete-orphan"
    )
    templates = relationship(
        "SVGTemplate", back_populates="owner", cascade="all, delete-orphan"
    )


class SVGTemplate(Base):
    """
    Sandboxed Logic Repository for SVG Generation.

    Stores the Python source code and parameter definitions for dynamic
    rendering. It enforces strict ownership to ensure private templates
    remain inaccessible to other customers.

    Constraints:
        uq_owner_template: Prevents duplicate template names for a single user.

    Attributes:
        id (str): Primary key. Globally unique identifier for the SVG template.
        template_name (str): A unique, URL-friendly name for the template.
        template_code (str): Raw Python code executed inside the UDS worker.
        required_params (dict/JSON): Schema defining valid inputs for the template.
        owner_id (str): Foreign key establishing the multi-tenant boundary.
    """

    __tablename__ = "templates"
    __table_args__ = (
        UniqueConstraint("owner_id", "template_name", name="uq_owner_template"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(
        String(36),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_name = Column(String(100), index=True)

    template_code = Column(Text)

    required_params = Column(JSON, nullable=False, default=dict)

    owner = relationship("Customer", back_populates="templates")


class LogSeverity(enum.Enum):
    """
    Standardized taxonomy for system events and security telemetry.

    Used to categorize the operational impact and required response urgency
    for actions recorded in the AuditLog.
    """

    INFO = "INFO"  # Standard operational events (e.g., successful login)
    WARNING = "WARNING"  # Potential issues (e.g., high memory usage)
    ERROR = "ERROR"  # Functional failures (e.g., SVG generation timeout)
    CRITICAL = "CRITICAL"  # System-wide threats (e.g., sandbox escape attempt)


class AuditLog(Base):
    """
    Immutable Governance & Security Audit Trail.

    A high-fidelity telemetry store for recording system-wide events,
    security rotations, and sandbox execution metrics. This model provides
    the forensic data necessary for multi-tenant accountability and
    automated threat detection.

    Attributes:
        action (str): The specific operation performed (e.g., 'SVG_GENERATE').
        severity (LogSeverity): Categorized impact level (INFO, WARNING, ERROR, CRITICAL).
        endpoint (str): The specific API route targeted by the request.
        status_code (int): The HTTP response code associated with the event.
        ip_address (str): The originating IPv4/IPv6 address of the requester.
        user_agent (str): The client metadata for device/browser identification.
        customer_id (str): Foreign key linking the event to a specific tenant.
        created_at (datetime): UTC timestamp of the recorded event.
    """

    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_id = Column(
        String(36),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    action = Column(
        String(100), nullable=False
    )  # e.g., "API_KEY_ROTATED", "ACCOUNT_SOFT_DELETE"
    severity = Column(Enum(LogSeverity), default=LogSeverity.INFO, nullable=False)
    endpoint = Column(String(255), nullable=True)
    status_code = Column(Integer, nullable=True)
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationship back to the customer
    customer = relationship("Customer", back_populates="logs")
