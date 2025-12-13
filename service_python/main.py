# service_python/main.py

from fastapi import FastAPI, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import json

from .logging_config import logger
from .generator import generate_svg_from_template
from .database import init_db, get_db
from .models import Customer, SVGTemplate
from .schemas import SvgGenerationRequest, TemplateCreate

# Import the generation logic (we will write this next)
from .generator import generate_svg_from_template 

# --- 2. Initialize FastAPI and Database ---
init_db()

app = FastAPI(
    title="Frakt API", 
    description="Secured, Multi-tenant, Metered, AI-powered, and Dynamic SVG Generation Service."
)

# --- 3. Dependency Injection: API Key Authentication ---
async def get_current_customer(
    x_api_key: str = Header(..., description="Customer's API Key"),
    db: Session = Depends(get_db)                           
):
    # Retrieves customer based on the provided API key.
    customer = db.query(Customer).filter(Customer.api_key == x_api_key).first()
    
    # 3.1. API Key validation logic
    if not customer or not customer.is_active:
        logger.warning(f"Unauthorized access attempt with API key: {x_api_key}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key."
        )
    
    return customer

# --- 4. API Endpoints ---

@app.post("/templates", status_code=status.HTTP_201_CREATED)
def create_public_template(
    template_data: TemplateCreate, 
    db: Session = Depends(get_db)
): 
    # ADMIN ENDPOINT: Saves a new, public Python SVG generation template to the database.
    
    # 4.1. Check for existing template name (must be unique)
    if db.query(SVGTemplate).filter(SVGTemplate.template_name == template_data.template_name).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template name '{template_data.template_name}' already exists."
        )

    # 4.2. Create the new Template object
    new_template = SVGTemplate(
        owner_id=None,
        template_name=template_data.template_name,
        template_code=template_data.template_code,
        required_params=template_data.required_params_json, # Store JSON string
        is_premium=template_data.is_premium,
    )

    # 4.3. Commit to Database
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    logger.info(f"Template '{new_template.template_name}' (ID: {new_template.id}) created successfully.")
    return {"message": "Template created successfully", "id": new_template.id}

@app.post("/my-templates", status_code=status.HTTP_201_CREATED)
def create_customer_template(
    template_data: TemplateCreate,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    # CUSTOMER ENDPOINT: Saves a cutomer's private Python SVG generation template to the database.
    if db.query(SVGTemplate).filter(
        SVGTemplate.template_name == template_data.template_name,
        SVGTemplate.owner_id == customer.id 
    ).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a private template named '{template_data.template_name}'."
        )

    # Create the new Template object, setting the owner_id
    new_template = SVGTemplate(
        owner_id=customer.id,
        template_name=template_data.template_name,
        template_code=template_data.template_code,
        required_params=template_data.required_params_json,
        is_premium=template_data.is_premium,
    )

    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    logger.info(f"Customer {customer.id} created private template: {new_template.template_name}.")
    return {"message": "Private template created successfully", "id": new_template.id}


@app.post("/generate", status_code=status.HTTP_200_OK)
def generate_svg(
    request: SvgGenerationRequest,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    # CUSTOMER ENDPOINT: The core product. Generates an SVG based on customer data.
    
    # 5.1. AUTHENTICATION & QUOTA CHECK
    if customer.usage_count >= customer.monthly_quota:
        logger.warning(f"Customer {customer.id} exceeded mothly quota ({customer.usage_count}/{customer.monthly_quota})")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Monthly quota exceeded.")
        
    # 5.2. RETRIEVE TEMPLATE LOGIC
    template = db.query(SVGTemplate).filter(SVGTemplate.template_name == request.template_name).first()
    
    if not template:
        logger.warning(f"Generation request for unknown template '{request.template_name}' by Customer {customer.id}.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template '{request.template_name}' not found.")
     
    # 5.3 TEMPLATE OWNERSHIP CHECK
    if template.owner_id is not None and template.owner_id != customer.id:
        logger.warning(f"Customer {customer.id} attempted to access private template '{request.template_name}' owned by {template.owner_id}.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Template is private or owned by another user.")
        
    # 5.4. EXECUTE GENERATION LOGIC
    try:
        svg_content = generate_svg_from_template(
            template_code=template.template_code, 
            params=request.params, 
            metadata=request.metadata
        )
        
        customer.usage_count += 1
        db.commit()
        
        logger.info(f"Successful generation of '{request.template_name}' for Customer {customer.id}. Usage: {customer.usage_count}.")
    except Exception as e:
        logger.error(f"Template execution failed for '{request.template_name}' (Customer {customer.id}): {e}") # <-- ADDED
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error executing template logic: {e}")
    
    # 5.5. RETURN SVG (NOTE: We need a special FastAPI Response to return raw SVG)
    from fastapi.responses import Response
    
    return Response(content=svg_content, media_type="image/svg+xml")

# To run the app: uvicorn main:app --reload