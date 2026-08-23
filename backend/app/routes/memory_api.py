"""Universal Kontext Memory provider API."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_scope
from app.config import get_settings
from services.memory_core import MemoryClient
from services.rate_limiter import get_rate_limiter

router = APIRouter(prefix="/v1", tags=["memory-infrastructure"])
class MemoryWrite(BaseModel):
    key: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=4000)
    source: str = Field(default="agent", max_length=120)
    scope: str = Field(default="general", max_length=120)
    workspace_id: str | None = Field(default=None, max_length=120)
    agent_id: str | None = Field(default=None, max_length=120)
    valid_from: str | None = Field(default=None, max_length=80)
    valid_until: str | None = Field(default=None, max_length=80)
    confidence: float = Field(default=0.75, ge=0.0, le=1.0)


class MemoryRecall(BaseModel):
    query: str = Field(default="", max_length=1000)
    scope: str = Field(default="general", max_length=120)
    limit: int = Field(default=10, ge=1, le=500)
    workspace_id: str | None = Field(default=None, max_length=120)
    agent_id: str | None = Field(default=None, max_length=120)
    as_of: str | None = Field(default=None, max_length=80)
    include_history: bool = False


class MemoryMutation(BaseModel):
    id: str = Field(min_length=1, max_length=300)
    content: str | None = Field(default=None, max_length=4000)
    source: str = Field(default="agent", max_length=120)
    workspace_id: str | None = Field(default=None, max_length=120)
    agent_id: str | None = Field(default=None, max_length=120)
    valid_from: str | None = Field(default=None, max_length=80)
    valid_until: str | None = Field(default=None, max_length=80)
    confidence: float = Field(default=0.75, ge=0.0, le=1.0)


def _user(auth: AuthContext) -> str:
    if not auth.user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    settings = get_settings()
    decision = get_rate_limiter(
        settings,
        limit=getattr(settings, "memory_rate_limit", 120),
        window_seconds=getattr(settings, "memory_rate_window_seconds", 60.0),
    ).check(f"memory-api:{auth.user_id}")
    if not decision["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limited",
                "message": "Memory API rate limit exceeded",
                "retry_after": decision["retry_after"],
                "backend": decision["backend"],
            },
            headers={"Retry-After": str(decision["retry_after"])},
        )
    return auth.user_id


def _authorize_bindings(auth: AuthContext, *, workspace_id: str | None, agent_id: str | None) -> None:
    for key, requested in (("workspace_id", workspace_id), ("agent_id", agent_id)):
        bound = auth.token_bindings.get(key)
        if bound and requested != bound:
            raise HTTPException(status_code=403, detail=f"memory_{key}_forbidden")


def _effective_scope(auth: AuthContext, requested: str) -> str:
    bound_workspace = auth.token_bindings.get("workspace_id")
    if not bound_workspace:
        return requested
    prefix = f"workspace:{bound_workspace}"
    if requested == "general":
        return prefix
    if requested != prefix:
        raise HTTPException(status_code=403, detail="memory_workspace_forbidden")
    return requested


def _parse_id(memory_id: str) -> tuple[str, str]:
    parts = memory_id.split(":", 3)
    if len(parts) == 4 and parts[0] == "profile" and parts[1] == "workspace":
        return f"workspace:{parts[2]}", parts[3]
    if len(parts) != 3 or parts[0] != "profile":
        raise HTTPException(status_code=400, detail="Invalid memory id")
    return parts[1], parts[2]


def _client() -> MemoryClient:
    return MemoryClient(get_settings())


@router.get("/memory/health")
async def memory_health() -> dict[str, str]:
    return {"service": "truememory-memory", "status": "ok"}


@router.get("/memory/metrics")
async def memory_metrics(auth: AuthContext = Depends(require_scope("memory"))):
    _user(auth)
    return {"cache": _client().cache_metrics()}


@router.get("/memories")
async def list_memories(scope: str = "general", limit: int = 50, workspace_id: str | None = None, agent_id: str | None = None, auth: AuthContext = Depends(require_scope("memory"))):
    _authorize_bindings(auth, workspace_id=workspace_id, agent_id=agent_id)
    return {"items": _client().list(user_id=_user(auth), scope=_effective_scope(auth, scope), limit=limit, workspace_id=workspace_id, agent_id=agent_id)}


@router.post("/memories")
async def write_memory(payload: MemoryWrite, auth: AuthContext = Depends(require_scope("memory"))):
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    _authorize_bindings(auth, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    key = payload.key.strip()
    _client().remember(user_id=_user(auth), scope=scope, key=key, content=payload.content, source=payload.source, valid_from=payload.valid_from, valid_until=payload.valid_until, confidence=payload.confidence, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    storage_scope = _client()._storage_scope(scope, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    return {"saved": True, "id": f"profile:{storage_scope}:{key}", "key": key, "scope": scope}


async def _recall(payload: MemoryRecall, auth: AuthContext) -> dict:
    _authorize_bindings(auth, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    items = _client().search(user_id=_user(auth), scope=scope, query=payload.query, limit=payload.limit, workspace_id=payload.workspace_id, agent_id=payload.agent_id, as_of=payload.as_of, include_history=payload.include_history, token_bindings={str(key): str(value) for key, value in auth.token_bindings.items() if value})
    tier = str(items[0].get("retrieval_tier") or "L1_structured") if items else "L1_structured"
    return {"items": items, "count": len(items), "tier": tier}


@router.post("/memories/search")
async def search_memories(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    return await _recall(payload, auth)


@router.post("/memories/retrieve")
async def retrieve_memories(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    return await _recall(payload, auth)


@router.post("/memories/update")
async def update_memory(payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    if payload.content is None:
        raise HTTPException(status_code=422, detail="content is required")
    scope, key = _parse_id(payload.id)
    scope = _effective_scope(auth, scope)
    _authorize_bindings(auth, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    updated = _client().update(user_id=_user(auth), scope=scope, key=key, content=payload.content, source=payload.source, valid_from=payload.valid_from, valid_until=payload.valid_until, confidence=payload.confidence, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    return {"updated": updated, "id": payload.id}


@router.post("/memories/forget")
async def forget_memory(payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(payload.id)
    scope = _effective_scope(auth, scope)
    _authorize_bindings(auth, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    forgotten = _client().forget(user_id=_user(auth), scope=scope, key=key, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    return {"forgotten": forgotten, "id": payload.id}


@router.get("/memories/{memory_id}")
async def get_memory(memory_id: str, workspace_id: str | None = None, agent_id: str | None = None, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(memory_id)
    _authorize_bindings(auth, workspace_id=workspace_id, agent_id=agent_id)
    scope = _effective_scope(auth, scope)
    items = _client().search(user_id=_user(auth), scope=scope, query=key, limit=100, workspace_id=workspace_id, agent_id=agent_id)
    item = next((item for item in items if item.get("key") == key), None)
    if not item:
        raise HTTPException(status_code=404, detail="Memory not found")
    return item


@router.patch("/memories/{memory_id}")
async def patch_memory(memory_id: str, payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(memory_id)
    scope = _effective_scope(auth, scope)
    _authorize_bindings(auth, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    if payload.content is None:
        raise HTTPException(status_code=422, detail="content is required")
    updated = _client().update(user_id=_user(auth), scope=scope, key=key, content=payload.content, source=payload.source, valid_from=payload.valid_from, valid_until=payload.valid_until, confidence=payload.confidence, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"updated": True, "id": memory_id}


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str, workspace_id: str | None = None, agent_id: str | None = None, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(memory_id)
    _authorize_bindings(auth, workspace_id=workspace_id, agent_id=agent_id)
    scope = _effective_scope(auth, scope)
    return {"forgotten": _client().forget(user_id=_user(auth), scope=scope, key=key, workspace_id=workspace_id, agent_id=agent_id), "id": memory_id}
