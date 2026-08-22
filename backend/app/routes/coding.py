"""Durable coding tasks and execution events."""

import asyncio
import hashlib
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, require_auth
from app.config import get_settings
from services.ag_ui_events import sse
from services.coding_approvals import (
    CodingApprovalAction,
    coding_approval_payload_hash,
    normalize_coding_approval_payload,
)
from services.coding_agent import (
    AgentPhase,
)
from services.coding_plans import get_coding_plan, save_coding_plan
from services.postgres_store import (
    append_coding_agent_checkpoint,
    append_coding_agent_output,
    append_coding_task_event,
    create_coding_approval,
    create_or_get_approved_coding_operation_run,
    create_or_get_coding_agent_run,
    create_coding_task,
    decide_coding_approval,
    ensure_coding_task_schema,
    get_coding_task,
    get_coding_preferences,
    get_coding_preview_by_token,
    get_coding_agent_run,
    list_coding_tasks,
    list_coding_agent_runs,
    list_coding_agent_messages,
    list_coding_agent_outputs,
    list_coding_agent_task_outputs,
    list_coding_worker_heartbeats,
    postgres_enabled,
    resolve_user_id,
    request_coding_agent_run_cancel,
    upsert_workspace,
    update_coding_task,
    configure_coding_task,
    update_coding_preferences,
)
from services.coding_runtime import (
    code_index_status,
    export_runtime_working_tree,
    is_local_workspace_repository,
    local_workspace_snapshot_status,
    prepare_code_index,
    runtime_changes,
    runtime_status,
    save_local_workspace_snapshot,
    search_task_code_index,
    start_runtime,
    stop_runtime,
    proxy_runtime_preview,
)
from services.connector_store import get_github_access_token
from services.model_registry import resolve_openrouter_model

router = APIRouter(prefix="/api/coding/tasks", tags=["coding"])
preview_router = APIRouter(prefix="/api/coding/previews", tags=["coding-previews"])
worker_router = APIRouter(prefix="/api/coding", tags=["coding-worker"])


@worker_router.get("/worker/status")
async def get_coding_worker_status(auth: AuthContext = Depends(require_auth)):
    """Expose worker liveness and current activity to the coding workspace."""
    settings, user_id = _storage(auth)
    workers = list_coding_worker_heartbeats(settings, stale_after_seconds=20)
    connected_workers = [worker for worker in workers if worker.get("connected")]
    active_runs = [
        worker for worker in connected_workers if worker.get("current_run_id")
    ]
    enriched_workers: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    for worker in connected_workers:
        current_task = None
        current_run = None
        current_task_id = str(worker.get("current_task_id") or "").strip()
        current_run_id = str(worker.get("current_run_id") or "").strip()
        if current_task_id:
            current_task = get_coding_task(
                settings,
                user_id=user_id,
                task_id=current_task_id,
            )
        if current_task and current_run_id:
            current_run = get_coding_agent_run(
                settings,
                user_id=user_id,
                task_id=current_task_id,
                run_id=current_run_id,
            )
        lease_expires_at = None
        lease_seconds_remaining = None
        if current_run and current_run.get("lease_expires_at"):
            lease_expires_at = current_run.get("lease_expires_at")
            try:
                lease_value = lease_expires_at
                if not isinstance(lease_value, datetime):
                    lease_value = datetime.fromisoformat(
                        str(lease_expires_at).replace("Z", "+00:00")
                    )
                lease_seconds_remaining = max(
                    0,
                    int((lease_value - now).total_seconds()),
                )
            except ValueError:
                lease_seconds_remaining = None
        enriched_workers.append(
            {
                **worker,
                "current_task": current_task,
                "current_run": current_run,
                "lease_expires_at": lease_expires_at,
                "lease_seconds_remaining": lease_seconds_remaining,
            }
        )
    return {
        "connected": bool(enriched_workers),
        "active": bool(active_runs),
        "workers": enriched_workers,
        "checked_at": time.time(),
    }
_schema_ready = False
TaskType = Literal["explain", "review", "analyze", "implement"]
TaskStatus = Literal[
    "planning",
    "running",
    "waiting_approval",
    "testing",
    "completed",
    "failed",
    "cancelled",
]
ApprovalAction = CodingApprovalAction
InteractionMode = Literal["ask", "plan", "build"]
EffortProfile = Literal["fast", "balanced", "deep"]


class GithubCodingSource(BaseModel):
    kind: Literal["github"]
    fullName: str = Field(..., min_length=3, max_length=240)
    branch: str = Field(default="main", min_length=1, max_length=255)


class LocalGitCodingSource(BaseModel):
    kind: Literal["local_git"]
    workspaceSlug: str = Field(..., min_length=1, max_length=160)
    branch: str = Field(default="main", min_length=1, max_length=255)
    snapshotId: str = Field(default="", max_length=128)


CodingSource = GithubCodingSource | LocalGitCodingSource


class CodingGoalSpec(BaseModel):
    objective: str = Field(..., min_length=1, max_length=4_000)
    acceptanceCriteria: list[str] = Field(default_factory=list, max_length=24)
    constraints: list[str] = Field(default_factory=list, max_length=24)


