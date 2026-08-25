"""Asynchronous universal memory-ingestion API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_scope
from app.config import get_settings
from services.agent_guardrails import inspect_user_input
from services.memory_ingestion import (
    approve_ingestion_item,
    cancel_ingestion_job,
    create_ingestion_job,
    get_ingestion_job,
    retry_ingestion_job,
    update_item_decision,
)
from services.postgres_store import postgres_enabled, resolve_user_id
from services.url_safety import UnsafeUrlError, validate_public_url


router = APIRouter(prefix="/v1/ingestion", tags=["memory-ingestion"])


class IngestionRequest(BaseModel):
    provider: str = Field(default="manual", min_length=1, max_length=80)
    source_type: str = Field(default="text", min_length=1, max_length=80)
    source_url: str | None = Field(default=None, max_length=4_000)
    external_id: str | None = Field(default=None, max_length=300)
    content: str | None = Field(default=None, max_length=200_000)
    key: str | None = Field(default=None, max_length=120)
    scope: str = Field(default="general", min_length=1, max_length=120)
    tenant_id: str | None = Field(default=None, max_length=160)
    workspace_id: str | None = Field(default=None, max_length=160)
    agent_id: str | None = Field(default=None, max_length=160)
    metadata: dict[str, Any] = Field(default_factory=dict)
    target: str = Field(default="candidate", pattern="^(candidate|reference|durable)$")
    discover: bool = False
    max_pages: int = Field(default=5, ge=1, le=20)
    idempotency_key: str | None = Field(default=None, max_length=200)
    priority: int = Field(default=50, ge=0, le=100)
    source_version: str = Field(default="1", max_length=80)


def _owner(auth: AuthContext) -> str:
    if not auth.user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=503, detail="Durable ingestion requires PostgreSQL.")
    resolved = resolve_user_id(settings, str(auth.user_id))
    if not resolved:
        raise HTTPException(status_code=403, detail="User account could not be resolved.")
    return resolved


def _authorize_bindings(auth: AuthContext, payload: IngestionRequest) -> None:
    for key, requested in (
        ("tenant_id", payload.tenant_id),
        ("workspace_id", payload.workspace_id),
        ("agent_id", payload.agent_id),
    ):
        bound = auth.token_bindings.get(key)
        # Omitted bindings inherit the authenticated token's scope. Only an
        # explicitly conflicting request is forbidden.
        if bound and requested and requested != bound:
            raise HTTPException(status_code=403, detail=f"memory_{key}_forbidden")


def _job_response(job: dict[str, Any] | None) -> dict[str, Any]:
    if not job:
        raise HTTPException(status_code=404, detail="Ingestion job not found.")
    safe_job = dict(job)
    request_payload = dict(safe_job.get("request_payload") or {})
    if "content" in request_payload:
        request_payload["content"] = None
        request_payload["content_length"] = len(str((job.get("request_payload") or {}).get("content") or ""))
    safe_job["request_payload"] = request_payload
    if isinstance(safe_job.get("items"), list):
        safe_items = []
        for raw_item in safe_job["items"]:
            item = dict(raw_item or {})
            item.pop("raw_content", None)
            safe_items.append(item)
        safe_job["items"] = safe_items
    return {
        "job_id": str(safe_job.get("id")),
        "status": safe_job.get("status"),
        "current_stage": safe_job.get("current_stage"),
        "provider": safe_job.get("provider"),
        "source_type": safe_job.get("source_type"),
        "source_url": safe_job.get("source_url"),
        "attempt": safe_job.get("attempt_count", 0),
        "error": safe_job.get("error"),
        "candidate_count": safe_job.get("candidate_count", 0),
        "memory_count": safe_job.get("memory_count", 0),
        "discovered_items": safe_job.get("discovered_items", 0),
        "job": safe_job,
    }


@router.post("")
async def create_ingestion(payload: IngestionRequest, auth: AuthContext = Depends(require_scope("memory"))):
    user_id = _owner(auth)
    _authorize_bindings(auth, payload)
    if payload.source_type in {"text", "note", "memory", "browser", "browser_snapshot", "web_capture"}:
        checked = inspect_user_input(payload.content or "", max_chars=200_000)
        if checked.action.value == "block":
            raise HTTPException(status_code=422, detail=checked.reason)
    if payload.source_type in {"url", "website", "search_result"} and not payload.source_url:
        raise HTTPException(status_code=422, detail="source_url is required for URL ingestion.")
    if payload.source_url:
        try:
            await validate_public_url(payload.source_url)
        except UnsafeUrlError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    settings = get_settings()
    requested_scope = payload.scope.strip() or "general"
    bound_workspace = auth.token_bindings.get("workspace_id")
    if bound_workspace and requested_scope == "general":
        requested_scope = f"workspace:{bound_workspace}"
    try:
        job, created = create_ingestion_job(
            settings,
            user_id=user_id,
            provider=payload.provider,
            source_type=payload.source_type,
            source_url=payload.source_url,
            external_id=payload.external_id,
            scope=requested_scope,
            tenant_id=payload.tenant_id or auth.token_bindings.get("tenant_id"),
            workspace_id=payload.workspace_id or auth.token_bindings.get("workspace_id"),
            agent_id=payload.agent_id or auth.token_bindings.get("agent_id"),
            key=payload.key,
            content=payload.content,
            metadata=payload.metadata,
            target=payload.target,
            discover=payload.discover,
            max_pages=payload.max_pages,
            idempotency_key=payload.idempotency_key,
            priority=payload.priority,
            source_version=payload.source_version,
        )
    except RuntimeError as exc:
        if str(exc) == "ingestion_queue_limit_reached":
            raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": "30"}) from exc
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {**_job_response(job), "created": created}


@router.get("/{job_id}")
async def get_ingestion(job_id: str, auth: AuthContext = Depends(require_scope("memory"))):
    user_id = _owner(auth)
    job = get_ingestion_job(get_settings(), job_id=job_id, user_id=user_id, include_items=True)
    return _job_response(job)


@router.post("/{job_id}/retry")
async def retry_ingestion(job_id: str, auth: AuthContext = Depends(require_scope("memory"))):
    user_id = _owner(auth)
    job = retry_ingestion_job(get_settings(), job_id=job_id, user_id=user_id)
    return _job_response(job)


@router.post("/{job_id}/cancel")
async def cancel_ingestion(job_id: str, auth: AuthContext = Depends(require_scope("memory"))):
    user_id = _owner(auth)
    job = cancel_ingestion_job(get_settings(), job_id=job_id, user_id=user_id)
    return _job_response(job)


@router.post("/items/{item_id}/approve")
async def approve_ingestion(item_id: str, auth: AuthContext = Depends(require_scope("memory"))):
    user_id = _owner(auth)
    try:
        item = approve_ingestion_item(get_settings(), item_id=item_id, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Memory candidate not found.")
    return {"approved": True, "item": item}


@router.post("/items/{item_id}/reject")
async def reject_ingestion(item_id: str, auth: AuthContext = Depends(require_scope("memory"))):
    user_id = _owner(auth)
    item = update_item_decision(get_settings(), item_id=item_id, user_id=user_id, decision="rejected")
    if not item:
        raise HTTPException(status_code=404, detail="Ingestion item not found.")
    return {"rejected": True, "item": item}
