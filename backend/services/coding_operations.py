"""Worker-owned execution for approved coding runtime operations."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Awaitable, Callable
from typing import Any, TypedDict

from services.coding_approvals import coding_approval_payload_hash
from services.coding_runtime import (
    apply_runtime_patch,
    create_runtime_commit,
    detect_runtime_validation_command,
    execute_runtime_command,
    export_runtime_commit,
    parse_runtime_diagnostics,
    start_runtime_preview,
)
from services.connector_store import get_github_access_token
from services.github_publisher import publish_pull_request
from services.postgres_store import create_coding_approval, create_coding_preview

OperationEmitter = Callable[
    [str, str, str, dict[str, Any]],
    Awaitable[None],
]


class CodingOperationResult(TypedDict):
    result: dict[str, Any]
    task_status: str
    phase: str


async def execute_coding_operation(
    settings,
    *,
    user_id: str,
    task_id: str,
    task: dict[str, Any],
    action: str,
    payload: dict[str, Any],
    emit: OperationEmitter,
) -> CodingOperationResult:
    if action == "apply_patch":
        await emit(
            "operation.patch.started",
            "executing",
            "Applying the reviewed patch in the isolated workspace.",
            {},
        )
        result = await apply_runtime_patch(
            settings,
            task_id=task_id,
            patch=str(payload["patch"]),
        )
        if result.get("recovered_from_drift"):
            await emit(
                "patch_rebased",
                "executing",
                "Patch context drifted, so the worker rebased it against the current workspace before writing.",
                {
                    "applied_mode": result.get("applied_mode", "workspace_rebase"),
                    "files": result.get("files", []),
                },
            )
        await emit(
            "patch_applied",
            "executing",
            f"Applied a reviewed patch affecting {len(result['files'])} files.",
            {
                "files": result["files"],
                "applied_mode": result.get("applied_mode", "git_apply"),
            },
        )
        next_approval = _create_validation_approval(
            settings,
            user_id=user_id,
            task_id=task_id,
        )
        if next_approval:
            result = {**result, "next_approval": next_approval}
            await emit(
                "approval_requested",
                "waiting_approval",
                "Validate the applied changes",
                {
                    "approval_id": next_approval["id"],
                    "action": "run_tests",
                    "command": next_approval["payload"]["command"],
                },
            )
            return {
                "result": result,
                "task_status": "waiting_approval",
                "phase": "waiting_approval",
            }
        await emit(
            "validation_unavailable",
            "completed",
            "No conventional repository validation command was detected.",
            {},
        )
        return {
            "result": {**result, "next_approval": None},
            "task_status": "completed",
            "phase": "completed",
        }

    if action in {"run_command", "run_tests"}:
        is_test = action == "run_tests"
        event_prefix = "tests" if is_test else "command"
        phase = "testing" if is_test else "executing"
        command = str(payload["command"])
        if is_test:
            await emit(
                "validation_started",
                "testing",
                "Repository validation started.",
                {"command": command},
            )
        await emit(
            f"{event_prefix}_started",
            phase,
            command,
            {"command": command},
        )
        result = await execute_runtime_command(
            settings,
            task_id=task_id,
            command=command,
            timeout_seconds=int(payload["timeout_seconds"]),
        )
        diagnostics = parse_runtime_diagnostics(
            settings,
            task_id=task_id,
            stdout=str(result.get("stdout") or ""),
            stderr=str(result.get("stderr") or ""),
        )
        result = {**result, "diagnostics": diagnostics}
        await emit(
            f"{event_prefix}_completed",
            phase,
            command,
            {
                "command": command,
                "exit_code": result["exit_code"],
                "stdout": str(result.get("stdout") or "")[-12_000:],
                "stderr": str(result.get("stderr") or "")[-12_000:],
                "diagnostics": diagnostics,
                "diagnostics_count": len(diagnostics),
            },
        )
        if is_test:
            await emit(
                "validation_completed",
                "testing" if result["exit_code"] else "review",
                (
                    "Repository validation passed."
                    if result["exit_code"] == 0
                    else "Repository validation failed."
                ),
                {
                    "command": command,
                    "exit_code": result["exit_code"],
                    "diagnostics_count": len(diagnostics),
                },
            )
        if is_test and result["exit_code"] != 0:
            await emit(
                "agent.recovery.requested",
                "planning",
                "Tests failed. Re-plan from the diagnostics and current diff.",
                {"exit_code": result["exit_code"]},
            )
            return {
                "result": result,
                "task_status": "running",
                "phase": "completed",
            }
        return {
            "result": result,
            "task_status": "completed" if is_test else "running",
            "phase": "completed",
        }

    if action == "create_commit":
        result = await create_runtime_commit(
            settings,
            task_id=task_id,
            message=str(payload["message"]),
        )
        await emit(
            "commit_created",
            "review",
            str(payload["message"]),
            {"sha": result["sha"]},
        )
        return {"result": result, "task_status": "completed", "phase": "completed"}

    if action == "create_pull_request":
        commit = await export_runtime_commit(settings, task_id=task_id)
        token = (
            get_github_access_token(settings, user_id=user_id)
            or settings.github_token
        )
        result = await publish_pull_request(
            token=token,
            repository=str(task["repository_full_name"]),
            base=str(payload["base"]),
            branch=str(payload["branch"]),
            title=str(payload["title"]),
            body=str(payload["body"]),
            commit=commit,
        )
        await emit(
            "pull_request_created",
            "completed",
            str(result["title"]),
            {
                "url": result["url"],
                "number": result["number"],
                "branch": result["branch"],
            },
        )
        return {"result": result, "task_status": "completed", "phase": "completed"}

    if action == "start_preview":
        runtime_preview = await start_runtime_preview(
            settings,
            task_id=task_id,
            command=str(payload["command"]),
            port=int(payload["port"]),
        )
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        preview = create_coding_preview(
            settings,
            user_id=user_id,
            task_id=task_id,
            token_hash=token_hash,
            port=int(payload["port"]),
            command=str(payload["command"]),
        )
        result = {
            **preview,
            **runtime_preview,
            "path": f"/api/coding/previews/{token}/",
        }
        await emit(
            "preview_started",
            "review",
            f"Private preview started on port {payload['port']}.",
            {"preview_id": preview["id"], "port": payload["port"]},
        )
        return {"result": result, "task_status": "completed", "phase": "completed"}

    raise ValueError(f"Unsupported coding operation: {action}")


def _create_validation_approval(
    settings,
    *,
    user_id: str,
    task_id: str,
) -> dict[str, Any] | None:
    command = detect_runtime_validation_command(settings, task_id=task_id)
    if not command:
        return None
    payload = {"command": command, "timeout_seconds": 120}
    return create_coding_approval(
        settings,
        user_id=user_id,
        task_id=task_id,
        action="run_tests",
        title="Validate the applied changes",
        description=(
            "Run the detected repository validation command against the reviewed "
            "working tree."
        ),
        payload=payload,
        payload_hash=coding_approval_payload_hash("run_tests", payload),
    )
