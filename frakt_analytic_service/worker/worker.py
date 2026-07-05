# service_python/worker/worker.py
"""
Frakt Sovereign Worker Muscle.

The high-performance execution node for the Frakt ecosystem. This service
operates as an isolated rendering engine, receiving Python logic from the
Gateway and executing it within a strictly resource-constrained sandbox.

Key Architectural Pillars:
1.  Lifespan Management: Performs a 'Warm-Up' sequence on startup to
    synchronize the ProcessPool, ensuring zero-latency on the first request.
2.  Hardware-Enforced Timeouts: Dispatches template logic to sub-processes
    with a 2.0s watchdog to prevent CPU-pinning attacks.
3.  Error Propagation: Translates internal 'TemplateExecutionErrors'
    into standard 400-level HTTP responses for the Gateway to consume.
4.  Infrastructure Agnostic: Configurable for both Unix Domain Sockets (UDS)
    and TCP-based local communication.
"""

import hmac
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

# Import from our local package files
from worker.generator import generate_svg_from_template, executor, TemplateExecutionError
from worker.logger import worker_logger as logger


# =============================================================================
# SECTION 1: DATA TRANSFER OBJECTS (DTOs)
# =============================================================================

class ExecutionRequest(BaseModel):
    """DTO for the internal UDS handshake between Gateway and Worker."""

    template_code: str
    params: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None


# =============================================================================
# SECTION 2: LIFECYCLE & PROCESS POOL WARM-UP
# =============================================================================

def warm_up():
    """
    Simple process called by the lifespan manager to warm up the system. \n
    Returns **True**.
    """
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the worker lifecycle. \n
    Warms the ProcessPool on startup to ensure the first request is fast.
    """
    logger.info("Initializing Sandbox Worker Subsystem...")
    try:
        # Submit a no-op task to 'spin up' the OS processes in the pool
        future = executor.submit(warm_up)
        future.result(timeout=5.0)
        logger.info("Sandbox ProcessPool is warm and synchronized.")
    except Exception as e:
        logger.error(f"Failed to warm Sandbox Pool: {e}")

    yield

    logger.info("Shutting down Sandbox Executor...")
    executor.shutdown(wait=True)


# =============================================================================
# SECTION 3: THE EXECUTION PIPELINE
# =============================================================================

app = FastAPI(title="Frakt Sandbox Worker", lifespan=lifespan)

# Shared secret required on /execute when the worker is reachable over a real
# network (separate deployment) instead of a private UDS/loopback channel.
# Unset = open, preserving the local UDS/loopback workflow.
WORKER_AUTH_TOKEN = os.environ.get("WORKER_AUTH_TOKEN")


@app.get("/health")
def health():
    """Liveness probe for load balancers / Render health checks."""
    return {"status": "ok"}


@app.post("/execute")
def execute(req: ExecutionRequest, x_worker_token: Optional[str] = Header(default=None)):
    """
    Entry point for sandboxed execution.
    Dispatches to a sub-process with a 2.0s hardware timeout.
    """
    if WORKER_AUTH_TOKEN and not hmac.compare_digest(
        x_worker_token or "", WORKER_AUTH_TOKEN
    ):
        raise HTTPException(status_code=401, detail="Invalid worker token.")

    try:
        svg_output = generate_svg_from_template(
            template_code=req.template_code, params=req.params, metadata=req.metadata
        )

        return {"output": svg_output}

    except TemplateExecutionError as tee:
        raise HTTPException(status_code=400, detail=str(tee))
    except Exception as e:
        logger.error(f"Worker-level system failure: {e}")
        raise HTTPException(
            status_code=500, detail=f"Sandbox Critical Failure: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn

    # ... (your path setup code) ...
    from app.configs.socket_setup import get_socket_path

    # Now get_socket_path returns "127.0.0.1:8008"
    addr = get_socket_path()
    host, port = addr.split(":")

    print(f"🚀 Sovereign Worker Muscle igniting on TCP: {addr}")

    uvicorn.run("worker.worker:app", host=host, port=int(port), factory=False)
