"""Authenticated workspace project boundaries."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.postgres_store import archive_project, list_projects, postgres_enabled, resolve_user_id, upsert_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectUpsertRequest(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(default="", max_length=240)


def _storage(auth: AuthContext):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=503, detail="Project storage is unavailable.")
    user_id = resolve_user_id(settings, str(auth.user_id))
    if not user_id:
        raise HTTPException(status_code=404, detail="User could not be resolved.")
    return settings, user_id


@router.get("")
async def get_projects(workspace_id: UUID = Query(...), auth: AuthContext = Depends(require_auth)):
    settings, user_id = _storage(auth)
    return {"items": list_projects(settings, user_id=user_id, workspace_id=str(workspace_id))}


@router.put("/{project_id}")
async def put_project(project_id: UUID, body: ProjectUpsertRequest, auth: AuthContext = Depends(require_auth)):
    if project_id != body.id:
        raise HTTPException(status_code=400, detail="Project ID does not match.")
    settings, user_id = _storage(auth)
    try:
        item = upsert_project(
            settings, project_id=str(project_id), workspace_id=str(body.workspace_id),
            user_id=user_id, name=body.name, description=body.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": item}


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: UUID, auth: AuthContext = Depends(require_auth)):
    settings, user_id = _storage(auth)
    if not archive_project(settings, project_id=str(project_id), user_id=user_id):
        raise HTTPException(status_code=404, detail="Project was not found.")
    return Response(status_code=204)
