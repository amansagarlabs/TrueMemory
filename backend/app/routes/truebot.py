"""Authenticated TrueBot control plane. Execution is gated separately."""
from __future__ import annotations

from typing import Literal
from uuid import UUID
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.postgres_store import postgres_enabled, resolve_user_id
from services.truebot_catalog import catalog, limits
from services.truebot_store import StoreError, TrueBotStore

router = APIRouter(prefix="/api/truebot", tags=["truebot"])


async def truebot_auth(auth: AuthContext = Depends(require_auth)) -> AuthContext:
    # This hosted UI accepts validated user sessions only. API tokens may carry
    # narrower workspace/agent bindings and need a separate delegated contract.
    if auth.credential_type != "session":
        raise HTTPException(403, "TrueBot requires a user session.")
    return auth


class AgentBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    instructions: str = Field(min_length=1, max_length=12000)
    provider: Literal["openai"] = "openai"
    model: str = Field(min_length=1, max_length=100)
    workspace_id: UUID | None = None
    memory_enabled: bool = False
    tools: list[Literal["memory.search", "memory.save"]] = Field(default_factory=list, max_length=2)
    max_output_tokens: int = Field(default=1024, ge=256, le=4096)
    max_steps: int = Field(default=3, ge=1, le=6)
    timeout_seconds: int = Field(default=90, ge=15, le=120)
    status: Literal["active", "paused"] = "active"

    @field_validator("tools")
    @classmethod
    def distinct_tools(cls, tools):
        if len(set(tools)) != len(tools):
            raise ValueError("Duplicate tools are not allowed")
        return tools


class RunBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: UUID
    task: str = Field(min_length=1, max_length=20000)
    idempotency_key: UUID
    allow_external_provider: bool = False
    allow_memory_access: bool = False
    allow_memory_write: bool = False


def _store(auth):
    settings = get_settings()
    if not settings.truebot_enabled:
        raise HTTPException(503, "TrueBot is not enabled on this API.")
    if not postgres_enabled(settings):
        raise HTTPException(503, "TrueBot storage is unavailable.")
    user_id = resolve_user_id(settings, str(auth.user_id))
    if not user_id:
        raise HTTPException(403, "Account is unavailable.")
    store = TrueBotStore(settings)
    try:
        store.check_schema()
    except RuntimeError as exc:
        raise HTTPException(503, "TrueBot database migration is not installed.") from exc
    return settings, store, user_id


def _error(exc):
    raise HTTPException(exc.status, str(exc)) from exc


@router.get("/config")
async def get_config(auth: AuthContext = Depends(truebot_auth)):
    settings = get_settings()
    result = catalog(settings)
    result["worker_ready"] = False
    result["storage_ready"] = False
    if settings.truebot_enabled and postgres_enabled(settings):
        store = TrueBotStore(settings)
        try:
            store.check_schema()
            result["storage_ready"] = True
            result["worker_ready"] = store.worker_ready()
        except RuntimeError:
            pass
    return result


@router.get("/agents")
async def list_agents(auth: AuthContext = Depends(truebot_auth)):
    _, store, user_id = _store(auth)
    return {"items": store.agents(user_id)}


@router.post("/agents", status_code=201)
async def create_agent(body: AgentBody, auth: AuthContext = Depends(truebot_auth)):
    settings, store, user_id = _store(auth)
    _validate_agent(body, settings, auth)
    try:
        return {"item": store.save_agent(user_id, body.model_dump(mode="json"))}
    except StoreError as exc:
        _error(exc)


@router.put("/agents/{agent_id}")
async def edit_agent(agent_id: UUID, body: AgentBody, auth: AuthContext = Depends(truebot_auth)):
    settings, store, user_id = _store(auth)
    _validate_agent(body, settings, auth)
    try:
        return {"item": store.save_agent(user_id, body.model_dump(mode="json"), str(agent_id))}
    except StoreError as exc:
        _error(exc)


def _validate_agent(body, settings, auth):
    if not settings.openai_api_key or body.model not in settings.truebot_models:
        raise HTTPException(422, "This model is not configured for TrueBot.")
    if body.tools and not body.memory_enabled:
        raise HTTPException(422, "Enable memory before granting memory tools.")
    if body.memory_enabled and "memory" not in auth.scopes:
        raise HTTPException(403, "Memory scope is required.")


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: UUID, auth: AuthContext = Depends(truebot_auth)):
    _, store, user_id = _store(auth)
    try:
        store.delete_agent(user_id, str(agent_id))
        return {"deleted": True}
    except StoreError as exc:
        _error(exc)


@router.get("/usage")
async def get_usage(auth: AuthContext = Depends(truebot_auth)):
    settings, store, user_id = _store(auth)
    return {**store.usage(user_id), "limits": limits(settings)}


@router.get("/runs")
async def list_runs(agent_id: UUID | None = None, auth: AuthContext = Depends(truebot_auth)):
    _, store, user_id = _store(auth)
    return {"items": store.runs(user_id, str(agent_id) if agent_id else None)}


@router.post("/runs", status_code=202)
async def create_run(body: RunBody, auth: AuthContext = Depends(truebot_auth)):
    settings, store, user_id = _store(auth)
    if not settings.openai_api_key or not settings.truebot_models:
        raise HTTPException(503, "TrueBot's model provider is not configured.")
    if not store.worker_ready():
        raise HTTPException(503, "TrueBot worker is not ready. Please retry when execution is available.")
    if not body.allow_external_provider:
        raise HTTPException(422, "Approve sending this task to the configured provider before submitting.")
    if body.allow_memory_write and not body.allow_memory_access:
        raise HTTPException(422, "Memory write approval requires memory access approval.")
    try:
        return {"item": store.enqueue(user_id, str(body.agent_id), body.task, str(body.idempotency_key), "memory" in auth.scopes, allow_memory_access=body.allow_memory_access, allow_memory_write=body.allow_memory_write)}
    except StoreError as exc:
        _error(exc)


@router.get("/runs/{run_id}")
async def get_run(run_id: UUID, auth: AuthContext = Depends(truebot_auth)):
    _, store, user_id = _store(auth)
    try:
        return {"item": store.run(user_id, str(run_id))}
    except StoreError as exc:
        _error(exc)


@router.get("/runs/{run_id}/events")
async def run_events(run_id: UUID, auth: AuthContext = Depends(truebot_auth)):
    _, store, user_id = _store(auth)
    try:
        store.run(user_id, str(run_id))  # Authorization before opening a stream.
    except StoreError as exc:
        _error(exc)

    async def events():
        previous = None
        for _ in range(60):
            try:
                item = await asyncio.to_thread(store.run, user_id, str(run_id))
            except StoreError:
                break
            payload = json.dumps(jsonable_encoder(item))
            if payload != previous:
                yield f"event: run\ndata: {payload}\n\n"
                previous = payload
            else:
                yield ": heartbeat\n\n"
            if item["status"] not in {"queued", "running"}:
                break
            await asyncio.sleep(2)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: UUID, auth: AuthContext = Depends(truebot_auth)):
    _, store, user_id = _store(auth)
    try:
        return {"item": store.cancel(user_id, str(run_id))}
    except StoreError as exc:
        _error(exc)
