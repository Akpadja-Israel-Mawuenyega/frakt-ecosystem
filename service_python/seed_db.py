# Databse seeder for testing

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.models import Customer, SVGTemplate
from core.database import Base

DB_URL = "mysql+pymysql://root:john_wick95@localhost:3306/frakt_db"
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine)


def seed():
    """
    Database seeder
    """
    db = SessionLocal()
    try:
        if not db.query(Customer).filter_by(api_key="continental_777").first():
            test_customer = Customer(
                name="John Wick",
                api_key="continental_777",
                tier="pro",
                is_active=True,
                usage_count=0,
            )
            db.add(test_customer)

        if not db.query(SVGTemplate).filter_by(template_name="circle_test").first():
            sample_template = SVGTemplate(
                template_name="circle_test",
                template_code="<svg width='100' height='100'><circle cx='50' cy='50' r='{{ radius }}' fill='{{ color }}'/></svg>",
                required_params='["radius", "color"]',
            )
            db.add(sample_template)

        # Add this inside your seed() function in seed_db.py
        if not db.query(SVGTemplate).filter_by(template_name="sparkline").first():
            new_tmpl = SVGTemplate(
                template_name="sparkline",
                template_code="<svg width='200' height='60'><polyline fill='none' stroke='{{ color }}' stroke-width='3' points='{{ points }}'/></svg>",
                required_params='{"color": "string", "points": "string"}',
            )
            db.add(new_tmpl)

        db.commit()
        print("Database seeded successfully!")
        print("API Key: continental_777")
        print("Template: circle_test")
    except Exception as e:
        print(f"Error seeding: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
