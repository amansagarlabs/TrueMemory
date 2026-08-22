"""Standalone entrypoint for Kontext Memory infrastructure service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.routes import memory_api
from app.routes import memory_mcp
from services.memory_store import init_memory_store
from services.memory_hot_cache import ensure_hot_cache_schema
from services.rate_limiter import ensure_rate_limit_schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    init_memory_store(settings)
    ensure_hot_cache_schema(settings)
    ensure_rate_limit_schema(settings)
    yield


api = FastAPI(
    title="Kontext Memory",
    description="Memory infrastructure API for AI agents and Kontext Assistant.",
    version="0.1.0",
    lifespan=lifespan,
)
api.include_router(memory_api.router)
api.include_router(memory_mcp.router)
