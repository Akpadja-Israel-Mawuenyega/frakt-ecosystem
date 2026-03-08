# core/middleware/error_handlers.py

import httpx
from fastapi import Request, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from service_python.logging_config import logger


def register_error_handlers(app: FastAPI):
    """
    Hooks the global exception handlers into the FastAPI application instance.
    Ensures consistent JSON error responses across all routers.
    """
    app.add_exception_handler(IntegrityError, integrity_handler)
    app.add_exception_handler(SQLAlchemyError, database_handler)
    app.add_exception_handler(httpx.HTTPStatusError, worker_http_handler)
    app.add_exception_handler(httpx.TimeoutException, worker_timeout_handler)
    app.add_exception_handler(Exception, global_exception_handler)


# 1. DATABASE CONFLICTS
async def integrity_handler(request: Request, exc: IntegrityError):
    """
    Handles database constraint violations (e.g., unique name conflicts).
    Returns 409 Conflict.
    """
    logger.warning(f"DB Conflict: {exc}")
    return JSONResponse(status_code=409, content={"detail": "Conflict detected."})


# 2. DB SYSTEM FAILURES
async def database_handler(request: Request, exc: SQLAlchemyError):
    """
    Handles general database execution or connection failures.
    Returns 503 Service Unavailable.
    """
    logger.error(f"Database Error: {exc}")
    return JSONResponse(status_code=503, content={"detail": "Database unavailable."})


# 3. DOWNSTREAM SERVICE FAILURES (The Worker)
async def worker_http_handler(request: Request, exc: httpx.HTTPStatusError):
    """
    Handles non-200 responses from the sandboxed worker microservice.
    Returns 502 Bad Gateway.
    """
    logger.error(f"Worker Error: {exc.response.status_code}")
    return JSONResponse(
        status_code=502, content={"detail": "Downstream service error."}
    )


# 4. DOWNSTREAM TIMEOUTS
async def worker_timeout_handler(request: Request, exc: httpx.TimeoutException):
    """
    Handles network-level timeouts when communicating with the worker.
    Returns 504 Gateway Timeout.
    """
    logger.warning(f"Worker Timeout: {exc}")
    return JSONResponse(
        status_code=504, content={"detail": "Downstream service timed out."}
    )


# 5. THE ULTIMATE SAFETY NET (Generic 500)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for any unhandled Python exceptions.
    Logs full traceback for internal debugging and returns 500 Internal Server Error.
    """
    logger.critical(f"Unhandled Exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})
