"""
Dashboard API routes — real-time stats for the Kontext dashboard.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.memory_core import MemoryClient
from services.memory_store import (
    list_local_artifacts,
)
from services.postgres_store import check_postgres_connection
from services.postgres_store import (
    list_recent_artifacts,
    list_recent_conversations,
    postgres_enabled,
    resolve_user_id,
    _connect as pg_connect,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class CrawlUsage(BaseModel):
    used: int = 0
    limit: int = 0
    period: str = "day"


class DashboardStats(BaseModel):
    conversations: int = 0
    memory_entries: int = 0
    artifacts: int = 0
    crawl_jobs: int = 0
    pages_crawled: int = 0
    crawl_scrape: CrawlUsage = CrawlUsage()
    crawl_search: CrawlUsage = CrawlUsage()
    crawl_map: CrawlUsage = CrawlUsage()
    crawl_crawl: CrawlUsage = CrawlUsage()
    errors: list[str] = []


class ConversationItem(BaseModel):
    id: str
    title: str
    updated_at: str
    message_count: int = 0
    last_message: str | None = None


class MemoryItem(BaseModel):
    key: str
    content: str
    source: str
    updated_at: str


class MemoryImportItem(BaseModel):
    key: str
    content: str
    source: str = "import"


class MemoryImportRequest(BaseModel):
    items: list[MemoryImportItem]


class MemoryActionRequest(BaseModel):
    action: str = Field(..., pattern="^(edit|pin|unpin|approve|reject|archive)$")
    content: str | None = Field(default=None, max_length=4000)


def _get_crawl_usage(settings, user_id: str) -> dict[str, dict]:
    """Get crawl usage from Postgres usage_aggregates with correct daily periods."""
    now = datetime.now(timezone.utc)
    resources = {
        "crawl:scrape": "day",
        "crawl:search": "day",
        "crawl:map": "day",
        "crawl:crawl": "month",
    }
    result = {}

    with pg_connect(settings) as conn:
        with conn.cursor() as cur:
            # Get plan limits
            cur.execute("""
                SELECT pl.resource_key, pl.limit_value, pl.limit_period
                FROM plan_limits pl
                JOIN plans p ON p.id = pl.plan_id
                JOIN users u ON u.plan = p.plan_key
                WHERE u.id = %s
            """, (user_id,))
            limits = {row["resource_key"]: row["limit_value"] for row in cur.fetchall()}

            for rk, period in resources.items():
                # Compute correct period start
                if period == "day":
                    period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                else:
                    if now.month == 12:
                        period_start = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                    else:
                        period_start = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
                    # For monthly, use start of current month
                    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

                cur.execute("""
                    SELECT COALESCE(SUM(total_quantity), 0) as used
                    FROM usage_aggregates
                    WHERE user_id = %s AND resource_key = %s AND period_start = %s
                """, (user_id, rk, period_start))
                used = cur.fetchone()["used"]

                # Compute reset_at
                if period == "day":
                    reset_at = (now + __import__("datetime").timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
                else:
                    if now.month == 12:
                        reset_at = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
                    else:
                        reset_at = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)

                limit_val = limits.get(rk, 0)
                result[rk] = {
                    "used": used,
                    "limit": limit_val,
                    "period": period,
                    "remaining": max(0, limit_val - used) if limit_val > 0 else -1,
                }

    return result


@router.get("/stats")
async def get_stats(
    platform: str = "both",
    auth: AuthContext = Depends(require_auth),
):
    """Get dashboard stats for the authenticated user.
    platform: 'lab', 'crawl', or 'both'
    """
    settings = get_settings()
    user_id = auth.user_id
    stats = DashboardStats()

    if not user_id:
        return stats
    memory_client = MemoryClient(settings)

    show_lab = platform in ("lab", "both")
    show_crawl = platform in ("crawl", "both")

    # Count conversations from Postgres (AgentLab)
    if show_lab and postgres_enabled(settings):
        try:
            resolved = resolve_user_id(settings, user_id)
            if resolved:
                conversations = list_recent_conversations(settings, user_id=resolved, limit=50)
                stats.conversations = len(conversations)
        except Exception as e:
            stats.errors.append(f"conversations: {str(e)}")

    # Count memory entries from SQLite (AgentLab)
    if show_lab:
        try:
            stats.memory_entries = memory_client.count(user_id=user_id, scope="general")
        except Exception as e:
            stats.errors.append(f"memory: {str(e)}")

    # Count artifacts from the active metadata store.
    if show_lab:
        try:
            if postgres_enabled(settings):
                resolved = resolve_user_id(settings, user_id)
                if resolved:
                    with pg_connect(settings) as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "SELECT COUNT(*) AS count FROM artifacts WHERE user_id = %s AND status <> 'archived'",
                                (resolved,),
                            )
                            row = cur.fetchone()
                            stats.artifacts = row["count"] if row else 0
            else:
                stats.artifacts = len(list_local_artifacts(settings, user_id=user_id, limit=500))
        except Exception as e:
            stats.errors.append(f"artifacts: {str(e)}")

    # Crawl usage from Postgres usage_aggregates (AmanCrawl)
    if show_crawl and postgres_enabled(settings):
        try:
            usage = _get_crawl_usage(settings, user_id)
            if "crawl:scrape" in usage:
                stats.crawl_scrape = CrawlUsage(**usage["crawl:scrape"])
                stats.crawl_jobs = usage["crawl:scrape"]["used"]  # total scrapes = crawl jobs
            if "crawl:search" in usage:
                stats.crawl_search = CrawlUsage(**usage["crawl:search"])
            if "crawl:map" in usage:
                stats.crawl_map = CrawlUsage(**usage["crawl:map"])
            if "crawl:crawl" in usage:
                stats.crawl_crawl = CrawlUsage(**usage["crawl:crawl"])
                stats.pages_crawled = usage["crawl:crawl"]["used"]
        except Exception as e:
            stats.errors.append(f"crawl_usage: {str(e)}")

    return stats.model_dump()


@router.get("/conversations")
async def get_recent_conversations(
    limit: int = 10,
    auth: AuthContext = Depends(require_auth),
):
    """Get recent conversations for the authenticated user."""
    settings = get_settings()
    user_id = auth.user_id

    if not user_id or not postgres_enabled(settings):
        return {"items": []}

    try:
        resolved = resolve_user_id(settings, user_id)
        if not resolved:
            return {"items": []}

        items = list_recent_conversations(settings, user_id=resolved, limit=limit)
        return {"items": items}
    except Exception as e:
        return {"items": [], "error": str(e)}


@router.get("/memories")
async def get_recent_memories(
    limit: int = 10,
    workspace_id: UUID | None = None,
    project_id: UUID | None = None,
    query: str = "",
    status: str | None = None,
    auth: AuthContext = Depends(require_auth),
):
    """Get recent profile memories for the authenticated user."""
    settings = get_settings()
    user_id = auth.user_id

    if not user_id:
        return {"items": []}

    try:
        memory_client = MemoryClient(settings)
        memory_client.sync_account_profile(
            user_id=user_id,
            profile=auth.user or {},
        )
        profile_memories = memory_client.search(user_id=user_id, scope="general", query=query, limit=limit) if query.strip() else memory_client.list(user_id=user_id, scope="general", limit=limit)
        items = [
            {
                "id": f"profile:{item.get('key')}",
                "memory_type": "profile",
                "memory_key": item.get("key"),
                "content": item.get("content"),
                "source": item.get("source"),
                "status": "approved",
                "is_pinned": True,
                "managed_by": "profile",
                "updated_at": item.get("updated_at"),
            }
            for item in profile_memories
            if (status is None or status == "approved")
            and (
                not query.strip()
                or query.strip().lower() in str(item.get("key") or "").lower()
                or query.strip().lower() in str(item.get("content") or "").lower()
            )
        ]
        if workspace_id and postgres_enabled(settings):
            resolved = resolve_user_id(settings, user_id)
            if resolved:
                items.extend(memory_client.list_managed(
                    user_id=resolved,
                    workspace_id=str(workspace_id),
                    project_id=str(project_id) if project_id else None,
                    query=query,
                    status=status,
                    limit=limit,
                ))
        return {"items": items}
    except Exception as e:
        return {"items": [], "error": str(e)}


@router.get("/artifacts")
async def get_recent_artifacts(
    limit: int = 10,
    workspace_id: UUID | None = None,
    project_id: UUID | None = None,
    auth: AuthContext = Depends(require_auth),
):
    """Get recent uploaded artifacts for the authenticated user."""
    settings = get_settings()
    user_id = auth.user_id

    if not user_id:
        return {"items": []}

    try:
        if postgres_enabled(settings):
            resolved = resolve_user_id(settings, user_id)
            if not resolved:
                return {"items": []}
            items = list_recent_artifacts(
                settings,
                user_id=resolved,
                limit=max(1, min(limit, 500)),
                workspace_id=str(workspace_id) if workspace_id else None,
                project_id=str(project_id) if project_id else None,
            )
        else:
            items = list_local_artifacts(
                settings,
                user_id=user_id,
                limit=max(1, min(limit, 500)),
            )
        return {"items": items}
    except Exception as e:
        return {"items": [], "error": str(e)}


@router.post("/memories/import")
async def import_memories(
    payload: MemoryImportRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Import or update user-owned memory records from JSON."""
    settings = get_settings()
    if not auth.user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    for item in payload.items[:500]:
        MemoryClient(settings).remember(
            user_id=auth.user_id,
            scope="general",
            key=item.key.strip()[:120],
            content=item.content.strip()[:4000],
            source=item.source.strip()[:120] or "import",
        )
    return {"imported": min(len(payload.items), 500)}


