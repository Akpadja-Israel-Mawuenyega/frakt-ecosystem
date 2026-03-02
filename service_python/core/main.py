import uvicorn
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from limiter_config import limiter
from logging_config import logger
from database import init_db
from worker.generator import executor
from routers.generation_router import router as generation_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Frakt API...")
    
    transport = httpx.AsyncHTTPTransport(uds="/tmp/frakt_worker.sock")
    app.state.worker_client = httpx.AsyncClient(transport=transport, base_url="http://worker")
    
    init_db()
    executor.submit(lambda: "warm")
    yield
    
    await app.state.worker_client.close()
    logger.info("Shutting down Frakt API...")


app = FastAPI(
    title="Frakt API",
    description="Secured, Multi-tenant, Metered SVG Generation Service.",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generation_router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
