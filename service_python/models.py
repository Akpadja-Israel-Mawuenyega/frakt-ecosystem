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
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    api_key = Column(String(50), unique=True, index=True)
    name = Column(String(100))

    is_active = Column(Boolean, default=True)
    usage_count = Column(Integer, default=0)
    tier =  Column(String(20), default="free")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    templates = relationship(
        "SVGTemplate", back_populates="owner", cascade="all, delete-orphan"
    )


class SVGTemplate(Base):
    __tablename__ = "templates"
    __table_args = (
        UniqueConstraint("owner_id", "template_name", name="uq_owner_template"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=True
    )
    template_name = Column(String(100), index=True)

    template_code = Column(Text)

    required_params = Column(JSON, nullable=False, default=dict)

    owner = relationship("Customer", back_populates="templates")