@router.delete("/memories/{memory_key}")
async def delete_memory(
    memory_key: str,
    auth: AuthContext = Depends(require_auth),
):
    if not auth.user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return {"deleted": MemoryClient(get_settings()).forget(user_id=auth.user_id, scope="general", key=memory_key)}


@router.patch("/memories/{memory_id}")
async def patch_memory(
    memory_id: UUID,
    payload: MemoryActionRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=503, detail="Durable memory storage is unavailable.")
    resolved = resolve_user_id(settings, str(auth.user_id))
    if not resolved:
        raise HTTPException(status_code=404, detail="User could not be resolved.")
    try:
        item = MemoryClient(settings).update_managed(
            memory_id=str(memory_id),
            user_id=resolved,
            action=payload.action,
            content=payload.content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Memory was not found.")
    return {"item": item}


@router.get("/connections")
async def get_connections(auth: AuthContext = Depends(require_auth)):
    """Return safe connection metadata; credentials are never exposed."""
    settings = get_settings()
    postgres = check_postgres_connection(settings)
    return {
        "memory": {"connected": True, "driver": "SQLite", "path": settings.memory_db_path},
        "metadata": postgres,
        "vectors": {
            "connected": bool(settings.milvus_address and settings.milvus_token),
            "driver": "Milvus / Zilliz",
            "collection": settings.milvus_collection,
        },
    }
