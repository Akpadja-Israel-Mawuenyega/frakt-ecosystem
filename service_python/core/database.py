# service_python/database.py
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.models import Base
from dotenv import load_dotenv
from core.logging_config import logger

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")


connect_args = {}
if DATABASE_URL and DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,  
    max_overflow=20,  
    pool_pre_ping=True,  
    connect_args=connect_args,
)

SessionLocal = sessionmaker(
    autocommit=False,  
    autoflush=False,
    bind=engine,
)


def init_db():
    logger.info("Initializing database schema...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialization successful.")
    except Exception as e:
        logger.critical(f"DATABASE CONNECTION FAILED: {e}")
        sys.exit(1)


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

