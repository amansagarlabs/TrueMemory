"""Standalone entrypoint for TrueMemory Memory infrastructure service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.routes import memory_api
from app.routes import memory_mcp
from services.memory_store import init_memory_store
from services.memory_hot_cache import ensure_hot_cache_schema
from services.rate_limiter import ensure_rate_limit_schema
from services.postgres_store import postgres_enabled


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    if settings.environment in {"production", "staging"} and not postgres_enabled(settings):
        raise RuntimeError("Postgres is required for production Memory API and MCP services.")
    if not postgres_enabled(settings):
        init_memory_store(settings)
    ensure_hot_cache_schema(settings)
    ensure_rate_limit_schema(settings)
    yield


api = FastAPI(
    title="TrueMemory Memory",
    description="Memory infrastructure API for AI agents and TrueMemory Assistant.",
    version="0.1.0",
    lifespan=lifespan,
)
api.include_router(memory_api.router)
api.include_router(memory_mcp.router)
