from __future__ import annotations

import asyncio
import json
import logging
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from app.routes.chat import (
    ContextMentionRef,
    ImageAttachmentRef,
    _chat_event_stream,
    _selected_provider_model,
)
from services.ag_ui_events import sse
from services.model_registry import is_local_model
from query.models import QueryMode


router = APIRouter(prefix="/api/v1/query", tags=["query"])
logger = logging.getLogger(__name__)


def _sse_event_type(frame: str) -> str | None:
    """Read the event type without making the stream wrapper own SSE parsing."""
    if not frame.startswith("data: "):
        return None
    try:
        payload = json.loads(frame[6:].strip())
    except (TypeError, ValueError):
        return None
    return str(payload.get("type") or "") or None


class QueryOptions(BaseModel):
    web_allowed: bool = True
    citations_required: bool = False
    max_results: int = Field(default=5, ge=1, le=10)
    approved_tool_calls: list[str] = Field(default_factory=list, max_length=20)


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = Field(default=None, max_length=120)
    doc_id: str | None = Field(default=None, max_length=160)
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    conversation_type: Literal[
        "artifact_chat", "coding_chat", "agents_chat", "workflow_chat"
    ] = "artifact_chat"
    workspace_name: str | None = Field(default=None, max_length=120)
    chat_mode: Literal["thinking", "deep-research", "web-search"] | None = None
    mode: QueryMode = QueryMode.AUTO
    timezone: str = Field(default="Asia/Kolkata", min_length=1, max_length=80)
    reply_context: str | None = Field(default=None, max_length=4000)
    prompt_context: str | None = Field(default=None, max_length=16_000)
    attachment_context: str | None = Field(default=None, max_length=60_000)
    image_attachments: list[ImageAttachmentRef] = Field(default_factory=list, max_length=4)
    selected_model: str | None = Field(default=None, max_length=80)
    fast_mode: bool = False
    enabled_skills: list[str] | None = Field(default=None, max_length=32)
    context_mentions: list[ContextMentionRef] = Field(default_factory=list, max_length=12)
    options: QueryOptions = Field(default_factory=QueryOptions)


@router.post("/stream")
async def query_stream(
    body: QueryRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings = get_settings()
    logger.info(
        "Query stream request received",
        extra={
            "user_id": str(auth.user_id),
            "conversation_id": body.conversation_id,
            "mode": body.mode.value if hasattr(body.mode, "value") else str(body.mode),
            "chat_mode": body.chat_mode,
            "fast_mode": body.fast_mode,
            "selected_model": body.selected_model,
            "workspace_id": str(body.workspace_id) if body.workspace_id else None,
            "project_id": str(body.project_id) if body.project_id else None,
        },
    )
    requested_provider, _ = _selected_provider_model(body.selected_model, settings)
    provider_configured = (
        (requested_provider == "openai" and bool(getattr(settings, "openai_api_key", "")))
        or (requested_provider == "openrouter" and bool(getattr(settings, "openrouter_api_key", "")))
        or requested_provider in {"ollama", "local"}
    )
    if not provider_configured and not is_local_model(body.selected_model):
        key_name = "OPENAI_API_KEY" if requested_provider == "openai" else "OPENROUTER_API_KEY"
        raise HTTPException(
            status_code=400,
            detail=f"{key_name} missing on the backend; configure the selected provider and retry.",
        )

    mode = body.mode
    question = body.question.strip()
    if not body.options.web_allowed and mode in {
        QueryMode.AUTO,
        QueryMode.SEARCH,
        QueryMode.SCRAPE,
        QueryMode.MAP,
        QueryMode.CRAWL,
        QueryMode.AGENT,
    }:
        question = f"Do not browse the web. {question}"
        mode = QueryMode.AUTO

    try:
        stream = _chat_event_stream(
            doc_id=body.doc_id.strip() if body.doc_id else None,
            workspace_id=str(body.workspace_id) if body.workspace_id else None,
            project_id=str(body.project_id) if body.project_id else None,
            conversation_type=body.conversation_type,
            workspace_name=body.workspace_name,
            chat_mode=body.chat_mode,
            fast_mode=body.fast_mode,
            reply_context=body.reply_context.strip() if body.reply_context else None,
            prompt_context=body.prompt_context.strip() if body.prompt_context else None,
            attachment_context=body.attachment_context.strip() if body.attachment_context else None,
            image_attachments=[item.model_dump(mode="json") for item in body.image_attachments],
            selected_model=body.selected_model,
            question=question,
            conversation_id=body.conversation_id or str(uuid4()),
            user_id=str(auth.user_id),
            account_profile=auth.user,
            settings=settings,
            query_mode=mode,
            timezone_name=body.timezone,
            approved_tool_calls=set(body.options.approved_tool_calls),
            enabled_skills=body.enabled_skills,
            context_mentions=[item.model_dump(mode="json") for item in body.context_mentions],
            tool_scopes=set(auth.scopes),
        )
    except Exception as exc:
        logger.exception(
            "Failed to construct query stream",
            extra={
                "user_id": str(auth.user_id),
                "conversation_id": body.conversation_id,
                "mode": body.mode.value if hasattr(body.mode, "value") else str(body.mode),
                "fast_mode": body.fast_mode,
                "selected_model": body.selected_model,
                "workspace_id": str(body.workspace_id) if body.workspace_id else None,
                "project_id": str(body.project_id) if body.project_id else None,
            },
        )
        raise HTTPException(
            status_code=500,
            detail=f"Query stream initialization failed: {exc}",
        ) from exc

    async def guarded_stream():
        iterator = stream.__aiter__()
        pending = asyncio.create_task(iterator.__anext__())
        saw_done = False
        try:
            while True:
                done, _ = await asyncio.wait({pending}, timeout=15.0)
                if not done:
                    # Render/proxy layers may close an otherwise healthy SSE
                    # connection when no bytes arrive during provider work.
                    # SSE comments are ignored by clients but keep the socket
                    # active until the next real event is ready.
                    yield ": keep-alive\n\n"
                    continue
                try:
                    event = pending.result()
                except StopAsyncIteration:
                    if not saw_done:
                        logger.error(
                            "Query stream ended before completion",
                            extra={
                                "user_id": str(auth.user_id),
                                "conversation_id": body.conversation_id,
                                "selected_model": body.selected_model,
                            },
                        )
                        yield sse(
                            "error",
                            {
                                "code": "stream_ended",
                                "message": "The answer stream ended before completion. Please retry the request.",
                                "retryable": True,
                            },
                        )
                    break
                saw_done = saw_done or _sse_event_type(event) == "done"
                yield event
                pending = asyncio.create_task(iterator.__anext__())
        except Exception as exc:
            logger.exception(
                "Query stream failed during execution",
                extra={
                    "user_id": str(auth.user_id),
                    "conversation_id": body.conversation_id,
                    "mode": body.mode.value if hasattr(body.mode, "value") else str(body.mode),
                    "fast_mode": body.fast_mode,
                    "selected_model": body.selected_model,
                    "workspace_id": str(body.workspace_id) if body.workspace_id else None,
                    "project_id": str(body.project_id) if body.project_id else None,
                },
            )
            yield sse("error", {"message": f"Query stream failed: {exc}"})
        finally:
            if not pending.done():
                pending.cancel()

    return StreamingResponse(
        guarded_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
