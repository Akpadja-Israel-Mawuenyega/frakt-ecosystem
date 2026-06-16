# Set the test database URL before any app module is imported so that
# database.py's module-level engine is pointed at SQLite, not MySQL.
import os
os.environ.setdefault("LOCAL_DATABASE_URL", "sqlite:///./frakt_test.db")

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock

from app.database.models import Base, Customer, SVGTemplate
from app.database.database import get_db
from app.routers.utils import generate_secure_api_key
from app.middleware.middleware import _tier_cache
from main import app

# ---------------------------------------------------------------------------
# Shared SQLite engine — all test sessions use the same file so that
# module-level SessionLocal instances in middleware and audit code can read
# rows committed by the test's overridden get_db session.
# ---------------------------------------------------------------------------
TEST_DB_URL = "sqlite:///./frakt_test.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

MINIMAL_SVG = '<svg viewBox="0 0 800 250" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'

# Create schema once when the test session starts.
Base.metadata.create_all(test_engine)


# ---------------------------------------------------------------------------
# Autouse: wipe all rows + tier cache between every test for isolation.
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with TestSession() as s:
        s.execute(text("DELETE FROM audit_logs"))
        s.execute(text("DELETE FROM templates"))
        s.execute(text("DELETE FROM customers"))
        s.commit()
    _tier_cache.clear()


# ---------------------------------------------------------------------------
# Database session fixture — shared by the route handler (via override) and
# helper fixtures that create test data.
# ---------------------------------------------------------------------------
@pytest.fixture
def db_session():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Worker mock — replaces app.state.worker_client with an AsyncMock that
# returns a minimal valid SVG.  Tests that need to simulate a worker failure
# can set mock_worker.post.side_effect = Exception(...).
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_worker():
    mock = AsyncMock()
    ok_response = MagicMock()
    ok_response.json.return_value = {"output": MINIMAL_SVG}
    ok_response.raise_for_status = MagicMock(return_value=None)
    mock.post.return_value = ok_response
    return mock


# ---------------------------------------------------------------------------
# HTTP test client — wires the test DB session into FastAPI's DI system and
# injects the worker mock into app state after the lifespan runs.
# ---------------------------------------------------------------------------
@pytest.fixture
def client(db_session, mock_worker):
    def _get_test_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_test_db

    with TestClient(app, raise_server_exceptions=False) as c:
        # The lifespan has now run and set app.state.worker_client to a real
        # httpx client.  Override it immediately with our mock.
        app.state.worker_client = mock_worker
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Canned fixtures for a single authenticated customer + one owned template.
# ---------------------------------------------------------------------------
@pytest.fixture
def test_customer(db_session):
    raw_key, hashed_key = generate_secure_api_key()
    customer = Customer(
        name="Test Customer",
        email="test@example.com",
        hashed_api_key=hashed_key,
        tier="pro",
        usage_count=0,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    return customer, raw_key


@pytest.fixture
def test_template(db_session, test_customer):
    customer, _ = test_customer
    template = SVGTemplate(
        owner_id=customer.id,
        template_name="test_chart",
        template_code=f"svg_output = '{MINIMAL_SVG}'",
        required_params={},
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template
