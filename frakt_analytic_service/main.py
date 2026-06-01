# service_python/main.py
"""
Frakt API Gateway & Orchestration Layer.

The central entry point for the Frakt ecosystem. This module initializes
the FastAPI application, establishes the Inter-Process Communication (IPC)
bridge to the Sandbox Worker, and registers the multi-tenant routing logic.

Key Architectural Pillars:
1.  Lifespan Orchestration: Manages the lifecycle of the Worker connection
    pool and the persistence layer (SQLAlchemy).
2.  Smart IPC Resolver: Dynamically switches between high-performance
    Unix Domain Sockets (Production) and TCP loopback (Development).
3.  Defensive Middleware: Implements tier-aware rate limiting, global
    error handlers, and a permissive but secured CORS policy.
4.  Unified Routing: Versioned API endpoints (/v1) for seamless
    frontend integration and backward compatibility.
"""

import uvicorn
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

# --- PROJECT ROOT IMPORTS ---
# Import via the 'app' package namespace to ensure path consistency
from app.configs.logging_config import logger
from app.configs.limiter_config import limiter
from app.configs.socket_setup import get_socket_path
from app.database.database import init_db, SessionLocal
from app.database.models import LogSeverity
from app.audit import log_event
from app.middleware.error_handlers import register_error_handlers
from app.routers.generation_router import router as generation_router
from app.routers.template_router import router as template_router

# -----------------------------


# =============================================================================
# SECTION 1: LIFESPAN & RESOURCE SYNCHRONIZATION
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Orchestrates the Gateway lifecycle and resource synchronization.

    This manager performs the following critical start-up sequences:
    1.  **Inter-Process Communication (IPC)**: Establishes a communication bridge
        to the Sandbox Worker. Uses a Smart Resolver to select between
        high-performance Unix Domain Sockets (Linux/Docker) or stable
        TCP loopback (Windows).
    2.  **State Management**: Attaches a persistent AsyncClient to 'app.state'
        to ensure connection pooling and keep-alive across all generation requests.
    3.  **Persistence Layer**: Initializes the database engine and verifies
        the connection to the multi-tenant schema.

    On shutdown, it ensures the AsyncClient connection pool is gracefully
    drained and closed to prevent resource leakage.
    """
    logger.info("Starting Frakt API Gateway & Initializing Worker Bridge...")

    # The Smart Resolver handles the OS-specific logic internally
    worker_addr = get_socket_path()
    logger.info("Starting Frakt API Gateway & Initializing UDS Transport...")

    # Establish the private corridor (socket connection) to the Sandbox Worker
    if "/" in worker_addr or "\\" in worker_addr:
        # PRODUCTION/LINUX MODE: Use Unix Domain Socket transport
        transport = httpx.AsyncHTTPTransport(uds=worker_addr)
        app.state.worker_client = httpx.AsyncClient(
            transport=transport,
            base_url="http://worker-internal",  # Dummy host for UDS
            timeout=30.0,
        )
        logger.info(f"IPC Bridge established via UDS: {worker_addr}")
    else:
        # NATIVE/WINDOWS MODE: Use standard TCP
        app.state.worker_client = httpx.AsyncClient(
            base_url=f"http://{worker_addr}", timeout=30.0
        )
        logger.info(f"IPC Bridge established via TCP: {worker_addr}")

    init_db()
    yield

    # Graceful teardown of the UDS connection pool
    await app.state.worker_client.aclose()
    logger.info("Shutting down Frakt API...")


# =============================================================================
# SECTION 2: APP CONFIGURATION & MIDDLEWARE
# =============================================================================

app = FastAPI(
    title="Frakt API",
    description="Secured, Multi-tenant, Metered SVG Generation Service.",
    lifespan=lifespan,
)

# Global error mapping (Database, Worker, and Generic exceptions)
register_error_handlers(app)

# Rate Limiting Configuration
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security: CORS Policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def audit_telemetry_middleware(request: Request, call_next):
    """
    Automated Post-Execution Telemetry & Governance Layer.

    Intersects the HTTP lifecycle post-response to capture and persist
    transactional metadata. This middleware acts as the 'System Flight Recorder,'
    resolving the authenticated 'Customer' identity from the request state
    to anchor forensic logs to a specific tenant.

    Lifecycle:
        1. Yields execution to the downstream router/worker logic.
        2. Captures the resulting HTTP status code and response headers.
        3. Extracts the 'Customer' ORM entity injected by the auth middleware.
        4. Dispatches an asynchronous commit to the 'audit_logs' persistence layer.

    Logic:
        - Status < 400: Records as LogSeverity.INFO (Normal Operations).
        - Status >= 400: Records as LogSeverity.ERROR (Functional/Auth Failures).
        - Note: CRITICAL severity is reserved for manual triggers in the engine/sandbox.
    """
    # 1. Execute the request
    response = await call_next(request)

    # 2. Post-Execution: Capture the "Identity" if it was resolved
    # Note: We use a background task or a fresh session to avoid blocking
    customer = getattr(request.state, "customer", None)

    if customer:
        with SessionLocal() as db:
            log_event(
                db=db,
                customer_id=customer.id,
                action=f"API_{request.method}",
                endpoint=request.url.path,
                status_code=response.status_code,
                severity=(
                    LogSeverity.INFO
                    if response.status_code < 400
                    else LogSeverity.ERROR
                ),
            )

    return response


# =============================================================================
# SECTION 3: ROUTE REGISTRATION (V1)
# =============================================================================
app.include_router(generation_router, prefix="/v1")
app.include_router(template_router, prefix="/v1")

if __name__ == "__main__":
    # In the root, we point uvicorn to the 'main' file and the 'app' instance
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