class CodingPreferencesPatchRequest(BaseModel):
    onboardingVersion: int | None = Field(default=None, ge=0, le=100)
    defaultInteractionMode: InteractionMode | None = None
    defaultEffortProfile: EffortProfile | None = None
    lastSource: CodingSource | None = None
    onboardingPersona: str | None = Field(default=None, max_length=80)
    onboardingHeardAbout: str | None = Field(default=None, max_length=80)
    onboardingUseCase: str | None = Field(default=None, max_length=80)
    onboardingWorkspaceName: str | None = Field(default=None, max_length=120)
    onboardingStep: str | None = Field(default=None, max_length=80)


class CodingTaskCreateRequest(BaseModel):
    workspace_id: UUID
    workspace_name: str | None = Field(default=None, max_length=120)
    project_id: UUID | None = None
    repository_full_name: str = Field(..., min_length=3, max_length=240)
    branch: str = Field(default="main", min_length=1, max_length=255)
    task_type: TaskType
    goal: str = Field(..., min_length=1, max_length=4_000)
    source: CodingSource | None = None
    interaction_mode: InteractionMode = "ask"
    effort_profile: EffortProfile = "fast"
    goal_spec: CodingGoalSpec | None = None


class CodingTaskUpdateRequest(BaseModel):
    status: TaskStatus
    result: str = Field(default="", max_length=100_000)
    error: str = Field(default="", max_length=4_000)


class CodingTaskConfigurationRequest(BaseModel):
    interaction_mode: InteractionMode
    effort_profile: EffortProfile
    goal_spec: CodingGoalSpec


class CodingPlanSaveRequest(BaseModel):
    plan: dict[str, Any]
    status: Literal["draft", "approved"] = "draft"


class CodingTaskEventRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=80)
    phase: str = Field(default="", max_length=80)
    message: str = Field(default="", max_length=4_000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CodingAgentContextItem(BaseModel):
    kind: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=300)
    content: str = Field(default="", max_length=2_000)
    score: float = Field(default=0.0, ge=0.0, le=100.0)


class CodingAgentRunRequest(BaseModel):
    selected_model: str = Field(default="openrouter-free", max_length=80)
    prompt: str = Field(default="", max_length=4_000)
    task_type: TaskType | None = None
    active_file: str = Field(default="", max_length=1_000)
    recovery: bool = False
    interaction_mode: InteractionMode | None = None
    effort_profile: EffortProfile | None = None
    goal_spec: CodingGoalSpec | None = None
    parent_run_id: UUID | None = None
    idempotency_key: str = Field(default="", max_length=128)
    run_id: UUID | None = None
    after_sequence: int = Field(default=0, ge=0)
    context_items: list[CodingAgentContextItem] = Field(
        default_factory=list,
        max_length=24,
    )


class RuntimeCommandRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=2_000)
    approval_id: UUID
    timeout_seconds: int = Field(default=60, ge=1, le=120)


class CodingApprovalCreateRequest(BaseModel):
    action: ApprovalAction
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2_000)
    payload: dict[str, Any] = Field(default_factory=dict)


class CodingApprovalDecisionRequest(BaseModel):
    approved: bool


class PatchOperationRequest(BaseModel):
    approval_id: UUID
    patch: str = Field(..., min_length=1, max_length=200_000)


class TestOperationRequest(BaseModel):
    approval_id: UUID
    command: str = Field(..., min_length=1, max_length=2_000)
    timeout_seconds: int = Field(default=120, ge=1, le=120)


class CommitOperationRequest(BaseModel):
    approval_id: UUID
    message: str = Field(..., min_length=1, max_length=200)


class PullRequestOperationRequest(BaseModel):
    approval_id: UUID
    title: str = Field(..., min_length=1, max_length=256)
    body: str = Field(default="", max_length=10_000)
    base: str = Field(..., min_length=1, max_length=200)
    branch: str = Field(..., min_length=1, max_length=200)


class PreviewOperationRequest(BaseModel):
    approval_id: UUID
    command: str = Field(..., min_length=1, max_length=2_000)
    port: int = Field(default=3000, ge=1024, le=65535)


class ApprovedOperationRequest(BaseModel):
    approval_id: UUID
    action: ApprovalAction
    payload: dict[str, Any] = Field(default_factory=dict)


def _ensure_schema(settings) -> None:
    global _schema_ready
    if not _schema_ready:
        ensure_coding_task_schema(settings)
        _schema_ready = True


def _storage(auth: AuthContext):
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=503, detail="Coding task storage is unavailable.")
    user_id = resolve_user_id(settings, str(auth.user_id))
    if not user_id:
        raise HTTPException(status_code=404, detail="User could not be resolved.")
    _ensure_schema(settings)
    return settings, user_id


@worker_router.get("/preferences")
async def get_preferences(auth: AuthContext = Depends(require_auth)):
    settings, user_id = _storage(auth)
    return get_coding_preferences(settings, user_id=user_id)


