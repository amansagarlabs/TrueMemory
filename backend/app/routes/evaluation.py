from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_admin
from evaluation.run_evals import run
from services.interaction_evaluation import evaluate_answer
from services.router_experiments import compare_router_variants

router = APIRouter(prefix="/api/evaluation", tags=["evaluation"])


@router.post("/run")
async def run_evaluation(_: AuthContext = Depends(require_admin)):
    """Run the deterministic, network-free core benchmark."""
    return run()


class EvaluatorRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    answer: str = Field(default="", max_length=40_000)
    route: dict[str, Any]
    memory_count: int = Field(default=0, ge=0)
    web_used: bool = False


class RouterExperimentRequest(BaseModel):
    questions: list[str] = Field(..., min_length=1, max_length=200)


@router.post("/admin/evaluate")
async def evaluate_answer_endpoint(
    body: EvaluatorRequest,
    _: AuthContext = Depends(require_admin),
):
    decision = type("Decision", (), {
        "subject": body.route.get("subject") or {},
        "needs_web": bool(body.route.get("needs_web")),
    })()
    return evaluate_answer(
        question=body.question,
        answer=body.answer,
        decision=decision,
        memory_count=body.memory_count,
        web_used=body.web_used,
    )


@router.post("/admin/router-ab")
async def router_ab_preview(
    body: RouterExperimentRequest,
    _: AuthContext = Depends(require_admin),
):
    return compare_router_variants(body.questions)
