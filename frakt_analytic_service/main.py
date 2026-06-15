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
    error handlers, and a locked-down CORS policy.
4.  Unified Routing: Versioned API endpoints (/v1) for seamless
    frontend integration and backward compatibility.
"""

import uvicorn
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
from contextlib import asynccontextmanager

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

# --- PROJECT ROOT IMPORTS ---
from app.configs.logging_config import logger
from app.configs.limiter_config import limiter
from app.configs.socket_setup import get_socket_path
from app.database.database import init_db, SessionLocal
from app.database.models import LogSeverity
from app.audit import log_event
from app.middleware.error_handlers import register_error_handlers
from app.routers.generation_router import router as generation_router
from app.routers.template_router import router as template_router
from app.routers.customer_router import router as customer_router

# -----------------------------


# =============================================================================
# SECTION 1: AUDIT BACKGROUND TASK
# =============================================================================


def _write_audit_log(
    customer_id: str,
    method: str,
    path: str,
    status_code: int,
) -> None:
    """
    Background-safe audit persistence task.

    Opens its own database session independently of the request lifecycle,
    ensuring the log write succeeds even after the request context is torn down.
    Called exclusively via Starlette's BackgroundTask so it never blocks
    the HTTP response.

    Args:
        customer_id: UUID of the authenticated tenant to anchor the log entry.
        method: HTTP verb of the triggering request (e.g. 'GET', 'POST').
        path: API route path (e.g. '/v1/generate').
        status_code: HTTP response code used to derive log severity.
    """
    with SessionLocal() as db:
        log_event(
            db=db,
            customer_id=customer_id,
            action=f"API_{method}",
            endpoint=path,
            status_code=status_code,
            severity=LogSeverity.INFO if status_code < 400 else LogSeverity.ERROR,
        )


# =============================================================================
# SECTION 2: LIFESPAN & RESOURCE SYNCHRONIZATION
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Orchestrates the Gateway lifecycle and resource synchronization.

    Performs the following startup sequences in order:
    1.  **IPC Transport**: Resolves the correct communication channel to the
        Sandbox Worker. On Linux/Docker, uses a high-performance Unix Domain
        Socket. On Windows, falls back to TCP loopback for compatibility.
    2.  **State Management**: Attaches a persistent AsyncClient to app.state
        for connection pooling and HTTP keep-alive across all generation requests.
    3.  **Persistence Layer**: Runs init_db() to verify the SQLAlchemy engine
        and ensure the multi-tenant schema is reachable.

    On shutdown, drains and closes the AsyncClient connection pool to prevent
    file descriptor leakage.

    Args:
        app: The FastAPI application instance passed automatically by the framework.

    Yields:
        Control to the running application until shutdown is triggered.
    """
    logger.info("Starting Frakt API Gateway — resolving IPC transport...")

    worker_addr = get_socket_path()

    if "/" in worker_addr or "\\" in worker_addr:
        # PRODUCTION / LINUX: Unix Domain Socket — lower latency, no TCP overhead
        transport = httpx.AsyncHTTPTransport(uds=worker_addr)
        app.state.worker_client = httpx.AsyncClient(
            transport=transport,
            base_url="http://worker-internal",  # Dummy host required for UDS
            timeout=30.0,
        )
        logger.info(f"IPC Bridge established via UDS: {worker_addr}")
    else:
        # DEVELOPMENT / WINDOWS: Standard TCP loopback
        app.state.worker_client = httpx.AsyncClient(
            base_url=f"http://{worker_addr}",
            timeout=30.0,
        )
        logger.info(f"IPC Bridge established via TCP: {worker_addr}")

    init_db()
    logger.info("Persistence layer initialized. Gateway ready.")

    yield

    # Graceful teardown — drain the connection pool before process exit
    await app.state.worker_client.aclose()
    logger.info("Shutting down Frakt API. Worker client closed.")


# =============================================================================
# SECTION 3: APP CONFIGURATION & MIDDLEWARE
# =============================================================================

app = FastAPI(
    title="Frakt API",
    description="Secured, Multi-tenant, Metered SVG Generation Service.",
    lifespan=lifespan,
)

# Global error mapping (Database, Worker, and Generic exceptions)
register_error_handlers(app)

# Rate Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — restrict to known consumers in production.
# ⚠️ allow_origins=["*"] with allow_credentials=True is rejected by browsers.
#    Replace the origins list with your actual frontend domain before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # TODO: set production domain via env var
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def audit_telemetry_middleware(request: Request, call_next):
    """
    Automated Post-Execution Telemetry & Governance Layer.

    Acts as the system's flight recorder — every authenticated request
    produces an audit entry anchored to the resolved tenant identity.
    The write is dispatched as a BackgroundTask so it never adds latency
    to the HTTP response.

    Lifecycle:
        1. Passes the request downstream to the router and awaits the response.
        2. Reads the 'customer' identity injected into request.state by the
           auth dependency (None for unauthenticated routes).
        3. If a customer is present, schedules _write_audit_log as a background
           task attached to the response object.
        4. Returns the response immediately — the log write happens after.

    Severity Logic:
        - status < 400  → LogSeverity.INFO  (normal operations)
        - status >= 400 → LogSeverity.ERROR (auth failures, bad requests)
        - CRITICAL is reserved for manual triggers in the sandbox engine.

    Args:
        request: The incoming Starlette request object.
        call_next: ASGI middleware callable to forward the request downstream.

    Returns:
        The HTTP response with an attached background audit task if authenticated.
    """
    response = await call_next(request)

    # customer_id is injected into request.state by the auth dependency as a
    # plain string. Unauthenticated routes (e.g. /docs) will have none — skip
    # logging. (Read as a plain value, not via the ORM `customer` instance,
    # which may already be detached from its session by this point.)
    customer_id = getattr(request.state, "customer_id", None)

    if customer_id:
        response.background = BackgroundTask(
            _write_audit_log,
            customer_id=customer_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
        )

    return response


# =============================================================================
# SECTION 4: ROUTE REGISTRATION (V1)
# =============================================================================

app.include_router(generation_router, prefix="/v1")
app.include_router(template_router, prefix="/v1")
app.include_router(customer_router, prefix="/v1")


if __name__ == "__main__":
    # Entry point for local development only.
    # In production, invoke uvicorn directly from the Docker entrypoint instead.
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
