# service_python/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base
from dotenv import load_dotenv
from logging_config import logger


load_dotenv()

# --- 1. Database configurations ---
DATABASE_URL = os.environ.get("DATABASE_URL")

# --- 2. Engine setup ---
engine = create_engine(
    DATABASE_URL,
    echo=True
)

# --- 3. Session factory
SessionLocal = sessionmaker(
    autoflush=True,
    bind=engine,
)

# --- 4. Initialization ---
def init_db():
    print("Connecting to database...")
    logger.info("Connecting to MySQL and checking/creating tables...") 
    
    try:
        Base.metadata.create_all(bind=engine) 
        logger.info("MySQL tables checked/created successfully.") 
    except Exception as e:
        logger.error(f"!!! FATAL CONNECTION ERROR: {e}")
        logger.critical(f"FATAL DB ERROR: {e}")
    
# --- 5. Dependency for FastAPI ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    except:
        db.rollback() 
        raise
    finally:
        db.close()
        logger.info("Database connection closed.")

if __name__ == "__main__":
    try:
        init_db()
    except Exception as e:
        print("\n--- EXTERNAL STARTUP ERROR CATCHED ---")
        print(f"The program crashed outside of the init_db try block. Error: {e}")
        print("--------------------------------------\n")