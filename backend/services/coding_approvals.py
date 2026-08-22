"""Validation and binding helpers for approved coding operations."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

CodingApprovalAction = Literal[
    "run_command",
    "apply_patch",
    "run_tests",
    "create_commit",
    "create_pull_request",
    "start_preview",
]


def coding_approval_payload_hash(
    action: str,
    payload: dict[str, Any],
) -> str:
    canonical = json.dumps(
        {"action": action, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    if len(canonical.encode("utf-8")) > 250_000:
        raise ValueError("The approval payload is too large.")
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalize_coding_approval_payload(
    action: CodingApprovalAction,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if action == "run_command":
        command = str(payload.get("command") or "").strip()
        timeout_seconds = _bounded_integer(
            payload.get("timeout_seconds") or 60,
            minimum=1,
            maximum=120,
            message="The command timeout is invalid.",
        )
        _validate_command(command)
        return {"command": command, "timeout_seconds": timeout_seconds}
    if action == "apply_patch":
        patch = str(payload.get("patch") or "")
        if not patch or len(patch.encode("utf-8")) > 200_000 or "\x00" in patch:
            raise ValueError("A valid unified patch is required.")
        return {"patch": patch}
    if action == "run_tests":
        command = str(payload.get("command") or "").strip()
        timeout_seconds = _bounded_integer(
            payload.get("timeout_seconds") or 120,
            minimum=1,
            maximum=120,
            message="The test timeout is invalid.",
        )
        if not command or len(command) > 2_000 or "\x00" in command:
            raise ValueError("A valid test command is required.")
        return {"command": command, "timeout_seconds": timeout_seconds}
    if action == "create_commit":
        message = str(payload.get("message") or "").strip()
        if not message or len(message) > 200 or "\x00" in message:
            raise ValueError("A valid commit message is required.")
        return {"message": message}
    if action == "create_pull_request":
        title = str(payload.get("title") or "").strip()
        body = str(payload.get("body") or "")
        base = str(payload.get("base") or "").strip()
        branch = str(payload.get("branch") or "").strip()
        if not title or len(title) > 256:
            raise ValueError("A valid pull request title is required.")
        if len(body) > 10_000:
            raise ValueError("The pull request description is too large.")
        if not base or len(base) > 200 or not branch or len(branch) > 200:
            raise ValueError("Valid base and head branches are required.")
        return {
            "title": title,
            "body": body,
            "base": base,
            "branch": branch,
        }
    if action == "start_preview":
        command = str(payload.get("command") or "").strip()
        port = _bounded_integer(
            payload.get("port") or 3000,
            minimum=1024,
            maximum=65_535,
            message="The preview port is invalid.",
        )
        _validate_command(command)
        return {"command": command, "port": port}
    raise ValueError("Unsupported coding approval action.")


def _validate_command(command: str) -> None:
    if not command or len(command) > 2_000 or "\x00" in command:
        raise ValueError("A valid command is required.")


def _bounded_integer(
    value: Any,
    *,
    minimum: int,
    maximum: int,
    message: str,
) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError(message) from None
    if parsed < minimum or parsed > maximum:
        raise ValueError(message)
    return parsed
