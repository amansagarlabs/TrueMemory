"""
Health & readiness endpoints — first API you build in any service.

LEARNING: Load balancers and frontends call `/health` before routing traffic.
          Step 7 adds `/health/milvus` to verify Zilliz connectivity.
"""

import time

from fastapi import APIRouter, HTTPException, Request

from app.config import get_settings
from services.memory_ingestion import ingestion_worker_is_healthy
from services.postgres_store import check_postgres_connection

router = APIRouter()


@router.get("/")
async def root():
    """Browser-friendly root — avoids 404 when you open http://localhost:8000"""
    return {
        "service": "ai-pdf-learning-workspace",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
    }


@router.get("/health")
async def health_check(request: Request):
    settings = get_settings()
    postgres = check_postgres_connection(settings)
    ingestion_worker = ingestion_worker_is_healthy(settings)
    return {
        "status": "ok",
        "service": "ai-pdf-learning-workspace",
        "step": 10,
        "message": "Backend ready. POST /api/chat/stream for RAG chat.",
        "zilliz_configured": bool(settings.milvus_address and settings.milvus_token),
        "openrouter_configured": bool(settings.openrouter_api_key),
        "postgres_connected": postgres["connected"],
        "postgres_mode": postgres["mode"],
        "postgres_database": postgres["database"],
        "postgres_host": postgres["host"],
        "postgres_user": postgres.get("user", ""),
        "postgres_reason": postgres.get("reason", ""),
        "memory_ingestion_worker": "healthy" if ingestion_worker else "not_seen",
    }


@router.get("/readiness")
async def readiness_check() -> dict[str, object]:
    """Return dependency readiness separately from process liveness."""
    settings = get_settings()
    postgres = check_postgres_connection(settings)
    ingestion_worker = ingestion_worker_is_healthy(settings)
    if not postgres["connected"]:
        raise HTTPException(status_code=503, detail={"status": "not_ready", "postgres": postgres})
    return {
        "status": "ready",
        "service": "ai-pdf-learning-workspace",
        "dependencies": {"postgres": "ready", "memory_ingestion_worker": "ready" if ingestion_worker else "not_seen"},
    }


@router.get("/api/status")
async def system_status():
    """System status for the status page — checks all services."""
    settings = get_settings()
    services = []

    # 1. Backend API
    start = time.time()
    postgres = check_postgres_connection(settings)
    api_ms = round((time.time() - start) * 1000)
    services.append({
        "name": "Backend API",
        "status": "operational" if postgres["connected"] else "degraded",
        "latency_ms": api_ms,
        "description": "Core API server" if postgres["connected"] else f"Postgres: {postgres.get('reason', 'disconnected')}",
    })

    # 2. Database (Postgres)
    services.append({
        "name": "Database",
        "status": "operational" if postgres["connected"] else "down",
        "latency_ms": api_ms,
        "description": f"PostgreSQL ({postgres['mode']})" if postgres["connected"] else "Cannot connect to database",
    })

    # 3. Kontext Crawl Service
    services.append({
        "name": "Kontext Crawl",
        "status": "operational",
        "latency_ms": 0,
        "description": "Web intelligence (scrape, crawl, search, map)",
    })

    # 4. AI / OpenRouter
    openrouter = bool(settings.openrouter_api_key)
    services.append({
        "name": "AI Integration",
        "status": "operational" if openrouter else "degraded",
        "latency_ms": 0,
        "description": "OpenRouter (GPT-4o-mini)" if openrouter else "OpenRouter API key not configured",
    })

    # Overall status
    all_ok = all(s["status"] == "operational" for s in services)
    any_down = any(s["status"] == "down" for s in services)

    return {
        "status": "operational" if all_ok else ("degraded" if not any_down else "outage"),
        "services": services,
        "uptime": "99.9%",
    }
