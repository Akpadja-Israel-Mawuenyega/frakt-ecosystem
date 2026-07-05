# service_python/app/database/database.py
"""
Database Connection & Session Management.

This module establishes the connection to the MySQL database using SQLAlchemy.
"""

import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from .models import Base
from dotenv import load_dotenv
from app.configs.logging_config import logger

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

LOCAL_DB_URL = os.environ.get("LOCAL_DATABASE_URL")
DOCKER_DB_URL = os.environ.get("DOCKER_DATABASE_URL")
EXPLICIT_DB_URL = os.environ.get("DATABASE_URL")

# 2. Logic: If we are in Docker, 'DOCKER_ENVIRONMENT' will be True
# (We set this in the docker-compose.yml file)
IS_DOCKER = os.environ.get("DOCKER_ENVIRONMENT", "false").lower() == "true"

if EXPLICIT_DB_URL:
    # Managed platforms (Render, Railway, Heroku, ...) inject a single
    # DATABASE_URL — it wins over the local/docker split when present.
    DATABASE_URL = EXPLICIT_DB_URL
    logger.info("Sovereign Gateway: Running in MANAGED mode (DATABASE_URL).")
elif IS_DOCKER:
    DATABASE_URL = DOCKER_DB_URL
    logger.info("Sovereign Gateway: Running in DOCKER mode.")
else:
    DATABASE_URL = LOCAL_DB_URL
    logger.info("Sovereign Gateway: Running in NATIVE mode.")

# Normalize scheme shorthands to explicit SQLAlchemy driver URLs:
# Render/Heroku emit 'postgres://', and a bare 'mysql://' would pick the
# absent MySQLdb driver instead of PyMySQL.
if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]
    elif DATABASE_URL.startswith("mysql://"):
        DATABASE_URL = "mysql+pymysql://" + DATABASE_URL[len("mysql://"):]

# 3. Failsafe
if not DATABASE_URL:
    logger.critical("DATABASE_URL is missing for the current environment!")
    sys.exit(1)

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def init_db():
    """
    Synchronizes the database schema with the defined SQLAlchemy models.

    This function triggers the creation of all tables defined in 'Base.metadata'
    if they do not already exist. It is typically called during the application
    lifespan startup.

    Raises:
        SystemExit: If the connection fails, the application terminates with
                    a critical log entry to prevent running in a broken state.
    """
    logger.info("Initializing database schema...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialization successful.")
    except SQLAlchemyError as e:
        logger.critical(f"DATABASE CONNECTION FAILED: {e}")
        sys.exit(1)


def get_db():
    """
    Dependency generator for database session management.

    Yields a SQLAlchemy SessionLocal instance and ensures proper cleanup:
    1. Opens a new database connection per request.
    2. Automatically rolls back the transaction if an unhandled exception occurs.
    3. Closes the connection in the 'finally' block to prevent connection leaks.

    Yields:
        Session: A SQLAlchemy database session object.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        logger.error(f"Database transaction error: {e}")
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
