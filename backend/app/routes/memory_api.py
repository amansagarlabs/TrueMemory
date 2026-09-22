"""Universal TrueMemory Memory provider API."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_scope
from app.config import get_settings
from services.memory_core import MemoryClient
from services.rate_limiter import get_rate_limiter
from services.portable_memory import make_document, validate_document
from services.memory_notes import extract_note_candidates, extract_note_relationships, render_memory_notes
from services.experience_capture import Experience, ExperienceSource
from services.memory_consolidation import consolidate_experiences
from services.memory_ingestion import get_ingestion_job

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


class PortableMemoryRequest(BaseModel):
    document: dict


class MemoryNotesRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    selected: list[int] | None = None


class ConsolidationExperience(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    source: str = Field(default="user_input", max_length=80)
    conversation_id: str | None = Field(default=None, max_length=200)
    run_id: str | None = Field(default=None, max_length=200)
    metadata: dict = Field(default_factory=dict)


class ConsolidationRequest(BaseModel):
    experiences: list[ConsolidationExperience] = Field(min_length=1, max_length=200)
    existing_memories: list[dict] = Field(default_factory=list, max_length=500)
    dry_run: bool = True


class ConsolidationCommitRequest(ConsolidationRequest):
    candidate_id: str = Field(min_length=3, max_length=80)
    approved: bool = False


class ConsolidationCommitRequest(ConsolidationRequest):
    candidate_id: str = Field(min_length=3, max_length=80)
    approved: bool = False


@router.post("/memory/consolidate/preview")
async def preview_consolidation(payload: ConsolidationRequest, auth: AuthContext = Depends(require_scope("memory"))):
    """Explicit developer preview; production remains disabled by configuration."""
    _user(auth)
    settings = get_settings()
    experiences = []
    for item in payload.experiences:
        try:
            source = ExperienceSource(item.source)
        except ValueError:
            source = ExperienceSource.AGENT_OBSERVATION
        experiences.append(Experience(source=source, content=item.content, conversation_id=item.conversation_id, run_id=item.run_id, metadata=item.metadata))
    current = _client().list(user_id=_user(auth), scope="general", limit=500)
    report = consolidate_experiences(experiences, existing_memories=current or payload.existing_memories, mode=getattr(settings, "memory_consolidation_mode", "disabled"), dry_run=True)
    return report.to_dict()


@router.post("/memory/consolidate/commit")
async def commit_consolidation(payload: ConsolidationCommitRequest, auth: AuthContext = Depends(require_scope("memory"))):
    """Recompute and explicitly commit one experimental candidate."""
    user_id = _user(auth)
    if not payload.approved:
        return {"status": "rejected", "reason": "approval_required", "candidate_id": payload.candidate_id}
    settings = get_settings()
    if getattr(settings, "memory_consolidation_mode", "disabled") != "experimental":
        return {"status": "rejected", "reason": "consolidation_disabled", "candidate_id": payload.candidate_id}
    experiences = []
    for item in payload.experiences:
        try:
            source = ExperienceSource(item.source)
        except ValueError:
            source = ExperienceSource.AGENT_OBSERVATION
        experiences.append(Experience(source=source, content=item.content, conversation_id=item.conversation_id, run_id=item.run_id, metadata=item.metadata))
    client = _client()
    current = client.list(user_id=user_id, scope="general", limit=500)
    report = consolidate_experiences(experiences, existing_memories=current, mode="experimental", dry_run=True)
    candidate = next((item for item in report.candidates if item.candidate_id == payload.candidate_id), None)
    if candidate is None:
        return {"status": "stale", "reason": "candidate_revalidation_failed", "candidate_id": payload.candidate_id}
    existing = next((item for item in current if item.get("key") == candidate.key and str(item.get("content", "")).casefold() == candidate.content.casefold()), None)
    if existing:
        return {"status": "unchanged", "candidate_id": candidate.candidate_id, "semantic_memory": existing, "revision": existing.get("revision", 1)}
    from services.conflict_resolver import resolve_conflict
    from services.memory_governor import govern_candidate, GovernorDecision
    same_key = next((item for item in current if item.get("key") == candidate.key), None)
    governor = govern_candidate(candidate, same_key)
    if governor.decision in {GovernorDecision.REJECT, GovernorDecision.NOOP}:
        return {"status": "rejected", "candidate_id": candidate.candidate_id, "reason": governor.reason, "governor_rule": governor.rule_id}
    conflict = resolve_conflict(candidate.content, candidate.memory_type, candidate.key, same_key) if same_key else None
    source = f"consolidation:{candidate.candidate_id};evidence={','.join(candidate.evidence_ids)}"
    client.remember(user_id=user_id, scope="general", key=candidate.key, content=candidate.content, source=source, confidence=governor.confidence)
    committed = next((item for item in client.list(user_id=user_id, scope="general", limit=500) if item.get("key") == candidate.key and str(item.get("content", "")).casefold() == candidate.content.casefold()), {"key": candidate.key, "content": candidate.content, "source": source})
    return {"status": "committed", "candidate_id": candidate.candidate_id, "semantic_memory": committed, "revision": committed.get("revision", 1), "current_state": candidate.value, "conflict_resolution": conflict.resolution.value if conflict else None, "evidence_ids": candidate.evidence_ids}


@router.post("/memory/consolidate/commit")
async def commit_consolidation(payload: ConsolidationCommitRequest, auth: AuthContext = Depends(require_scope("memory"))):
    """Recompute and explicitly commit one experimental candidate."""
    user_id = _user(auth)
    if not payload.approved:
        return {"status": "rejected", "reason": "approval_required", "candidate_id": payload.candidate_id}
    settings = get_settings()
    if getattr(settings, "memory_consolidation_mode", "disabled") != "experimental":
        return {"status": "rejected", "reason": "consolidation_disabled", "candidate_id": payload.candidate_id}
    experiences = []
    for item in payload.experiences:
        try:
            source = ExperienceSource(item.source)
        except ValueError:
            source = ExperienceSource.AGENT_OBSERVATION
        experiences.append(Experience(source=source, content=item.content, conversation_id=item.conversation_id, run_id=item.run_id, metadata=item.metadata))
    client = _client()
    current = client.list(user_id=user_id, scope="general", limit=500)
    report = consolidate_experiences(experiences, existing_memories=current, mode="experimental", dry_run=True)
    candidate = next((item for item in report.candidates if item.candidate_id == payload.candidate_id), None)
    if candidate is None:
        return {"status": "stale", "reason": "candidate_revalidation_failed", "candidate_id": payload.candidate_id}
    existing = next((item for item in current if item.get("key") == candidate.key and str(item.get("content", "")).casefold() == candidate.content.casefold()), None)
    if existing:
        return {"status": "unchanged", "candidate_id": candidate.candidate_id, "semantic_memory": existing, "revision": existing.get("revision", 1)}
    from services.conflict_resolver import resolve_conflict
    from services.memory_governor import govern_candidate, GovernorDecision
    same_key = next((item for item in current if item.get("key") == candidate.key), None)
    governor = govern_candidate(candidate, same_key)
    if governor.decision in {GovernorDecision.REJECT, GovernorDecision.NOOP}:
        return {"status": "rejected", "candidate_id": candidate.candidate_id, "reason": governor.reason, "governor_rule": governor.rule_id}
    conflict = resolve_conflict(candidate.content, candidate.memory_type, candidate.key, same_key) if same_key else None
    source = f"consolidation:{candidate.candidate_id};evidence={','.join(candidate.evidence_ids)}"
    client.remember(user_id=user_id, scope="general", key=candidate.key, content=candidate.content, source=source, confidence=governor.confidence)
    committed = next((item for item in client.list(user_id=user_id, scope="general", limit=500) if item.get("key") == candidate.key and str(item.get("content", "")).casefold() == candidate.content.casefold()), {"key": candidate.key, "content": candidate.content, "source": source})
    return {"status": "committed", "candidate_id": candidate.candidate_id, "semantic_memory": committed, "revision": committed.get("revision", 1), "current_state": candidate.value, "conflict_resolution": conflict.resolution.value if conflict else None, "evidence_ids": candidate.evidence_ids}


@router.post("/memory/import/notes")
async def import_memory_notes(payload: MemoryNotesRequest, auth: AuthContext = Depends(require_scope("memory"))):
    """Preview by default; persist only explicitly selected candidates."""
    candidates = extract_note_candidates(payload.text)
    if payload.selected is None:
        return {"candidates": candidates, "relationships": extract_note_relationships(payload.text), "source": {"source_type": "memory_note"}, "requires_confirmation": True}
    user_id = _user(auth)
    selected = [candidates[index] for index in payload.selected if 0 <= index < len(candidates)]
    client = _client()
    saved = []
    for candidate in selected:
        client.remember(user_id=user_id, scope="general", key=candidate["key"], content=candidate["content"], source="memory_note")
        saved.append(candidate)
    return {"saved": saved, "count": len(saved), "source": {"source_type": "memory_note"}}


@router.post("/memory/export/notes")
async def export_memory_notes(payload: MemoryRecall = MemoryRecall(), auth: AuthContext = Depends(require_scope("memory"))):
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    items = _client().list(user_id=_user(auth), scope=scope, limit=500, workspace_id=ws_id, agent_id=payload.agent_id)
    return {"format": "truememory-memory-notes", "notes": render_memory_notes(items), "lossy": True}


@router.post("/memory/export")
async def export_memory(payload: MemoryRecall = MemoryRecall(), auth: AuthContext = Depends(require_scope("memory"))):
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    items = _client().list(user_id=_user(auth), scope=scope, limit=500, workspace_id=ws_id, agent_id=payload.agent_id)
    return make_document(items)


@router.post("/memory/import")
async def import_memory(payload: PortableMemoryRequest, auth: AuthContext = Depends(require_scope("memory"))):
    try:
        memories = validate_document(payload.document)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    user_id = _user(auth)
    imported = 0
    client = _client()
    # Portable ownership is data, never authorization. All records are mapped
    # into the authenticated principal's explicitly authorized destination.
    for item in memories:
        scope = _effective_scope(auth, str(item["scope"] or "general"))
        ws_id = _scope_workspace_id(auth, None)
        client.remember(user_id=user_id, scope=scope, key=item["key"], content=item["content"], source="portable_import", valid_from=item.get("valid_from"), valid_until=item.get("valid_until"), confidence=float(item.get("confidence") or 0.75), workspace_id=ws_id)
        imported += 1
    return {"imported": imported, "format": "truememory-memory-v1"}


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
    """Validate requested scope against token bindings, return canonical scope."""
    bound_workspace = auth.token_bindings.get("workspace_id")
    if not bound_workspace:
        return requested
    # Token is bound to a workspace: validate scope matches, return 'general'
    # so _storage_scope can properly encode workspace via workspace_id param.
    prefix = f"workspace:{bound_workspace}"
    if requested in ("general", prefix):
        return "general"
    raise HTTPException(status_code=403, detail="memory_workspace_forbidden")


def _scope_workspace_id(auth: AuthContext, requested_workspace_id: str | None) -> str | None:
    """Return workspace_id to pass to MemoryClient based on token bindings."""
    bound_ws = auth.token_bindings.get("workspace_id")
    if bound_ws:
        if requested_workspace_id and requested_workspace_id != bound_ws:
            raise HTTPException(status_code=403, detail="memory_workspace_forbidden")
        return bound_ws  # use the bound workspace_id
    return requested_workspace_id


def _parse_id(memory_id: str) -> tuple[str, str]:
    # ID format: profile:{scope}:{key}
    # scope may contain pipes, e.g. "general|workspace:WS_A"
    # We extract the base scope (before any |) for use with _effective_scope.
    if not memory_id.startswith("profile:"):
        raise HTTPException(status_code=400, detail="Invalid memory id")
    remainder = memory_id[len("profile:"):]
    # key is the last colon-separated segment
    full_scope, _, key = remainder.rpartition(":")
    if not full_scope or not key:
        raise HTTPException(status_code=400, detail="Invalid memory id")
    # Extract base scope: first segment before any pipe
    base_scope = full_scope.split("|", 1)[0]
    return base_scope, key


def _client() -> MemoryClient:
    return MemoryClient(get_settings())


@router.get("/memory/health")
async def memory_health() -> dict[str, str]:
    return {"service": "truememory-memory", "status": "ok"}


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, auth: AuthContext = Depends(require_scope("memory"))):
    """Return scope-safe durable job state without payloads or worker secrets."""
    user_id = _user(auth)
    job = get_ingestion_job(get_settings(), job_id=job_id, user_id=user_id, include_items=False)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": str(job.get("id")),
        "job_type": job.get("job_kind") or "ingestion",
        "status": job.get("status"),
        "created_at": job.get("created_at"),
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "attempt": job.get("attempt_count", 0),
        "max_attempts": job.get("max_attempts"),
        "last_error": job.get("error"),
        "scope": {"user_id": str(job.get("user_id")), "workspace_id": job.get("workspace_id"), "agent_id": job.get("agent_id")},
    }


@router.get("/memory/metrics")
async def memory_metrics(auth: AuthContext = Depends(require_scope("memory"))):
    _user(auth)
    return {"cache": _client().cache_metrics()}


@router.get("/memory/performance")
async def memory_performance(auth: AuthContext = Depends(require_scope("memory"))):
    """Authenticated aggregate performance snapshot without memory content."""
    _user(auth)
    from app.metrics import get_metrics
    from services import postgres_pool
    settings = get_settings()
    client = _client()
    return {
        "request_metrics": get_metrics().get_all(),
        "cache": client.cache_metrics(),
        "hybrid": client.hybrid.metrics(),
        # Do not initialize a connection pool from a request handler. Startup
        # owns pool creation; the performance endpoint reports its current
        # metrics or a safe not-initialized state.
        "postgres_pool": (
            postgres_pool._pool.metrics.to_dict()
            if postgres_pool._pool is not None
            else {"status": "not_initialized"}
        ),
        "scope": {"user_id": str(auth.user_id), "workspace_id": auth.token_bindings.get("workspace_id")},
    }


@router.get("/memories")
async def list_memories(scope: str = "general", limit: int = 50, workspace_id: str | None = None, agent_id: str | None = None, auth: AuthContext = Depends(require_scope("memory"))):
    ws_id = _scope_workspace_id(auth, workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=agent_id)
    return {"items": _client().list(user_id=_user(auth), scope=_effective_scope(auth, scope), limit=limit, workspace_id=ws_id, agent_id=agent_id)}


@router.post("/memories")
async def write_memory(payload: MemoryWrite, auth: AuthContext = Depends(require_scope("memory"))):
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    key = payload.key.strip()
    _client().remember(user_id=_user(auth), scope=scope, key=key, content=payload.content, source=payload.source, valid_from=payload.valid_from, valid_until=payload.valid_until, confidence=payload.confidence, workspace_id=ws_id, agent_id=payload.agent_id)
    storage_scope = _client()._storage_scope(scope, workspace_id=payload.workspace_id, agent_id=payload.agent_id)
    return {"saved": True, "id": f"profile:{storage_scope}:{key}", "key": key, "scope": scope}


async def _recall(payload: MemoryRecall, auth: AuthContext) -> dict:
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    items = _client().search(user_id=_user(auth), scope=scope, query=payload.query, limit=payload.limit, workspace_id=ws_id, agent_id=payload.agent_id, as_of=payload.as_of, include_history=payload.include_history, token_bindings={str(key): str(value) for key, value in auth.token_bindings.items() if value})
    tier = str(items[0].get("retrieval_tier") or "L1_structured") if items else "L1_structured"
    return {"items": items, "count": len(items), "tier": tier}


@router.post("/memories/search")
async def search_memories(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    return await _recall(payload, auth)


@router.post("/memories/retrieve")
async def retrieve_memories(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    return await _recall(payload, auth)

# Canonical provider-neutral operation aliases.  The legacy /memories routes
# remain supported for existing clients; both paths use the same core.
@router.post("/memory/search")
async def canonical_search(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    return await _recall(payload, auth)

@router.post("/memory/retrieve")
async def canonical_retrieve(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    return await _recall(payload, auth)


@router.post("/memories/update")
async def update_memory(payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    if payload.content is None:
        raise HTTPException(status_code=422, detail="content is required")
    scope, key = _parse_id(payload.id)
    scope = _effective_scope(auth, scope)
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    updated = _client().update(user_id=_user(auth), scope=scope, key=key, content=payload.content, source=payload.source, valid_from=payload.valid_from, valid_until=payload.valid_until, confidence=payload.confidence, workspace_id=ws_id, agent_id=payload.agent_id)
    return {"updated": updated, "id": payload.id}


@router.post("/memories/forget")
async def forget_memory(payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(payload.id)
    scope = _effective_scope(auth, scope)
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    forgotten = _client().forget(user_id=_user(auth), scope=scope, key=key, workspace_id=ws_id, agent_id=payload.agent_id)
    return {"forgotten": forgotten, "id": payload.id}

@router.post("/memory/store")
async def canonical_store(payload: MemoryWrite, auth: AuthContext = Depends(require_scope("memory"))):
    return await write_memory(payload, auth)

@router.post("/memory/forget")
async def canonical_forget(payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    return await forget_memory(payload, auth)


@router.get("/memories/{memory_id}")
async def get_memory(memory_id: str, workspace_id: str | None = None, agent_id: str | None = None, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(memory_id)
    scope = _effective_scope(auth, scope)
    ws_id = _scope_workspace_id(auth, workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=agent_id)
    items = _client().search(user_id=_user(auth), scope=scope, query=key, limit=100, workspace_id=ws_id, agent_id=agent_id)
    item = next((item for item in items if item.get("key") == key), None)
    if not item:
        raise HTTPException(status_code=404, detail="Memory not found")
    return item


@router.patch("/memories/{memory_id}")
async def patch_memory(memory_id: str, payload: MemoryMutation, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(memory_id)
    scope = _effective_scope(auth, scope)
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    if payload.content is None:
        raise HTTPException(status_code=422, detail="content is required")
    updated = _client().update(user_id=_user(auth), scope=scope, key=key, content=payload.content, source=payload.source, valid_from=payload.valid_from, valid_until=payload.valid_until, confidence=payload.confidence, workspace_id=ws_id, agent_id=payload.agent_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"updated": True, "id": memory_id}


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str, workspace_id: str | None = None, agent_id: str | None = None, auth: AuthContext = Depends(require_scope("memory"))):
    scope, key = _parse_id(memory_id)
    scope = _effective_scope(auth, scope)
    ws_id = _scope_workspace_id(auth, workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=agent_id)
    return {"forgotten": _client().forget(user_id=_user(auth), scope=scope, key=key, workspace_id=ws_id, agent_id=agent_id), "id": memory_id}


class StateQuery(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    project_id: str | None = Field(default=None, max_length=120)
    as_of: str | None = Field(default=None, max_length=80)
    memory_key: str | None = Field(default=None, max_length=200)
    start: str | None = Field(default=None, max_length=80)
    end: str | None = Field(default=None, max_length=80)
    order: str = Field(default="desc", pattern="^(asc|desc)$")
    limit: int = Field(default=50, ge=1, le=200)
    cursor: str | None = None
    include_history: bool = True


@router.post("/memories/current-state")
async def current_state(payload: StateQuery, auth: AuthContext = Depends(require_scope("memory"))):
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=None)
    items = _client().current_state(
        user_id=_user(auth),
        workspace_id=ws_id,
        project_id=payload.project_id,
    )
    return {"items": items, "count": len(items), "as_of": "now"}

@router.post("/memory/current-state")
async def canonical_current_state(payload: StateQuery, auth: AuthContext = Depends(require_scope("memory"))):
    return await current_state(payload, auth)


@router.post("/memories/historical-state")
async def historical_state(payload: StateQuery, auth: AuthContext = Depends(require_scope("memory"))):
    if not payload.as_of:
        raise HTTPException(status_code=422, detail="as_of is required for historical state")
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=None)
    items = _client().historical_state(
        user_id=_user(auth),
        workspace_id=ws_id,
        as_of=payload.as_of,
        project_id=payload.project_id,
    )
    return {"items": items, "count": len(items), "as_of": payload.as_of}

@router.post("/memory/timeline")
async def canonical_timeline(payload: StateQuery, auth: AuthContext = Depends(require_scope("memory"))):
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=None)
    items = _client().timeline(user_id=_user(auth), workspace_id=ws_id,
        project_id=payload.project_id, memory_key=payload.memory_key, start=payload.start,
        end=payload.end, as_of=payload.as_of, order=payload.order, limit=payload.limit)
    return {"items": items, "count": len(items), "next_cursor": None}

@router.post("/memory/related")
async def canonical_related(payload: MemoryRecall, auth: AuthContext = Depends(require_scope("memory"))):
    if not payload.workspace_id:
        return await _recall(payload, auth)
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=payload.agent_id)
    scope = _effective_scope(auth, payload.scope.strip() or "general")
    items = _client().related(user_id=_user(auth), workspace_id=ws_id, memory_id=payload.query, project_id=None, limit=payload.limit)
    return {"items": items, "count": len(items), "scope": scope, "relationship": "same_key_or_memory_type"}


class VersionQuery(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=120)
    memory_key: str = Field(min_length=1, max_length=200)
    project_id: str | None = Field(default=None, max_length=120)


@router.post("/memories/versions")
async def memory_versions(payload: VersionQuery, auth: AuthContext = Depends(require_scope("memory"))):
    ws_id = _scope_workspace_id(auth, payload.workspace_id)
    _authorize_bindings(auth, workspace_id=ws_id, agent_id=None)
    items = _client().memory_versions(
        user_id=_user(auth),
        workspace_id=ws_id,
        memory_key=payload.memory_key,
        project_id=payload.project_id,
    )
    return {"items": items, "count": len(items)}
