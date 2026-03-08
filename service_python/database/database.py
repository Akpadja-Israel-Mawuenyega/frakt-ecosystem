import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
from database.models import Base
from dotenv import load_dotenv
from logging_config import logger

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    logger.critical("DATABASE_URL environment variable is not set.")
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
