"""Dedicated background worker for durable coding-agent runs."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import socket
import time
from contextlib import suppress
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi.encoders import jsonable_encoder

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_PROJECT_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

logger = logging.getLogger(__name__)

from app.config import get_settings
from services.coding_approvals import (
    coding_approval_payload_hash as _approval_payload_hash,
    normalize_coding_approval_payload as _normalized_approval_payload,
)
from services.coding_agent import (
    AgentPhase,
    AgentTool,
    ContextCandidate,
    ToolResult,
    build_agent_plan,
    compile_priority_context,
    execute_agent_plan,
    extract_unified_patch,
    parse_agent_plan,
    recommend_test_command,
    stream_agent_synthesis,
    synthesis_messages,
)
from services.coding_operations import execute_coding_operation
from services.coding_plans import get_coding_plan, save_coding_plan
from services.connector_store import get_github_access_token
from services.coding_runtime import (
    materialize_runtime_plan,
    prepare_code_index,
    runtime_changes,
    runtime_status,
    search_task_code_index,
)
from services.postgres_store import (
    append_coding_agent_checkpoint,
    append_coding_agent_message,
    append_coding_agent_output,
    append_coding_task_event,
    claim_next_coding_agent_run,
    create_coding_approval,
    get_coding_agent_run,
    list_coding_agent_messages,
    list_coding_agent_runs,
    list_coding_agent_task_outputs,
    postgres_enabled,
    ensure_coding_task_schema,
    upsert_coding_worker_heartbeat,
    renew_coding_agent_run_lease,
    update_coding_agent_run,
    update_coding_task,
    upsert_coding_agent_step,
)


def mode_allows_writes(interaction_mode: str) -> bool:
    return interaction_mode == "build"


def user_facing_coding_error(reason: str) -> str:
    return {
        "github_repository_archive_not_found": (
            "GitHub could not create a source snapshot for this branch. "
            "Confirm the branch exists or create the repository's first commit."
        ),
        "github_archive_request_failed": (
            "GitHub could not provide the repository snapshot. Retry in a moment."
        ),
        "github_not_configured": "Connect GitHub once before using this repository.",
        "workspace_snapshot_not_uploaded": (
            "Reconnect the local Git folder so Kontext can refresh its source snapshot."
        ),
        "The coding model returned an empty response.": (
            "The model returned no text after two attempts. Your task and plan are saved; retry to continue."
        ),
    }.get(reason, reason or "The coding agent failed.")


def specialist_roles_for_effort(effort_profile: str) -> list[str]:
    return {
        "fast": [],
        "balanced": ["explorer", "dependency_analyst"],
        "deep": ["explorer", "dependency_analyst", "reviewer"],
    }.get(effort_profile, [])

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


def _output_payload(
    *,
    event_type: str,
    phase: AgentPhase,
    message: str,
    task_id: str,
    run_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(uuid4()),
        "type": event_type,
        "phase": phase.value,
        "task_id": task_id,
        "run_id": run_id,
    }
    if event_type == "agent.message.delta":
        payload["content"] = message
    else:
        payload["message"] = message
    payload["metadata"] = metadata or {}
    return payload


async def _store_event(
    settings,
    *,
    user_id: str,
    task_id: str,
    run_id: str,
    event_type: str,
    phase: AgentPhase,
    message: str,
    metadata: dict[str, Any] | None = None,
    persist_task_event: bool = True,
    persist_output: bool = True,
    persist_checkpoint: bool = True,
) -> dict[str, Any]:
    safe_metadata = jsonable_encoder(metadata or {})
    if persist_task_event:
        await asyncio.to_thread(
            append_coding_task_event,
            settings,
            user_id=user_id,
            task_id=task_id,
            event_type=event_type,
            phase=phase.value,
            message=message,
            metadata=safe_metadata,
        )
    payload = _output_payload(
        event_type=event_type,
        phase=phase,
        message=message,
        task_id=task_id,
        run_id=run_id,
        metadata=safe_metadata,
    )
    if persist_output:
        output = await asyncio.to_thread(
            append_coding_agent_output,
            settings,
            user_id=user_id,
            run_id=run_id,
            event_id=str(payload["id"]),
            event_type=event_type,
            payload=payload,
        )
        if persist_checkpoint and event_type != "agent.message.delta":
            await asyncio.to_thread(
                append_coding_agent_checkpoint,
                settings,
                user_id=user_id,
                run_id=run_id,
                output_sequence=int(output["sequence"]),
                phase=phase.value,
                checkpoint_type=event_type,
                state={
                    "event_id": payload["id"],
                    "sequence": output["sequence"],
                    "message": str(payload.get("message") or payload.get("content") or "")[
                        :500
                    ],
                },
            )
    return payload


def _operation_phase(value: str) -> AgentPhase:
    return {
        "planning": AgentPhase.PLANNING,
        "testing": AgentPhase.EXECUTING,
        "executing": AgentPhase.EXECUTING,
        "review": AgentPhase.REVIEWING,
        "reviewing": AgentPhase.REVIEWING,
        "waiting_approval": AgentPhase.WAITING_APPROVAL,
        "completed": AgentPhase.COMPLETED,
        "failed": AgentPhase.FAILED,
    }.get(value, AgentPhase.EXECUTING)


async def _run_operation_with_lease(
    operation,
    *,
    settings,
    user_id: str,
    run_id: str,
    lease_owner: str,
):
    async def guard_lease() -> None:
        while True:
            await asyncio.sleep(10)
            renewed = await asyncio.to_thread(
                renew_coding_agent_run_lease,
                settings,
                user_id=user_id,
                run_id=run_id,
                lease_owner=lease_owner,
            )
            if not renewed:
                raise RuntimeError("The coding operation execution lease was lost.")

    operation_task = asyncio.create_task(operation)
    lease_task = asyncio.create_task(guard_lease())
    try:
        done, _pending = await asyncio.wait(
            {operation_task, lease_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if lease_task in done:
            operation_task.cancel()
            with suppress(asyncio.CancelledError):
                await operation_task
            await lease_task
        return await operation_task
    finally:
        if not lease_task.done():
            lease_task.cancel()
            with suppress(asyncio.CancelledError):
                await lease_task


async def _execute_runtime_operation_run(
    settings,
    *,
    claim: dict[str, Any],
    task: dict[str, Any],
    request: dict[str, Any],
    lease_owner: str,
) -> None:
    task_id = str(claim["task_id"])
    user_id = str(claim["user_id"])
    run_id = str(claim["id"])
    action = str(request.get("action") or "")
    payload = request.get("payload")
    if not isinstance(payload, dict):
        payload = {}

    await asyncio.to_thread(
        update_coding_task,
        settings,
        user_id=user_id,
        task_id=task_id,
        status="testing" if action == "run_tests" else "running",
    )
    await _store_event(
        settings,
        user_id=user_id,
        task_id=task_id,
        run_id=run_id,
        event_type="operation.started",
        phase=AgentPhase.EXECUTING,
        message=f"Approved {action.replace('_', ' ')} operation started.",
        metadata={"action": action, "approval_id": request.get("approval_id")},
    )

    async def emit(
        event_type: str,
        phase: str,
        message: str,
        metadata: dict[str, Any],
    ) -> None:
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type=event_type,
            phase=_operation_phase(phase),
            message=message,
            metadata=metadata,
        )

    try:
        outcome = await _run_operation_with_lease(
            execute_coding_operation(
                settings,
                user_id=user_id,
                task_id=task_id,
                task=task,
                action=action,
                payload=payload,
                emit=emit,
            ),
            settings=settings,
            user_id=user_id,
            run_id=run_id,
            lease_owner=lease_owner,
        )
        result = jsonable_encoder(outcome["result"])
        await asyncio.to_thread(
            update_coding_task,
            settings,
            user_id=user_id,
            task_id=task_id,
            status=outcome["task_status"],
        )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="operation.completed",
            phase=AgentPhase.COMPLETED,
            message=f"Approved {action.replace('_', ' ')} operation completed.",
            metadata={"action": action, "result": result},
        )
        await asyncio.to_thread(
            update_coding_agent_run,
            settings,
            user_id=user_id,
            run_id=run_id,
            status="completed",
            phase=AgentPhase.COMPLETED.value,
            checkpoint={
                "kind": "runtime_operation",
                "action": action,
                "result": result,
            },
            lease_owner=lease_owner,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        message = str(exc).strip() or "The approved coding operation failed."
        current_run = await asyncio.to_thread(
            get_coding_agent_run,
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
        )
        if current_run and current_run.get("cancel_requested_at"):
            await emit(
                "operation.cancelled",
                "failed",
                f"The approved {action.replace('_', ' ')} operation was cancelled.",
                {"action": action},
            )
            await asyncio.to_thread(
                update_coding_task,
                settings,
                user_id=user_id,
                task_id=task_id,
                status="cancelled",
            )
            await asyncio.to_thread(
                update_coding_agent_run,
                settings,
                user_id=user_id,
                run_id=run_id,
                status="cancelled",
                phase=AgentPhase.CANCELLED.value,
                checkpoint={
                    "kind": "runtime_operation",
                    "action": action,
                    "cancelled": True,
                },
                lease_owner=lease_owner,
            )
            return
        recoverable_patch = action == "apply_patch" and isinstance(exc, ValueError)
        if recoverable_patch:
            await emit(
                "patch_failed",
                "failed",
                "The reviewed patch no longer matches the runtime workspace.",
                {"error": message[:1_000]},
            )
            await emit(
                "agent.recovery.requested",
                "planning",
                "Re-index the changed workspace and generate a fresh patch.",
                {"reason": "patch_context_mismatch"},
            )
        await emit(
            "operation.failed",
            "failed",
            f"The approved {action.replace('_', ' ')} operation failed.",
            {
                "action": action,
                "reason": message[:1_000],
                "recoverable": recoverable_patch,
            },
        )
        await asyncio.to_thread(
            update_coding_task,
            settings,
            user_id=user_id,
            task_id=task_id,
            status="running" if recoverable_patch else "failed",
            error="" if recoverable_patch else message[:4_000],
        )
        await asyncio.to_thread(
            update_coding_agent_run,
            settings,
            user_id=user_id,
            run_id=run_id,
            status="failed",
            phase=AgentPhase.FAILED.value,
            checkpoint={
                "kind": "runtime_operation",
                "action": action,
                "error": message[:4_000],
            },
            error=message[:4_000],
            lease_owner=lease_owner,
        )


async def _execute_claimed_run(
    settings,
    *,
    claim: dict[str, Any],
    lease_owner: str,
) -> None:
    task_id = str(claim["task_id"])
    user_id = str(claim["user_id"])
    run_id = str(claim["id"])
    task = {
        "repository_full_name": claim.get("repository_full_name"),
        "branch": claim.get("branch"),
        "task_type": claim.get("task_type"),
        "goal": claim.get("goal"),
    }
    request = claim.get("request") if isinstance(claim.get("request"), dict) else {}
    if request.get("kind") == "runtime_operation":
        await _execute_runtime_operation_run(
            settings,
            claim=claim,
            task=task,
            request=request,
            lease_owner=lease_owner,
        )
        return
    model = str(claim.get("model") or "")
    effective_goal = str(request.get("prompt") or task.get("goal") or "").strip()
    effective_task_type = str(
        request.get("task_type") or task.get("task_type") or "analyze"
    )
    interaction_mode = str(
        request.get("interaction_mode") or claim.get("interaction_mode") or "ask"
    )
    if interaction_mode not in {"ask", "plan", "build"}:
        interaction_mode = "ask"
    effort_profile = str(
        request.get("effort_profile") or claim.get("effort_profile") or "fast"
    )
    if effort_profile not in {"fast", "balanced", "deep"}:
        effort_profile = "fast"
    goal_spec = request.get("goal_spec") or claim.get("goal_spec") or {
        "objective": effective_goal,
        "acceptanceCriteria": [],
        "constraints": [],
    }
    plan_goal = str(
        goal_spec.get("objective")
        if isinstance(goal_spec, dict)
        else ""
    ).strip() or effective_goal
    active_file = str(request.get("active_file") or "").strip()
    recovery = bool(request.get("recovery"))
    context_items = request.get("context_items")
    if not isinstance(context_items, list):
        context_items = []
    persisted_plan = None
    if interaction_mode in {"plan", "build"}:
        persisted_plan = await asyncio.to_thread(
            get_coding_plan,
            settings,
            user_id=user_id,
            task_id=task_id,
        )

    await asyncio.to_thread(
        update_coding_task,
        settings,
        user_id=user_id,
        task_id=task_id,
        status="running",
    )
    await _store_event(
        settings,
        user_id=user_id,
        task_id=task_id,
        run_id=run_id,
        event_type="agent.run.started",
        phase=AgentPhase.RETRIEVING,
        message="Coding agent started.",
        metadata={
            "model": model,
            "goal": effective_goal,
            "task_type": effective_task_type,
            "interaction_mode": interaction_mode,
            "effort_profile": effort_profile,
            "orchestration_role": "orchestrator",
        },
    )

    try:
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.context.started",
            phase=AgentPhase.RETRIEVING,
            message="Preparing repository intelligence.",
            metadata={},
        )

        token = get_github_access_token(settings, user_id=user_id) or settings.github_token
        index = await prepare_code_index(
            settings,
            task_id=task_id,
            repository=str(task["repository_full_name"]),
            ref=str(task["branch"]),
            github_token=token,
            cache_scope=user_id,
        )
        initial_search = await search_task_code_index(
            settings,
            task_id=task_id,
            query=effective_goal,
            limit=12,
            max_chars=18_000,
        )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.context.completed",
            phase=AgentPhase.PLANNING,
            message=(
                f"Indexed {index.get('files', 0)} files and selected "
                f"{len(initial_search.get('results') or [])} relevant code regions."
            ),
            metadata={
                "index": index,
                "results": [
                    {
                        "path": item.get("path"),
                        "start_line": item.get("start_line"),
                        "end_line": item.get("end_line"),
                        "score": item.get("score"),
                    }
                    for item in (initial_search.get("results") or [])
                ],
            },
        )

        try:
            runtime_ready_for_tools = mode_allows_writes(interaction_mode) and (
                await runtime_status(settings, task_id=task_id)
            ).get("status") == "running"
        except RuntimeError:
            runtime_ready_for_tools = False
        test_command = (
            recommend_test_command(initial_search.get("repository_map") or "")
            if runtime_ready_for_tools and not recovery
            else ""
        )
        plan_source = "generated"
        if (
            interaction_mode == "build"
            and persisted_plan
            and persisted_plan.get("status") == "approved"
        ):
            plan = parse_agent_plan(
                json.dumps(persisted_plan.get("plan") or {}),
                goal=plan_goal,
            )
            used_fallback = False
            plan_source = "approved"
        else:
            plan, used_fallback = await build_agent_plan(
                api_key=settings.openrouter_api_key,
                model=model,
                goal=plan_goal,
                task_type=effective_task_type,
                repository_map=(
                    f"Current user planning instruction:\n{effective_goal}\n\n"
                    f"Existing plan to refine:\n"
                    f"{str((persisted_plan or {}).get('markdown') or '(none)')[:8_000]}\n\n"
                    f"{initial_search.get('repository_map') or ''}\n\n"
                    f"Relevant repository evidence:\n"
                    f"{str(initial_search.get('context') or '')[:8_000]}"
                ),
                test_command=test_command,
            )
        plan_record = persisted_plan
        if interaction_mode in {"plan", "build"}:
            plan_record = await asyncio.to_thread(
                save_coding_plan,
                settings,
                user_id=user_id,
                task_id=task_id,
                plan=plan.public_dict(),
                status="approved" if interaction_mode == "build" else "draft",
            )
        if (
            interaction_mode == "build"
            and runtime_ready_for_tools
            and plan_record
        ):
            await materialize_runtime_plan(
                settings,
                task_id=task_id,
                markdown=str(plan_record.get("markdown") or ""),
            )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.plan.created",
            phase=AgentPhase.PLANNING,
            message=plan.summary,
            metadata={
                "plan": plan.public_dict(),
                "fallback": used_fallback,
                "source": plan_source,
                "artifact_path": (
                    plan_record.get("artifact_path") if plan_record else None
                ),
                "revision": plan_record.get("revision") if plan_record else None,
            },
        )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.plan.ready",
            phase=AgentPhase.PLANNING,
            message=(
                "Plan ready for review."
                if interaction_mode == "plan"
                else "Dependency-aware execution plan is ready."
            ),
            metadata={
                "plan": plan.public_dict(),
                "interaction_mode": interaction_mode,
                "effort_profile": effort_profile,
                "artifact_path": (
                    plan_record.get("artifact_path") if plan_record else None
                ),
            },
        )

        specialist_instructions = {
            "explorer": "Discover architecture, relevant files, symbols, and project instructions.",
            "dependency_analyst": "Map imports, dependencies, callers, and likely impact paths.",
            "reviewer": "Identify regression, security, compatibility, and validation risks.",
        }
        specialist_specs = [
            (role, specialist_instructions[role])
            for role in specialist_roles_for_effort(effort_profile)
        ]

        async def run_specialist(position: int, role: str, instruction: str):
            step_id = f"specialist:{role}"
            step = {
                "id": step_id,
                "position": position,
                "title": role.replace("_", " ").title(),
                "tool": "search_code",
                "reason": instruction,
                "status": "running",
                "attempt": 1,
                "max_attempts": 1,
                "orchestration_role": role,
                "dependencies": ["repository-index"],
            }
            await asyncio.to_thread(
                upsert_coding_agent_step,
                settings,
                user_id=user_id,
                run_id=run_id,
                step=step,
            )
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.specialist.started",
                phase=AgentPhase.EXECUTING,
                message=f"{step['title']} started.",
                metadata={"role": role, "step": step},
            )
            try:
                result = await search_task_code_index(
                    settings,
                    task_id=task_id,
                    query=(
                        f"{effective_goal}\n"
                        f"Approved plan: {plan.summary}\n"
                        f"Specialist focus: {instruction}"
                    ),
                    limit=8 if effort_profile == "balanced" else 12,
                    max_chars=12_000 if effort_profile == "balanced" else 18_000,
                )
                completed_step = {**step, "status": "completed"}
                metadata = {
                    "role": role,
                    "matches": len(result.get("results") or []),
                    "files": list(
                        dict.fromkeys(
                            str(item.get("path") or "")
                            for item in (result.get("results") or [])
                            if item.get("path")
                        )
                    )[:20],
                }
                await asyncio.to_thread(
                    upsert_coding_agent_step,
                    settings,
                    user_id=user_id,
                    run_id=run_id,
                    step=completed_step,
                    result=metadata,
                )
                await _store_event(
                    settings,
                    user_id=user_id,
                    task_id=task_id,
                    run_id=run_id,
                    event_type="agent.specialist.completed",
                    phase=AgentPhase.EXECUTING,
                    message=f"{step['title']} completed.",
                    metadata={"role": role, "step": completed_step, "result": metadata},
                )
                return ContextCandidate(
                    kind=f"specialist_{role}",
                    label=step["title"],
                    content=str(result.get("context") or ""),
                    priority=84 - position,
                )
            except Exception as exc:
                failed_step = {**step, "status": "failed"}
                message = str(exc).strip() or f"{step['title']} failed."
                await asyncio.to_thread(
                    upsert_coding_agent_step,
                    settings,
                    user_id=user_id,
                    run_id=run_id,
                    step=failed_step,
                    error=message,
                )
                await _store_event(
                    settings,
                    user_id=user_id,
                    task_id=task_id,
                    run_id=run_id,
                    event_type="agent.specialist.failed",
                    phase=AgentPhase.EXECUTING,
                    message=f"{step['title']} failed and was excluded from consolidation.",
                    metadata={"role": role, "step": failed_step, "reason": message},
                )
                return None

        specialist_candidates = [
            item
            for item in await asyncio.gather(
                *(
                    run_specialist(position + 1, role, instruction)
                    for position, (role, instruction) in enumerate(specialist_specs)
                )
            )
            if item is not None
        ]

        if interaction_mode == "plan":
            answer = (
                "I mapped the repository and prepared an editable implementation plan. "
                "Review the scope, affected files, risks, and done criteria below, then "
                "choose Start build when it matches your intent."
            )
            await asyncio.to_thread(
                append_coding_agent_message,
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                role="assistant",
                content=answer,
            )
            await asyncio.to_thread(
                update_coding_task,
                settings,
                user_id=user_id,
                task_id=task_id,
                status="completed",
                result=answer,
            )
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.review.ready",
                phase=AgentPhase.REVIEWING,
                message="The implementation plan is ready for review.",
                metadata={
                    "interaction_mode": "plan",
                    "effort_profile": effort_profile,
                    "specialists": [role for role, _ in specialist_specs],
                    "approval_required": False,
                    "artifact_path": (
                        plan_record.get("artifact_path") if plan_record else None
                    ),
                },
            )
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.run.completed",
                phase=AgentPhase.COMPLETED,
                message="Plan mode completed without changing source files.",
                metadata={
                    "plan_only": True,
                    "patch_proposed": False,
                    "approval_required": False,
                },
            )
            await asyncio.to_thread(
                update_coding_agent_run,
                settings,
                user_id=user_id,
                run_id=run_id,
                status="completed",
                phase=AgentPhase.COMPLETED.value,
                checkpoint={
                    "event_type": "agent.run.completed",
                    "plan": plan.public_dict(),
                    "artifact_path": (
                        plan_record.get("artifact_path") if plan_record else None
                    ),
                },
                lease_owner=lease_owner,
            )
            return

        async def search_handler(arguments: dict[str, Any]) -> ToolResult:
            result = await search_task_code_index(
                settings,
                task_id=task_id,
                query=str(arguments.get("query") or effective_goal),
                limit=12,
                max_chars=18_000,
            )
            return ToolResult(
                step_id="",
                tool=AgentTool.SEARCH_CODE,
                content=str(result.get("context") or ""),
                metadata={
                    "query": result.get("query"),
                    "matches": len(result.get("results") or []),
                    "files": list(
                        dict.fromkeys(
                            str(item.get("path") or "")
                            for item in (result.get("results") or [])
                            if item.get("path")
                        )
                    )[:20],
                },
            )

        async def changes_handler(_arguments: dict[str, Any]) -> ToolResult:
            try:
                status = await runtime_status(settings, task_id=task_id)
                if status.get("status") != "running":
                    return ToolResult(
                        step_id="",
                        tool=AgentTool.INSPECT_CHANGES,
                        content="No isolated runtime is running; there is no working-copy diff.",
                        metadata={"runtime": status.get("status"), "files": 0},
                    )
                changes = await runtime_changes(settings, task_id=task_id)
            except RuntimeError as exc:
                if str(exc) in {
                    "coding_runtime_disabled",
                    "coding_runtime_not_running",
                }:
                    return ToolResult(
                        step_id="",
                        tool=AgentTool.INSPECT_CHANGES,
                        content="No isolated runtime is available; there is no working-copy diff.",
                        metadata={"runtime": "unavailable", "files": 0},
                    )
                raise
            return ToolResult(
                step_id="",
                tool=AgentTool.INSPECT_CHANGES,
                content=(
                    f"Working tree status:\n{changes.get('status') or 'clean'}\n\n"
                    f"Current diff:\n{str(changes.get('diff') or '')[:16_000]}"
                ),
                metadata={
                    "runtime": "running",
                    "files": len(changes.get("files") or []),
                    "paths": (changes.get("files") or [])[:50],
                },
            )

        async def request_tests_handler(arguments: dict[str, Any]) -> ToolResult:
            payload = _normalized_approval_payload(
                "run_tests",
                {
                    "command": arguments.get("command"),
                    "timeout_seconds": arguments.get("timeout_seconds", 120),
                },
            )
            if not runtime_ready_for_tools or payload["command"] != test_command:
                raise RuntimeError("approved_test_runtime_unavailable")
            return ToolResult(
                step_id="",
                tool=AgentTool.REQUEST_TESTS,
                content=(
                    f"Test command `{payload['command']}` is awaiting explicit "
                    "user approval and has not run yet."
                ),
                metadata={
                    "approval_request": {
                        "action": "run_tests",
                        "title": "Run repository tests",
                        "description": (
                            "Execute the detected test suite inside the isolated workspace."
                        ),
                        "payload": payload,
                    },
                    "command": payload["command"],
                    "status": "approval_planned",
                },
            )

        progress_queue: asyncio.Queue[tuple[str, AgentPhase, str, dict[str, Any]]] = asyncio.Queue()

        def queue_progress(
            event_type: str,
            phase: AgentPhase,
            message: str,
            metadata: dict[str, Any],
        ) -> None:
            progress_queue.put_nowait((event_type, phase, message, metadata))

        execution = asyncio.create_task(
            execute_agent_plan(
                plan,
                handlers={
                    AgentTool.SEARCH_CODE: search_handler,
                    AgentTool.INSPECT_CHANGES: changes_handler,
                    AgentTool.REQUEST_TESTS: request_tests_handler,
                },
                on_event=queue_progress,
            )
        )
        last_cancel_check = 0.0
        last_lease_renewal = time.monotonic()
        terminal_status = ""
        try:
            while not execution.done() or not progress_queue.empty():
                now = time.monotonic()
                if now - last_cancel_check >= 1:
                    current_run = await asyncio.to_thread(
                        get_coding_agent_run,
                        settings,
                        user_id=user_id,
                        task_id=task_id,
                        run_id=run_id,
                    )
                    last_cancel_check = now
                    if current_run and current_run.get("cancel_requested_at"):
                        cancelled_payload = await _store_event(
                            settings,
                            user_id=user_id,
                            task_id=task_id,
                            run_id=run_id,
                            event_type="agent.run.cancelled",
                            phase=AgentPhase.CANCELLED,
                            message="Coding agent run was cancelled.",
                            metadata={},
                            persist_output=False,
                            persist_checkpoint=False,
                        )
                        cancelled_output = await asyncio.to_thread(
                            append_coding_agent_output,
                            settings,
                            user_id=user_id,
                            run_id=run_id,
                            event_id=str(cancelled_payload["id"]),
                            event_type="agent.run.cancelled",
                            payload=cancelled_payload,
                        )
                        await asyncio.to_thread(
                            append_coding_agent_checkpoint,
                            settings,
                            user_id=user_id,
                            run_id=run_id,
                            output_sequence=int(cancelled_output["sequence"]),
                            phase=AgentPhase.CANCELLED.value,
                            checkpoint_type="agent.run.cancelled",
                            state={
                                "event_id": cancelled_payload["id"],
                                "sequence": cancelled_output["sequence"],
                            },
                        )
                        await asyncio.to_thread(
                            update_coding_agent_run,
                            settings,
                            user_id=user_id,
                            run_id=run_id,
                            status="cancelled",
                            phase=AgentPhase.CANCELLED.value,
                            checkpoint={
                                "event_id": cancelled_payload["id"],
                                "event_type": "agent.run.cancelled",
                                "sequence": cancelled_output["sequence"],
                            },
                            lease_owner=lease_owner,
                        )
                        await asyncio.to_thread(
                            update_coding_task,
                            settings,
                            user_id=user_id,
                            task_id=task_id,
                            status="cancelled",
                            error="The coding agent run was cancelled.",
                        )
                        terminal_status = "cancelled"
                        execution.cancel()
                        with suppress(asyncio.CancelledError):
                            await execution
                        break

                try:
                    event_type, phase, message, metadata = await asyncio.wait_for(
                        progress_queue.get(),
                        timeout=0.1,
                    )
                except TimeoutError:
                    if now - last_lease_renewal >= 10:
                        renewed = await asyncio.to_thread(
                            renew_coding_agent_run_lease,
                            settings,
                            user_id=user_id,
                            run_id=run_id,
                            lease_owner=lease_owner,
                        )
                        if not renewed:
                            raise RuntimeError(
                                "The coding agent execution lease was lost."
                            )
                        last_lease_renewal = now
                    continue

                payload = await _store_event(
                    settings,
                    user_id=user_id,
                    task_id=task_id,
                    run_id=run_id,
                    event_type=event_type,
                    phase=phase,
                    message=message,
                    metadata=metadata,
                    persist_task_event=event_type != "agent.message.delta",
                    persist_output=False,
                    persist_checkpoint=False,
                )
                output = await asyncio.to_thread(
                    append_coding_agent_output,
                    settings,
                    user_id=user_id,
                    run_id=run_id,
                    event_id=str(payload["id"]),
                    event_type=event_type,
                    payload=payload,
                )
                if event_type != "agent.message.delta":
                    step = metadata.get("step") if isinstance(metadata, dict) else None
                    if isinstance(step, dict) and step.get("id"):
                        await asyncio.to_thread(
                            upsert_coding_agent_step,
                            settings,
                            user_id=user_id,
                            run_id=run_id,
                            step=step,
                            result=(
                                metadata.get("result")
                                if isinstance(metadata.get("result"), dict)
                                else None
                            ),
                            error=str(metadata.get("reason") or ""),
                        )
                    await asyncio.to_thread(
                        append_coding_agent_checkpoint,
                        settings,
                        user_id=user_id,
                        run_id=run_id,
                        output_sequence=int(output["sequence"]),
                        phase=phase.value,
                        checkpoint_type=event_type,
                        state={
                            "event_id": payload["id"],
                            "sequence": output["sequence"],
                            "message": message[:500],
                        },
                    )
                    if event_type == "agent.run.error":
                        terminal_status = "failed"

                if now - last_lease_renewal >= 10 and terminal_status != "failed":
                    renewed = await asyncio.to_thread(
                        renew_coding_agent_run_lease,
                        settings,
                        user_id=user_id,
                        run_id=run_id,
                        lease_owner=lease_owner,
                    )
                    if not renewed:
                        raise RuntimeError("The coding agent execution lease was lost.")
                    last_lease_renewal = now

            tool_results = await execution
        finally:
            if not execution.done():
                execution.cancel()
            with suppress(asyncio.CancelledError):
                await execution

        pending_tool_request = next(
            (
                result.metadata.get("approval_request")
                for result in tool_results
                if result.metadata.get("approval_request")
            ),
            None,
        )

        candidates = [
            ContextCandidate(
                kind="user_goal",
                label="Current task",
                content=effective_goal,
                priority=100,
                required=True,
            ),
            ContextCandidate(
                kind="repository_map",
                label=str(task["repository_full_name"]),
                content=initial_search.get("repository_map") or "",
                priority=90,
                required=True,
            ),
            ContextCandidate(
                kind="repository_evidence",
                label="Initial retrieval",
                content=initial_search.get("context") or "",
                priority=85,
            ),
        ]
        if plan_record and plan_record.get("markdown"):
            candidates.insert(
                1,
                ContextCandidate(
                    kind="approved_plan",
                    label=str(
                        plan_record.get("artifact_path")
                        or "plans-goals/task.md"
                    ),
                    content=str(plan_record["markdown"]),
                    priority=110,
                    required=True,
                ),
            )
        candidates.extend(specialist_candidates)
        previous_runs = await asyncio.to_thread(
            list_coding_agent_runs,
            settings,
            user_id=user_id,
            task_id=task_id,
        )
        stored_messages = await asyncio.to_thread(
            list_coding_agent_messages,
            settings,
            user_id=user_id,
            task_id=task_id,
        )
        previous_outputs = (
            []
            if stored_messages
            else await asyncio.to_thread(
                list_coding_agent_task_outputs,
                settings,
                user_id=user_id,
                task_id=task_id,
            )
        )
        previous_messages = [
            message
            for message in (
                stored_messages
                or _agent_history_messages(
                    {"goal": task["goal"]},
                    previous_runs,
                    previous_outputs,
                )
            )
            if message.get("run_id") != run_id
        ][-12:]
        if previous_messages:
            candidates.append(
                ContextCandidate(
                    kind="conversation_history",
                    label="Previous agent conversation",
                    content="\n\n".join(
                        f"{message['role'].upper()}: {message['content']}"
                        for message in previous_messages
                    )[:20_000],
                    priority=96,
                    required=True,
                )
            )

        diagnostic_events = [
            event
            for event in (task.get("events") or [])
            if event.get("event_type")
            in {
                "tests_completed",
                "command_completed",
                "patch_applied",
                "agent.recovery.requested",
            }
        ][-10:]
        if diagnostic_events:
            candidates.append(
                ContextCandidate(
                    kind="execution_diagnostics",
                    label="Recent runtime evidence",
                    content="\n\n".join(
                        (
                            f"{event.get('event_type')} "
                            f"[{event.get('phase')}]: {event.get('message')}\n"
                            f"{json.dumps(event.get('metadata') or {}, ensure_ascii=False)}"
                        )[:14_000]
                        for event in diagnostic_events
                    )[:24_000],
                    priority=95,
                    required=True,
                )
            )
        for position, result in enumerate(tool_results):
            candidates.append(
                ContextCandidate(
                    kind="tool_result",
                    label=f"{result.tool.value}:{position + 1}",
                    content=result.content,
                    priority=80 - position,
                )
            )
        if active_file:
            candidates.append(
                ContextCandidate(
                    kind="active_file",
                    label="Active editor file",
                    content=active_file,
                    priority=88,
                )
            )
        for context_item in context_items:
            if not isinstance(context_item, dict):
                continue
            candidates.append(
                ContextCandidate(
                    kind="kontext_graph",
                    label=f"{context_item.get('kind')}: {context_item.get('label')}",
                    content=(
                        str(context_item.get("content") or "")
                        or f"Connected {context_item.get('kind')}: {context_item.get('label')}"
                    ),
                    priority=55 + min(int(float(context_item.get("score") or 0.0) * 10), 20),
                )
            )
        compiled = compile_priority_context(candidates, max_chars=30_000)
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.context.compiled",
            phase=AgentPhase.REVIEWING,
            message=(
                f"Compiled {len(compiled.included)} context sources into "
                f"{compiled.characters:,} characters."
            ),
            metadata={
                "included": compiled.included,
                "dropped": compiled.dropped,
                "characters": compiled.characters,
                "budget": compiled.budget,
            },
        )

        answer_parts: list[str] = []
        messages = synthesis_messages(
            task_type=effective_task_type,
            goal=effective_goal,
            repository=str(task["repository_full_name"]),
            branch=str(task["branch"]),
            compiled_context=compiled,
            interaction_mode=interaction_mode,
            goal_spec=goal_spec if isinstance(goal_spec, dict) else None,
        )
        usage: dict[str, int] = {}
        writer_step = {
            "id": "writer",
            "position": 100,
            "title": "Isolated writer",
            "tool": "synthesis",
            "reason": "Create the single consolidated implementation proposal.",
            "status": "running",
            "attempt": 1,
            "max_attempts": 1,
            "orchestration_role": "writer",
            "dependencies": [f"specialist:{role}" for role, _ in specialist_specs],
        }
        if interaction_mode == "build":
            await asyncio.to_thread(
                upsert_coding_agent_step,
                settings,
                user_id=user_id,
                run_id=run_id,
                step=writer_step,
            )
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.build.started",
                phase=AgentPhase.EXECUTING,
                message="The isolated writer is preparing one consolidated change set.",
                metadata={"step": writer_step, "role": "writer"},
            )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.synthesis.started",
            phase=AgentPhase.REVIEWING,
            message="Generating a repository-grounded result.",
            metadata={
                "model": model,
                "context_characters": compiled.characters,
                "context_sources": len(compiled.included),
            },
        )
        async for content in stream_agent_synthesis(
            api_key=settings.openrouter_api_key,
            model=model,
            messages=messages,
            max_tokens=min(settings.openrouter_max_tokens, 4_096),
            on_usage=usage.update,
        ):
            answer_parts.append(content)
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.message.delta",
                phase=AgentPhase.REVIEWING,
                message="",
                metadata={"content": content},
                persist_task_event=False,
            )

        answer = "".join(answer_parts).strip()
        if not answer:
            raise RuntimeError("The coding model returned an empty response.")
        patch = extract_unified_patch(answer) if mode_allows_writes(interaction_mode) else ""
        if mode_allows_writes(interaction_mode):
            completed_writer = {**writer_step, "status": "completed"}
            await asyncio.to_thread(
                upsert_coding_agent_step,
                settings,
                user_id=user_id,
                run_id=run_id,
                step=completed_writer,
                result={"patch_proposed": bool(patch), "answer_characters": len(answer)},
            )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.synthesis.completed",
            phase=AgentPhase.REVIEWING,
            message="Repository-grounded result generated.",
            metadata={
                "answer_characters": len(answer),
                "patch_proposed": bool(patch),
                "usage": usage,
            },
        )
        await asyncio.to_thread(
            append_coding_agent_message,
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            role="assistant",
            content=answer,
        )

        patch_approval_required = bool(
            patch and runtime_ready_for_tools and not pending_tool_request
        )
        approval_required = bool(pending_tool_request or patch_approval_required)
        if patch_approval_required:
            payload = _normalized_approval_payload("apply_patch", {"patch": patch})
            approval = create_coding_approval(
                settings,
                user_id=user_id,
                task_id=task_id,
                action="apply_patch",
                title="Apply the proposed patch",
                description=(
                    "Review this unified diff before it is applied to the isolated workspace."
                ),
                payload=payload,
                payload_hash=_approval_payload_hash("apply_patch", payload),
            )
            await asyncio.to_thread(
                update_coding_task,
                settings,
                user_id=user_id,
                task_id=task_id,
                status="waiting_approval",
                result=answer,
            )
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.approval.required",
                phase=AgentPhase.WAITING_APPROVAL,
                message="The proposed patch is waiting for your approval.",
                metadata={"approval": approval},
            )
        elif isinstance(pending_tool_request, dict):
            pending_payload = dict(pending_tool_request.get("payload") or {})
            pending_action = str(pending_tool_request.get("action") or "run_tests")
            pending_tool_approval = create_coding_approval(
                settings,
                user_id=user_id,
                task_id=task_id,
                action=pending_action,
                title=str(pending_tool_request.get("title") or "Review coding action"),
                description=str(pending_tool_request.get("description") or ""),
                payload=pending_payload,
                payload_hash=_approval_payload_hash(pending_action, pending_payload),
            )
            await asyncio.to_thread(
                update_coding_task,
                settings,
                user_id=user_id,
                task_id=task_id,
                status="waiting_approval",
                result=answer,
            )
            await _store_event(
                settings,
                user_id=user_id,
                task_id=task_id,
                run_id=run_id,
                event_type="agent.approval.required",
                phase=AgentPhase.WAITING_APPROVAL,
                message=str(pending_tool_approval.get("title") or "A coding action is waiting for approval."),
                metadata={"approval": pending_tool_approval},
            )
            if patch:
                await _store_event(
                    settings,
                    user_id=user_id,
                    task_id=task_id,
                    run_id=run_id,
                    event_type="agent.patch.proposed",
                    phase=AgentPhase.WAITING_APPROVAL,
                    message=(
                        "A patch is ready, but the current approved tool request must be resolved first."
                    ),
                    metadata={"patch_characters": len(patch)},
                )
        else:
            await asyncio.to_thread(
                update_coding_task,
                settings,
                user_id=user_id,
                task_id=task_id,
                status="completed",
                result=answer,
            )
            if patch:
                await _store_event(
                    settings,
                    user_id=user_id,
                    task_id=task_id,
                    run_id=run_id,
                    event_type="agent.patch.proposed",
                    phase=AgentPhase.COMPLETED,
                    message=(
                        "A patch is ready for review. Start the isolated runtime before requesting approval to apply it."
                    ),
                    metadata={"patch_characters": len(patch)},
                )

        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.review.ready",
            phase=AgentPhase.WAITING_APPROVAL if approval_required else AgentPhase.REVIEWING,
            message=(
                "Changes are ready for approval and validation."
                if approval_required
                else "The agent result is ready for review."
            ),
            metadata={
                "interaction_mode": interaction_mode,
                "effort_profile": effort_profile,
                "specialists": [role for role, _ in specialist_specs],
                "approval_required": approval_required,
            },
        )

        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.run.completed",
            phase=AgentPhase.WAITING_APPROVAL if approval_required else AgentPhase.COMPLETED,
            message=(
                "Review the proposed patch."
                if patch_approval_required
                else "Review the requested test run."
                if pending_tool_request
                else "Coding agent response is ready."
            ),
            metadata={
                "answer_characters": len(answer),
                "patch_proposed": bool(patch),
                "approval_required": approval_required,
            },
        )
        await asyncio.to_thread(
            update_coding_agent_run,
            settings,
            user_id=user_id,
            run_id=run_id,
            status="waiting_approval" if approval_required else "completed",
            phase=(
                AgentPhase.WAITING_APPROVAL.value
                if approval_required
                else AgentPhase.COMPLETED.value
            ),
            checkpoint={
                "event_type": "agent.run.completed",
                "message": answer[:500],
            },
            lease_owner=lease_owner,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        reason = str(exc).strip()
        message = user_facing_coding_error(reason)
        await asyncio.to_thread(
            update_coding_task,
            settings,
            user_id=user_id,
            task_id=task_id,
            status="failed",
            error=message[:4_000],
        )
        await _store_event(
            settings,
            user_id=user_id,
            task_id=task_id,
            run_id=run_id,
            event_type="agent.run.error",
            phase=AgentPhase.FAILED,
            message="The coding agent could not complete this run.",
            metadata={"reason": reason[:1_000], "display_message": message[:1_000]},
        )
        await asyncio.to_thread(
            update_coding_agent_run,
            settings,
            user_id=user_id,
            run_id=run_id,
            status="failed",
            phase=AgentPhase.FAILED.value,
            checkpoint={"event_type": "agent.run.error"},
            error=message[:4_000],
            lease_owner=lease_owner,
        )
        raise


async def run_worker(*, poll_interval: float = 1.0, lease_seconds: int = 30) -> None:
    settings = get_settings()
    if not postgres_enabled(settings):
        raise RuntimeError("Coding task storage is unavailable.")
    worker_id = f"{socket.gethostname()}:{os.getpid()}:{secrets.token_hex(6)}"
    await asyncio.to_thread(ensure_coding_task_schema, settings)

    async def heartbeat(
        status: str,
        run_id: str | None = None,
        phase: str = "idle",
        task_id: str | None = None,
    ):
        await asyncio.to_thread(
            upsert_coding_worker_heartbeat,
            settings,
            worker_id=worker_id,
            hostname=socket.gethostname(),
            process_id=os.getpid(),
            status=status,
            current_task_id=task_id,
            current_run_id=run_id,
            phase=phase,
        )

    async def heartbeat_loop(
        run_id: str | None = None,
        phase: str = "idle",
        task_id: str | None = None,
    ):
        while True:
            await heartbeat(
                "running" if run_id else "idle",
                run_id,
                phase,
                task_id,
            )
            await asyncio.sleep(5)

    await heartbeat("idle")
    while True:
        await heartbeat("idle")
        claim = await asyncio.to_thread(
            claim_next_coding_agent_run,
            settings,
            lease_owner=worker_id,
            lease_seconds=lease_seconds,
        )
        if claim is None:
            await asyncio.sleep(poll_interval)
            continue
        run_id = str(claim["id"])
        heartbeat_task = asyncio.create_task(
            heartbeat_loop(
                run_id,
                str(claim.get("phase") or "retrieving"),
                str(claim.get("task_id") or "") or None,
            )
        )
        try:
            await _execute_claimed_run(settings, claim=claim, lease_owner=worker_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Coding agent run %s failed; worker will continue.", run_id)
        finally:
            heartbeat_task.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat_task
            await heartbeat("idle")


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
