from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

# Import from our local package files
from worker.generator import generate_svg_from_template, executor, TemplateExecutionError
from worker.logger import worker_logger as logger


class ExecutionRequest(BaseModel):
    """DTO for the internal UDS handshake between Gateway and Worker."""

    template_code: str
    params: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the worker lifecycle.
    Warms the ProcessPool on startup to ensure the first request is fast.
    """
    logger.info("Initializing Sandbox Worker Subsystem...")
    try:
        # Submit a no-op task to 'spin up' the OS processes in the pool
        future = executor.submit(lambda: True)
        future.result(timeout=5.0)
        logger.info("Sandbox ProcessPool is warm and synchronized.")
    except Exception as e:
        logger.error(f"Failed to warm Sandbox Pool: {e}")

    yield

    logger.info("Shutting down Sandbox Executor...")
    executor.shutdown(wait=True)


app = FastAPI(title="Frakt Sandbox Worker", lifespan=lifespan)


@app.post("/execute")
def execute(req: ExecutionRequest):
    """
    Entry point for sandboxed execution.
    Dispatches to a sub-process with a 2.0s hardware timeout.
    """
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
