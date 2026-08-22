"""Authenticated workspace boundaries."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.postgres_store import (
    list_workspaces,
    postgres_enabled,
    resolve_user_id,
    upsert_workspace,
)

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class WorkspaceUpsertRequest(BaseModel):
    id: UUID
    name: str = Field(..., min_length=1, max_length=120)
    platform: str = Field(default="Kontext Memory", min_length=1, max_length=80)


@router.get("")
async def get_workspaces(auth: AuthContext = Depends(require_auth)):
    settings = get_settings()
    if not postgres_enabled(settings):
        return {"items": []}
    user_id = resolve_user_id(settings, str(auth.user_id))
    if not user_id:
        raise HTTPException(status_code=404, detail="User could not be resolved.")
    return {"items": list_workspaces(settings, user_id=user_id)}


@router.put("/{workspace_id}")
async def put_workspace(
    workspace_id: UUID,
    body: WorkspaceUpsertRequest,
    auth: AuthContext = Depends(require_auth),
):
    if workspace_id != body.id:
        raise HTTPException(status_code=400, detail="Workspace ID does not match.")
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=503, detail="Workspace storage is unavailable.")
    user_id = resolve_user_id(settings, str(auth.user_id))
    if not user_id:
        raise HTTPException(status_code=404, detail="User could not be resolved.")
    try:
        item = upsert_workspace(
            settings,
            workspace_id=str(workspace_id),
            user_id=user_id,
            name=body.name,
            platform=body.platform,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"item": item}
