import uvicorn
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from core.middleware.limiter_config import limiter
from logging_config import logger
from database import init_db
from core.middleware import register_error_handlers
from routers import template_router, generation_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Orchestrates the Gateway lifecycle and resource synchronization.

    This manager performs the following critical start-up sequences:
    1.  **UDS Initialization**: Configured a high-performance AsyncHTTPTransport
        linked to the shared '/tmp/sockets/worker.sock' volume for low-latency
        inter-container communication.
    2.  **State Management**: Attaches a persistent AsyncClient to 'app.state'
        to ensure connection pooling across all generation requests.
    3.  **Persistence Layer**: Initializes the database engine (MySQL/XAMPP)
        and verifies the connection to the multi-tenant schema[cite: 1].

    On shutdown, it ensures all active file descriptors and UDS connections
    are gracefully closed to prevent resource leakage.
    """
    logger.info("Starting Frakt API Gateway & Initializing UDS Transport...")

    # Establish the private corridor (socket connection) to the Sandbox Worker
    transport = httpx.AsyncHTTPTransport(uds="/tmp/sockets/worker.sock")
    app.state.worker_client = httpx.AsyncClient(
        transport=transport, base_url="http://worker-sandbox"
    )

    init_db()
    yield

    # Graceful teardown of the UDS connection pool
    await app.state.worker_client.aclose()
    logger.info("Shutting down Frakt API...")


app = FastAPI(
    title="Frakt API",
    description="Secured, Multi-tenant, Metered SVG Generation Service.",
    lifespan=lifespan,
)

register_error_handlers(app)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generation_router, prefix="/v1")
app.include_router(template_router, prefix="/v1")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
