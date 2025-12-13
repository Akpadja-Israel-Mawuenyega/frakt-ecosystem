# service_python/models.py
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base
from datetime import datetime

# Base class all models inherit from
Base = declarative_base()

# --- 1. Customer Model (For monetization & security) ---
class Customer(Base):
    # Stores customer details and their API Key for billing/access control.
    __tablename__ = "customers"
    
    id = Column(Integer, primary_key=True, index=True)
    api_key = Column(String(50), unique=True, index=True)
    name = Column(String(100))
    
    # Billing & quota information
    is_active = Column(Boolean, default=True)
    monthly_quota = Column(Integer, default=1000)
    usage_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.now)
    
#  ---2. Template Model (For dynamic SVG logic) ---
class SVGTemplate(Base):
    # Stores the Python code template that defines how SVGs are generated
    __tablename__ = "templates"
    
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey('customers.id'), nullable=True)
    template_name = Column(String(100), unique=True, index=True)
    
    # Dynamic ruleset or logic executed
    template_code =  Column(String(2048))
    required_params = Column(String(255))
    
    description = Column(String(255))
    is_premium = Column(Boolean, default=False)