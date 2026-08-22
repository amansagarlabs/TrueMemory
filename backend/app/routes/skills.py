"""Application-wide Agent Skills API."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from services.agent_skills import create_skill, discover_skills
from services.skill_discovery import discover

router = APIRouter(prefix="/api/skills", tags=["skills"])
logger = logging.getLogger(__name__)


class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=64)
    description: str = Field(..., min_length=12, max_length=400)
    instructions: str = Field(..., min_length=20, max_length=12_000)


@router.get("")
async def list_skills(auth: AuthContext = Depends(require_auth)):
    del auth
    skills = [skill.public_dict() for skill in discover_skills()]
    return {"items": skills, "count": len(skills)}


@router.get("/discover")
async def discover_skills_endpoint(
    q: str = "",
    limit: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    del auth
    query = q.strip()
    try:
        items = discover(query, max(1, min(limit, 50)))
    except Exception as exc:  # noqa: BLE001 - discovery must degrade to local skills
        logger.exception("Skill discovery failed for query %r: %s", query, exc)
        items = [skill.public_dict() for skill in discover_skills()]
    return {"items": items, "query": query}


@router.post("", status_code=201)
async def add_skill(
    body: CreateSkillRequest,
    auth: AuthContext = Depends(require_auth),
):
    del auth
    try:
        skill = create_skill(
            name=body.name,
            description=body.description,
            instructions=body.instructions,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"item": skill.public_dict()}