@worker_router.patch("/preferences")
async def patch_preferences(
    body: CodingPreferencesPatchRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    updates = body.model_dump(mode="json", exclude_none=True)
    return update_coding_preferences(settings, user_id=user_id, preferences=updates)


@router.get("")
async def get_tasks(
    workspace_id: UUID = Query(...),
    project_id: UUID | None = Query(default=None),
    repository: str | None = Query(default=None, max_length=240),
    limit: int = Query(default=20, ge=1, le=100),
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    return {
        "items": list_coding_tasks(
            settings,
            user_id=user_id,
            workspace_id=str(workspace_id),
            project_id=str(project_id) if project_id else None,
            repository_full_name=repository,
            limit=limit,
        )
    }


@router.post("", status_code=201)
async def post_task(
    body: CodingTaskCreateRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    try:
        upsert_workspace(
            settings,
            workspace_id=str(body.workspace_id),
            user_id=user_id,
            name=body.workspace_name or "My workspace",
            platform="Kontext Coding",
        )
        item = create_coding_task(
            settings,
            user_id=user_id,
            workspace_id=str(body.workspace_id),
            project_id=str(body.project_id) if body.project_id else None,
            repository_full_name=body.repository_full_name,
            branch=body.branch,
            task_type=body.task_type,
            goal=body.goal,
            source=(
                body.source.model_dump(mode="json")
                if body.source
                else {
                    "kind": "local_git" if body.repository_full_name.startswith("local:") else "github",
                    **(
                        {
                            "workspaceSlug": body.repository_full_name.removeprefix("local:"),
                            "snapshotId": "",
                        }
                        if body.repository_full_name.startswith("local:")
                        else {"fullName": body.repository_full_name}
                    ),
                    "branch": body.branch,
                }
            ),
            interaction_mode=body.interaction_mode,
            effort_profile=body.effort_profile,
            goal_spec=(
                body.goal_spec.model_dump(mode="json")
                if body.goal_spec
                else {
                    "objective": body.goal,
                    "acceptanceCriteria": [],
                    "constraints": [],
                }
            ),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": item}


@router.get("/{task_id}")
async def get_task(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    item = get_coding_task(settings, user_id=user_id, task_id=str(task_id))
    if not item:
        raise HTTPException(status_code=404, detail="Coding task was not found.")
    return {"item": item}


@router.patch("/{task_id}")
async def patch_task(
    task_id: UUID,
    body: CodingTaskUpdateRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    try:
        item = update_coding_task(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            status=body.status,
            result=body.result,
            error=body.error,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Coding task was not found.")
    return {"item": item}


@router.patch("/{task_id}/configuration")
async def patch_task_configuration(
    task_id: UUID,
    body: CodingTaskConfigurationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    try:
        item = configure_coding_task(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            interaction_mode=body.interaction_mode,
            effort_profile=body.effort_profile,
            goal_spec=body.goal_spec.model_dump(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Coding task was not found.")
    return {"item": item}


@router.get("/{task_id}/plan")
async def get_task_plan(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    item = get_coding_plan(
        settings,
        user_id=user_id,
        task_id=str(task_id),
    )
    return {"item": item}


@router.put("/{task_id}/plan")
async def put_task_plan(
    task_id: UUID,
    body: CodingPlanSaveRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    try:
        item = save_coding_plan(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            plan=body.plan,
            status=body.status,
        )
        append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type=(
                "agent.plan.approved"
                if body.status == "approved"
                else "agent.plan.updated"
            ),
            phase="planning",
            message=(
                "Plan approved for Build."
                if body.status == "approved"
                else "Plan draft updated."
            ),
            metadata={
                "revision": item["revision"],
                "artifact_path": item["artifact_path"],
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"item": item}


@router.post("/{task_id}/events", status_code=201)
async def post_task_event(
    task_id: UUID,
    body: CodingTaskEventRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    try:
        item = append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type=body.event_type,
            phase=body.phase,
            message=body.message,
            metadata=body.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"item": item}


def _owned_task(settings, user_id: str, task_id: UUID):
    task = get_coding_task(settings, user_id=user_id, task_id=str(task_id))
    if not task:
        raise HTTPException(status_code=404, detail="Coding task was not found.")
    return task


@router.get("/{task_id}/workspace-snapshot")
async def get_workspace_snapshot(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    if not is_local_workspace_repository(task["repository_full_name"]):
        raise HTTPException(
            status_code=409,
            detail="Workspace snapshots are only available for local coding tasks.",
        )
    try:
        return local_workspace_snapshot_status(settings, task_id=str(task_id))
    except (ValueError, OverflowError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{task_id}/workspace-snapshot")
async def put_workspace_snapshot(
    task_id: UUID,
    request: Request,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    if not is_local_workspace_repository(task["repository_full_name"]):
        raise HTTPException(
            status_code=409,
            detail="Workspace snapshots are only accepted for local coding tasks.",
        )
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip()
    if content_type not in {"application/zip", "application/octet-stream"}:
        raise HTTPException(
            status_code=415,
            detail="Upload the local workspace as a ZIP archive.",
        )
    archive = bytearray()
    async for chunk in request.stream():
        archive.extend(chunk)
        if len(archive) > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="The local workspace snapshot exceeds the 50 MB upload limit.",
            )
    try:
        status = await asyncio.to_thread(
            save_local_workspace_snapshot,
            settings,
            task_id=str(task_id),
            archive_bytes=bytes(archive),
        )
    except OverflowError as exc:
        raise HTTPException(
            status_code=413,
            detail="The local workspace snapshot is too large.",
        ) from exc
    except ValueError as exc:
        detail = {
            "workspace_snapshot_contains_private_file": (
                "The snapshot contains a private key or environment file."
            ),
            "workspace_snapshot_symlink_not_allowed": (
                "Symbolic links are not allowed in local workspace snapshots."
            ),
            "workspace_snapshot_invalid_zip": "The workspace snapshot is not a valid ZIP.",
            "workspace_snapshot_empty": "The workspace snapshot contains no files.",
        }.get(str(exc), "The local workspace snapshot is unsafe.")
        raise HTTPException(status_code=400, detail=detail) from exc
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="workspace_snapshot_uploaded",
        phase="retrieving",
        message=f"Received an approved snapshot containing {status['files']} files.",
        metadata=status,
    )
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="source_synchronized",
        phase="retrieving",
        message="Local Git source snapshot synchronized.",
        metadata={**status, "source_kind": "local_git"},
    )
    return status


@router.get("/{task_id}/index")
async def get_task_index(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    return code_index_status(settings, task_id=str(task_id))


@router.post("/{task_id}/index")
async def post_task_index(
    task_id: UUID,
    force: bool = Query(default=False),
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="index_started",
        phase="retrieving",
        message="Building the repository map and symbol index.",
    )
    try:
        token = get_github_access_token(settings, user_id=user_id) or settings.github_token
        status = await prepare_code_index(
            settings,
            task_id=str(task_id),
            repository=task["repository_full_name"],
            ref=task["branch"],
            github_token=token,
            cache_scope=user_id,
            force=force,
        )
    except RuntimeError as exc:
        append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type="index_failed",
            phase="retrieving",
            message="Repository indexing failed.",
            metadata={"reason": str(exc)},
        )
        detail = {
            "github_not_configured": "Connect GitHub before indexing a repository.",
            "github_archive_request_failed": "The repository snapshot could not be downloaded.",
            "workspace_snapshot_not_uploaded": "Upload the approved local workspace before indexing it.",
        }.get(str(exc), "The repository could not be indexed.")
        raise HTTPException(status_code=502, detail=detail) from exc
    except (ValueError, OverflowError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="index_completed",
        phase="retrieving",
        message=f"Indexed {status.get('files', 0)} files and {status.get('symbols', 0)} symbols.",
        metadata=status,
    )
    return status


@router.get("/{task_id}/index/search")
async def get_task_index_search(
    task_id: UUID,
    q: str = Query(..., min_length=1, max_length=4_000),
    mode: Literal["hybrid", "literal", "regex"] = Query(default="hybrid"),
    limit: int = Query(default=12, ge=1, le=50),
    max_chars: int = Query(default=18_000, ge=2_000, le=40_000),
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    try:
        return await search_task_code_index(
            settings,
            task_id=str(task_id),
            query=q,
            mode=mode,
            limit=limit,
            max_chars=max_chars,
        )
    except RuntimeError as exc:
        if str(exc) == "code_index_not_ready":
            raise HTTPException(
                status_code=409,
                detail="Build the repository index before searching it.",
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="Repository search is unavailable.",
        ) from exc


def _decode_agent_sse(chunk: str) -> dict[str, Any]:
    for line in chunk.splitlines():
        if line.startswith("data:"):
            value = json.loads(line[5:].strip())
            if isinstance(value, dict):
                return value
    raise ValueError("The coding agent produced an invalid stream event.")


def _encode_durable_agent_output(output: dict[str, Any]) -> str:
    payload = output.get("payload") or {}
    return (
        f"id: {int(output['sequence'])}\n"
        f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    )


def _agent_history_messages(
    task: dict[str, Any],
    runs: list[dict[str, Any]],
    outputs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    outputs_by_run: dict[str, list[dict[str, Any]]] = {}
    for output in outputs:
        outputs_by_run.setdefault(str(output.get("run_id") or ""), []).append(output)

    messages: list[dict[str, Any]] = []
    for position, run in enumerate(runs):
        run_id = str(run.get("id") or "")
        request = run.get("request") if isinstance(run.get("request"), dict) else {}
        prompt = str(request.get("prompt") or "").strip()
        if not prompt and position == 0:
            prompt = str(task.get("goal") or "").strip()
        if prompt:
            messages.append(
                {
                    "id": f"{run_id}:user",
                    "run_id": run_id,
                    "role": "user",
                    "content": prompt,
                    "created_at": run.get("created_at"),
                }
            )

        answer = "".join(
            str((output.get("payload") or {}).get("content") or "")
            for output in outputs_by_run.get(run_id, [])
            if str(output.get("event_type") or "") == "agent.message.delta"
        ).strip()
        if answer:
            messages.append(
                {
                    "id": f"{run_id}:assistant",
                    "run_id": run_id,
                    "role": "assistant",
                    "content": answer,
                    "created_at": run.get("completed_at") or run.get("updated_at"),
                }
            )
    return messages


@router.get("/{task_id}/agent/history")
async def get_agent_history(
    task_id: UUID,
    after_sequence: int = Query(default=0, ge=0),
    event_limit: int = Query(default=1_000, ge=1, le=2_000),
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    runs = list_coding_agent_runs(
        settings,
        user_id=user_id,
        task_id=str(task_id),
    )
    output_page = list_coding_agent_task_outputs(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        after_sequence=after_sequence,
        limit=event_limit + 1,
    )
    has_more = len(output_page) > event_limit
    outputs = output_page[:event_limit]
    messages = list_coding_agent_messages(
        settings,
        user_id=user_id,
        task_id=str(task_id),
    )
    return {
        "task_id": str(task_id),
        "messages": messages or _agent_history_messages(task, runs, outputs),
        "runs": runs,
        "events": [
            {
                **(output.get("payload") or {}),
                "sequence": output.get("sequence"),
                "run_id": output.get("run_id"),
                "created_at": output.get("created_at"),
            }
            for output in outputs
        ],
        "has_more": has_more,
        "next_sequence": (
            int(outputs[-1]["sequence"]) if outputs else after_sequence
        ),
    }


@router.post("/{task_id}/agent/stream")
async def post_agent_stream(
    task_id: UUID,
    body: CodingAgentRunRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Run a typed read-only coding-agent loop and stream every durable state."""
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    effective_goal = body.prompt.strip() or str(task["goal"])
    effective_task_type = body.task_type or task["task_type"]
    interaction_mode = body.interaction_mode or task.get("interaction_mode") or "ask"
    effort_profile = body.effort_profile or task.get("effort_profile") or "fast"
    goal_spec = (
        body.goal_spec.model_dump(mode="json")
        if body.goal_spec
        else task.get("goal_spec") or {
            "objective": effective_goal,
            "acceptanceCriteria": [],
            "constraints": [],
        }
    )
    request_payload = body.model_dump(mode="json", exclude={"run_id", "after_sequence"})
    if body.run_id:
        run = get_coding_agent_run(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            run_id=str(body.run_id),
        )
        if run is None:
            raise HTTPException(status_code=404, detail="Coding agent run was not found.")
        model = str(run.get("model") or "")
    else:
        if not settings.openrouter_api_key.strip():
            raise HTTPException(
                status_code=503,
                detail="Configure OPENROUTER_API_KEY before running the coding agent.",
            )
        model = resolve_openrouter_model(
            body.selected_model,
            has_images=False,
            default_model=settings.openrouter_model,
            vision_model=settings.openrouter_vision_model,
        )
        run = create_or_get_coding_agent_run(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            idempotency_key=body.idempotency_key.strip() or secrets.token_urlsafe(24),
            model=model,
            request=request_payload,
            source=task.get("source") or {},
            interaction_mode=interaction_mode,
            effort_profile=effort_profile,
            goal_spec=goal_spec,
            parent_run_id=str(body.parent_run_id) if body.parent_run_id else None,
            orchestration_role="orchestrator",
        )
        if not run.get("request_matches", True):
            raise HTTPException(
                status_code=409,
                detail="The idempotency key is already bound to a different run request.",
            )
    agent_run_id = str(run["id"])
    if run.get("created"):
        queued_metadata = {
            "model": model,
            "goal": effective_goal,
            "task_type": effective_task_type,
            "interaction_mode": interaction_mode,
            "effort_profile": effort_profile,
            "goal_spec": goal_spec,
        }
        queued_payload = _decode_agent_sse(
            sse(
                "agent.run.queued",
                {
                    "task_id": str(task_id),
                    "run_id": agent_run_id,
                    "phase": "queued",
                    "message": "Coding agent run queued.",
                    "metadata": queued_metadata,
                },
            )
        )
        append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type="agent.run.queued",
            phase="queued",
            message="Coding agent run queued.",
            metadata=queued_metadata,
        )
        append_coding_agent_output(
            settings,
            user_id=user_id,
            run_id=agent_run_id,
            event_id=str(queued_payload["id"]),
            event_type="agent.run.queued",
            payload=queued_payload,
        )

    async def durable_subscriber():
        cursor = body.after_sequence
        last_keepalive = time.monotonic()
        while True:
            outputs = await asyncio.to_thread(
                list_coding_agent_outputs,
                settings,
                user_id=user_id,
                run_id=agent_run_id,
                after_sequence=cursor,
            )
            for output in outputs:
                cursor = int(output["sequence"])
                yield _encode_durable_agent_output(output)
            current_run = await asyncio.to_thread(
                get_coding_agent_run,
                settings,
                user_id=user_id,
                task_id=str(task_id),
                run_id=agent_run_id,
            )
            if current_run is None:
                break
            if current_run.get("status") in {
                "waiting_approval",
                "completed",
                "failed",
                "cancelled",
            }:
                remaining = await asyncio.to_thread(
                    list_coding_agent_outputs,
                    settings,
                    user_id=user_id,
                    run_id=agent_run_id,
                    after_sequence=cursor,
                )
                for output in remaining:
                    cursor = int(output["sequence"])
                    yield _encode_durable_agent_output(output)
                break
            await asyncio.sleep(1)
            if time.monotonic() - last_keepalive >= 15:
                yield ": keepalive\n\n"
                last_keepalive = time.monotonic()

    return StreamingResponse(
        durable_subscriber(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Coding-Agent-Run-Id": agent_run_id,
        },
    )


@router.get("/{task_id}/agent/runs/{run_id}")
async def get_agent_run(
    task_id: UUID,
    run_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    run = get_coding_agent_run(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        run_id=str(run_id),
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Coding agent run was not found.")
    return {"item": run}


@router.delete("/{task_id}/agent/runs/{run_id}")
async def delete_agent_run(
    task_id: UUID,
    run_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    """Request cooperative cancellation without tying it to a browser connection."""
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    run = request_coding_agent_run_cancel(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        run_id=str(run_id),
    )
    if run is None:
        existing = get_coding_agent_run(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            run_id=str(run_id),
        )
        if existing is None:
            raise HTTPException(status_code=404, detail="Coding agent run was not found.")
        return {"item": existing}
    if run.get("status") == "cancelled":
        payload = _decode_agent_sse(
            sse(
                "agent.run.cancelled",
                {
                    "task_id": str(task_id),
                    "run_id": str(run_id),
                    "phase": AgentPhase.CANCELLED.value,
                    "message": "Coding agent run was cancelled before execution.",
                    "metadata": {},
                },
            )
        )
        output = append_coding_agent_output(
            settings,
            user_id=user_id,
            run_id=str(run_id),
            event_id=str(payload["id"]),
            event_type="agent.run.cancelled",
            payload=payload,
        )
        append_coding_agent_checkpoint(
            settings,
            user_id=user_id,
            run_id=str(run_id),
            output_sequence=int(output["sequence"]),
            phase=AgentPhase.CANCELLED.value,
            checkpoint_type="agent.run.cancelled",
            state={
                "event_id": payload["id"],
                "sequence": output["sequence"],
            },
        )
    return {"item": run}


_approval_payload_hash = coding_approval_payload_hash
_normalized_approval_payload = normalize_coding_approval_payload


@router.post("/{task_id}/approvals", status_code=201)
async def post_task_approval(
    task_id: UUID,
    body: CodingApprovalCreateRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    try:
        payload = _normalized_approval_payload(body.action, body.payload)
        approval = create_coding_approval(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            action=body.action,
            title=body.title,
            description=body.description,
            payload=payload,
            payload_hash=_approval_payload_hash(body.action, payload),
        )
        append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type="approval_requested",
            phase="waiting_approval",
            message=body.title,
            metadata={"approval_id": approval["id"], "action": body.action},
        )
        return {"item": approval}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{task_id}/approvals/{approval_id}/decision")
async def post_task_approval_decision(
    task_id: UUID,
    approval_id: UUID,
    body: CodingApprovalDecisionRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    approval = decide_coding_approval(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        approval_id=str(approval_id),
        approved=body.approved,
    )
    if not approval:
        raise HTTPException(
            status_code=409,
            detail="This approval is no longer pending.",
        )
    if approval["status"] == "expired":
        raise HTTPException(
            status_code=409,
            detail="This approval expired before it was resolved.",
        )
    was_approved = approval["status"] == "approved"
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="approval_approved" if was_approved else "approval_rejected",
        phase="executing" if was_approved else "planning",
        message=approval["title"],
        metadata={"approval_id": approval["id"], "action": approval["action"]},
    )
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="approval_resolved",
        phase="executing" if was_approved else "planning",
        message=approval["title"],
        metadata={
            "approval_id": approval["id"],
            "action": approval["action"],
            "approved": was_approved,
        },
    )
    return {"item": approval}


def _queue_approved_operation(
    settings,
    *,
    user_id: str,
    task_id: UUID,
    approval_id: UUID,
    action: ApprovalAction,
    payload: dict[str, Any],
) -> dict[str, Any]:
    run = create_or_get_approved_coding_operation_run(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        approval_id=str(approval_id),
        action=action,
        payload=payload,
        payload_hash=_approval_payload_hash(action, payload),
    )
    if run is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "A valid, unexpired approval for this exact "
                f"{action.replace('_', ' ')} is required."
            ),
        )

    run_id = str(run["id"])
    if run.get("created"):
        metadata = {
            "action": action,
            "approval_id": str(approval_id),
            "operation_run_id": run_id,
        }
        payload_event = _decode_agent_sse(
            sse(
                "operation.queued",
                {
                    "task_id": str(task_id),
                    "run_id": run_id,
                    "phase": "queued",
                    "message": (
                        f"Approved {action.replace('_', ' ')} operation queued."
                    ),
                    "metadata": metadata,
                },
            )
        )
        append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type="operation.queued",
            phase="queued",
            message=f"Approved {action.replace('_', ' ')} operation queued.",
            metadata=metadata,
        )
        append_coding_agent_output(
            settings,
            user_id=user_id,
            run_id=run_id,
            event_id=str(payload_event["id"]),
            event_type="operation.queued",
            payload=payload_event,
        )
    return run


async def _run_approved_operation(
    settings,
    *,
    user_id: str,
    task_id: UUID,
    approval_id: UUID,
    action: ApprovalAction,
    payload: dict[str, Any],
) -> dict[str, Any]:
    run = _queue_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=approval_id,
        action=action,
        payload=payload,
    )
    run_id = str(run["id"])

    timeout_seconds = min(
        180,
        max(30, int(payload.get("timeout_seconds") or 60) + 30),
    )
    deadline = time.monotonic() + timeout_seconds
    while True:
        current = get_coding_agent_run(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            run_id=run_id,
        )
        if current is None:
            raise HTTPException(
                status_code=500,
                detail="The approved coding operation could not be recovered.",
            )
        if current["status"] == "completed":
            checkpoint = current.get("checkpoint")
            result = (
                checkpoint.get("result")
                if isinstance(checkpoint, dict)
                else None
            )
            if not isinstance(result, dict):
                raise HTTPException(
                    status_code=500,
                    detail="The coding worker completed without a durable result.",
                )
            return result
        if current["status"] in {"failed", "cancelled"}:
            detail = str(current.get("error") or "").strip()
            if not detail:
                detail = (
                    "The approved coding operation was cancelled."
                    if current["status"] == "cancelled"
                    else "The approved coding operation failed."
                )
            raise HTTPException(
                status_code=400 if action == "apply_patch" else 409,
                detail=detail,
            )
        if time.monotonic() >= deadline:
            raise HTTPException(
                status_code=504,
                detail=(
                    "The coding operation is still running in the background. "
                    "Its durable result will remain available after reconnecting."
                ),
            )
        await asyncio.sleep(0.25)


@router.post("/{task_id}/runtime/operations", status_code=202)
async def post_runtime_operation(
    task_id: UUID,
    body: ApprovedOperationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    try:
        payload = _normalized_approval_payload(body.action, body.payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run = _queue_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action=body.action,
        payload=payload,
    )
    return {"item": run}


@router.get("/{task_id}/runtime/changes")
async def get_runtime_changes(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    try:
        return await runtime_changes(settings, task_id=str(task_id))
    except RuntimeError as exc:
        detail = {
            "coding_runtime_disabled": "The isolated coding runtime is not enabled.",
            "coding_runtime_not_running": "Start the isolated runtime first.",
        }.get(str(exc), str(exc) or "Repository changes could not be loaded.")
        raise HTTPException(status_code=409, detail=detail) from exc


@router.get("/{task_id}/runtime/workspace-sync")
async def get_runtime_workspace_sync(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    if not is_local_workspace_repository(task["repository_full_name"]):
        raise HTTPException(
            status_code=400,
            detail="Workspace sync is only available for local coding tasks.",
        )
    try:
        return await export_runtime_working_tree(settings, task_id=str(task_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OverflowError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except RuntimeError as exc:
        detail = {
            "coding_runtime_disabled": "The isolated coding runtime is not enabled.",
            "coding_runtime_not_running": "Start the isolated runtime first.",
            "runtime_sync_file_unavailable": (
                "A changed runtime file could not be exported safely."
            ),
        }.get(str(exc), str(exc) or "Runtime changes could not be synchronized.")
        raise HTTPException(status_code=409, detail=detail) from exc


@router.post("/{task_id}/runtime/patch")
async def post_runtime_patch(
    task_id: UUID,
    body: PatchOperationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    payload = _normalized_approval_payload("apply_patch", {"patch": body.patch})
    return await _run_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action="apply_patch",
        payload=payload,
    )


@router.post("/{task_id}/runtime/tests")
async def post_runtime_tests(
    task_id: UUID,
    body: TestOperationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    payload = _normalized_approval_payload(
        "run_tests",
        {
            "command": body.command,
            "timeout_seconds": body.timeout_seconds,
        },
    )
    return await _run_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action="run_tests",
        payload=payload,
    )


@router.post("/{task_id}/runtime/commit")
async def post_runtime_commit(
    task_id: UUID,
    body: CommitOperationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    payload = _normalized_approval_payload(
        "create_commit",
        {"message": body.message},
    )
    return await _run_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action="create_commit",
        payload=payload,
    )


@router.post("/{task_id}/runtime/pull-request")
async def post_runtime_pull_request(
    task_id: UUID,
    body: PullRequestOperationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    payload = _normalized_approval_payload(
        "create_pull_request",
        {
            "title": body.title,
            "body": body.body,
            "base": body.base,
            "branch": body.branch,
        },
    )
    return await _run_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action="create_pull_request",
        payload=payload,
    )


@router.post("/{task_id}/runtime/preview", status_code=201)
async def post_runtime_preview(
    task_id: UUID,
    body: PreviewOperationRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    payload = _normalized_approval_payload(
        "start_preview",
        {"command": body.command, "port": body.port},
    )
    return await _run_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action="start_preview",
        payload=payload,
    )


def _rewrite_preview_html(content: bytes, token: str) -> bytes:
    try:
        html = content.decode("utf-8")
    except UnicodeDecodeError:
        return content
    prefix = f"/api/coding/previews/{token}/"
    for attribute in ("src", "href", "action"):
        html = html.replace(f'{attribute}="/', f'{attribute}="{prefix}')
        html = html.replace(f"{attribute}='/", f"{attribute}='{prefix}")
    return html.encode("utf-8")


@preview_router.api_route("/{token}", methods=["GET", "HEAD"])
@preview_router.api_route(
    "/{token}/{preview_path:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def proxy_coding_preview(
    token: str,
    request: Request,
    preview_path: str = "",
):
    if len(token) < 32 or len(token) > 128:
        raise HTTPException(status_code=404, detail="Preview was not found.")
    settings = get_settings()
    if not postgres_enabled(settings):
        raise HTTPException(status_code=503, detail="Preview storage is unavailable.")
    _ensure_schema(settings)
    preview = get_coding_preview_by_token(
        settings,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
    )
    if not preview:
        raise HTTPException(status_code=404, detail="Preview was not found or expired.")
    query = f"?{request.url.query}" if request.url.query else ""
    path = f"/{preview_path}{query}"
    body = await request.body()
    if len(body) > 1_000_000:
        raise HTTPException(status_code=413, detail="Preview request body is too large.")
    try:
        result = await proxy_runtime_preview(
            settings,
            task_id=preview["task_id"],
            port=preview["port"],
            path=path,
            method=request.method,
            headers={
                key: value
                for key, value in request.headers.items()
                if key.lower()
                in {"accept", "content-type", "if-none-match", "if-modified-since"}
            },
            body=body,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Preview server is unavailable.") from exc
    response_headers = {
        key: value
        for key, value in result["headers"].items()
        if key.lower() in {"content-type", "cache-control", "etag", "last-modified"}
    }
    response_headers["Referrer-Policy"] = "no-referrer"
    response_headers["X-Content-Type-Options"] = "nosniff"
    content = result["body"]
    if "text/html" in response_headers.get("Content-Type", ""):
        content = _rewrite_preview_html(content, token)
    return Response(
        content=content,
        status_code=result["status"],
        headers=response_headers,
    )


@router.get("/{task_id}/runtime")
async def get_task_runtime(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    try:
        return await runtime_status(settings, task_id=str(task_id))
    except RuntimeError as exc:
        detail = {
            "docker_cli_not_found": "Docker is not installed on the runtime host.",
        }.get(str(exc), "The coding runtime status is unavailable.")
        raise HTTPException(status_code=503, detail=detail) from exc


@router.post("/{task_id}/runtime", status_code=201)
async def post_task_runtime(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    task = _owned_task(settings, user_id, task_id)
    try:
        token = get_github_access_token(settings, user_id=user_id) or settings.github_token
        approved_plan = get_coding_plan(
            settings,
            user_id=user_id,
            task_id=str(task_id),
        )
        runtime = await start_runtime(
            settings,
            task_id=str(task_id),
            repository=task["repository_full_name"],
            ref=task["branch"],
            github_token=token,
            plan_artifact=(
                str(approved_plan.get("markdown") or "")
                if approved_plan and approved_plan.get("status") == "approved"
                else ""
            ),
        )
        append_coding_task_event(
            settings,
            user_id=user_id,
            task_id=str(task_id),
            event_type="runtime_started",
            phase="executing",
            message="Isolated coding runtime started.",
            metadata={"network": "disabled", "workspace": "/workspace"},
        )
        return runtime
    except RuntimeError as exc:
        detail = {
            "coding_runtime_disabled": "The isolated coding runtime is not enabled.",
            "docker_cli_not_found": "Docker is not installed on the runtime host.",
            "github_not_configured": "Connect GitHub before starting a runtime.",
            "github_archive_request_failed": "The repository checkout could not be downloaded.",
            "workspace_snapshot_not_uploaded": "Upload the approved local workspace before starting a runtime.",
            "runtime_workspace_permissions": "The runtime workspace could not be prepared safely.",
        }.get(str(exc), str(exc) or "The coding runtime could not be started.")
        status = 503 if str(exc) in {"coding_runtime_disabled", "docker_cli_not_found"} else 502
        raise HTTPException(status_code=status, detail=detail) from exc
    except (ValueError, OverflowError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{task_id}/runtime/commands")
async def post_runtime_command(
    task_id: UUID,
    body: RuntimeCommandRequest,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    payload = _normalized_approval_payload(
        "run_command",
        {
            "command": body.command,
            "timeout_seconds": body.timeout_seconds,
        },
    )
    return await _run_approved_operation(
        settings,
        user_id=user_id,
        task_id=task_id,
        approval_id=body.approval_id,
        action="run_command",
        payload=payload,
    )


@router.delete("/{task_id}/runtime")
async def delete_task_runtime(
    task_id: UUID,
    auth: AuthContext = Depends(require_auth),
):
    settings, user_id = _storage(auth)
    _owned_task(settings, user_id, task_id)
    runtime = await stop_runtime(settings, task_id=str(task_id))
    append_coding_task_event(
        settings,
        user_id=user_id,
        task_id=str(task_id),
        event_type="runtime_stopped",
        phase="completed",
        message="Isolated coding runtime stopped.",
    )
    return runtime
