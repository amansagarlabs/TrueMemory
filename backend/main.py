"""
FastAPI entrypoint — Kontext backend.

WHY this file exists:
  Single place to wire routes, CORS, and lifespan hooks.
  Production apps keep `main.py` thin and push logic into `app/` and `services/`.
"""

from contextlib import asynccontextmanager
import logging
import os
import time
import uuid

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load configuration before importing routes because some integrations
# initialize provider clients at module import time.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

from app.config import get_settings
from app.routes import auth, chat, coding, health, pipeline, upload, ocr, amancrawl, dashboard, subscriptions, integrations, query, evaluation, knowledge, projects, skills, workspaces, models, memory_api, memory_mcp, ingestion
from services.memory_store import init_memory_store
from services.memory_hot_cache import ensure_hot_cache_schema
from services.rate_limiter import ensure_rate_limit_schema
from services.memory_ingestion import ensure_memory_ingestion_schema
from services.postgres_store import postgres_enabled

request_logger = logging.getLogger("kontext.request")


def _validate_runtime_configuration(settings) -> None:
    """Reject development-only or incomplete settings before serving traffic."""
    if settings.environment not in {"production", "staging"}:
        return
    missing = []
    if not settings.database_url:
        missing.append("DATABASE_URL")
    if not settings.aman_jwt_secret:
        missing.append("AMAN_JWT_SECRET")
    if not settings.cors_origins or any("localhost" in origin or "127.0.0.1" in origin for origin in settings.cors_origins):
        raise RuntimeError("production CORS_ORIGINS must contain only explicit public origins")
    if not settings.auth_cookie_secure:
        raise RuntimeError("AUTH_COOKIE_SECURE must be enabled outside development")
    if os.getenv("KONTEXT_ENABLE_TEST_AUTH") == "1":
        raise RuntimeError("KONTEXT_ENABLE_TEST_AUTH is forbidden outside development")
    if missing:
        raise RuntimeError(f"missing required production settings: {', '.join(missing)}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown — Step 7 will connect Milvus here."""
    settings = get_settings()
    _validate_runtime_configuration(settings)
    app.state.settings = settings
    init_memory_store(settings)
    ensure_hot_cache_schema(settings)
    ensure_rate_limit_schema(settings)
    if postgres_enabled(settings):
        ensure_memory_ingestion_schema(settings)
    if settings.warm_retrieval_models:
        from app.routes.chat import warm_hybrid_retriever

        try:
            warm_hybrid_retriever(settings)
        except Exception:
            # Retrieval remains lazy if a model is unavailable at startup.
            pass
    yield


api = FastAPI(
    title="Kontext API",
    description="Kontext backend for memory, context, and web intelligence.",
    version="0.1.0",
    lifespan=lifespan,
)


@api.middleware("http")
async def request_observability(request, call_next):
    """Correlate requests and record safe boundary timing metadata."""
    raw_request_id = request.headers.get("x-request-id", "").strip()
    request_id = raw_request_id[:128] if raw_request_id and all(char.isalnum() or char in "-_." for char in raw_request_id) else str(uuid.uuid4())
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        request_logger.exception(
            "request_failed",
            extra={"request_id": request_id, "method": request.method, "path": request.url.path},
        )
        raise
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    request_logger.info(
        "request_complete",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response

api.include_router(health.router)
api.include_router(auth.router)
api.include_router(upload.router)
api.include_router(ocr.router)
api.include_router(pipeline.router)
api.include_router(chat.router)
api.include_router(query.router)
api.include_router(amancrawl.router)
api.include_router(dashboard.router)
api.include_router(subscriptions.router)
api.include_router(integrations.router)
api.include_router(evaluation.router)
api.include_router(knowledge.router)
api.include_router(skills.router)
api.include_router(workspaces.router)
api.include_router(coding.router)
api.include_router(coding.preview_router)
api.include_router(coding.worker_router)
api.include_router(projects.router)
api.include_router(models.router)
api.include_router(memory_api.router)
api.include_router(ingestion.router)
api.include_router(memory_mcp.router)

settings = get_settings()
# Keep CORS outermost so unexpected server errors still return browser-readable headers.
app = CORSMiddleware(
    app=api,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Coding-Agent-Run-Id"],
)
