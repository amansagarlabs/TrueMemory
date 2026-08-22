from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth, require_scope
from app.config import get_settings
from app.routes.chat import reload_hybrid_retriever, warm_hybrid_retriever
from services.knowledge_base import list_records, status, upsert_records

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])


class KnowledgeRecord(BaseModel):
    id: str | None = Field(default=None, max_length=160)
    title: str = Field(default="Curated source", max_length=300)
    text: str = Field(min_length=1, max_length=100_000)
    source: str | None = Field(default=None, max_length=500)
    url: str | None = Field(default=None, max_length=2000)
    metadata: dict = Field(default_factory=dict)


class KnowledgeUpsertRequest(BaseModel):
    records: list[KnowledgeRecord] = Field(min_length=1, max_length=500)
    replace: bool = False


@router.get("/status")
async def knowledge_status(_: AuthContext = Depends(require_auth)):
    return status(get_settings())


@router.get("/records")
async def knowledge_records(_: AuthContext = Depends(require_auth)):
    return {"items": list_records(get_settings())}


@router.post("/records")
async def knowledge_upsert(
    body: KnowledgeUpsertRequest,
    auth: AuthContext = Depends(require_scope("rag")),
):
    settings = get_settings()
    try:
        records = [item.model_dump(exclude_none=True) for item in body.records]
        result = upsert_records(settings, records, updated_by=auth.user_id or "unknown", replace=body.replace)
        reload_hybrid_retriever(settings)
        return {"saved": True, **result}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/warmup")
async def knowledge_warmup(auth: AuthContext = Depends(require_scope("rag"))):
    result = warm_hybrid_retriever(get_settings())
    return {"warmed": True, "requested_by": auth.user_id, **result}
