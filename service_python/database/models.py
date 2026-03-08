# service_python/core/models.py
from sqlalchemy import (
    Column,
    Integer,
    String,
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
        api_key (str): Unique hash for Bearer authentication.
        usage_count (int): Atomic counter used for 'Pre-flight Charge' logic.
        tier (str): Determines the 'quota' and 'rate_limit' applied to the user.
        templates (relationship): One-to-many link to user-defined SVG logic.
    """

    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    api_key = Column(String(50), unique=True, index=True)
    name = Column(String(100))

    is_active = Column(Boolean, default=True)
    usage_count = Column(Integer, default=0)
    tier = Column(String(20), default="free")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

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
        template_code (str): Raw Python code executed inside the UDS worker.
        required_params (dict/JSON): Schema defining valid inputs for the template.
        owner_id (int): Foreign key establishing the multi-tenant boundary.
    """

    __tablename__ = "templates"
    __table_args__ = (
        UniqueConstraint("owner_id", "template_name", name="uq_owner_template"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    template_name = Column(String(100), index=True)

    template_code = Column(Text)

    required_params = Column(JSON, nullable=False, default=dict)

    owner = relationship("Customer", back_populates="templates")
