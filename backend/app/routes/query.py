from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from app.routes.chat import ContextMentionRef, ImageAttachmentRef, _chat_event_stream
from services.ag_ui_events import sse
from services.model_registry import is_local_model
from query.models import QueryMode


router = APIRouter(prefix="/api/v1/query", tags=["query"])
logger = logging.getLogger(__name__)


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
    if not getattr(settings, "openrouter_api_key", "") and not is_local_model(body.selected_model):
        raise HTTPException(
            status_code=400,
            detail="OPENROUTER_API_KEY missing in .env — add your key from openrouter.ai",
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
        try:
            async for event in stream:
                yield event
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

    return StreamingResponse(
        guarded_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
