"""Shared backend validation helpers."""

from __future__ import annotations

import re

WORKSPACE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def validate_workspace_name(value: str | None) -> str:
    if value is None:
        raise ValueError("Workspace name is required.")

    trimmed = value.strip()
    if not trimmed:
        raise ValueError("Workspace name is required.")
    if len(trimmed) < 3:
        raise ValueError("Workspace name must be at least 3 characters.")
    if len(trimmed) > 80:
        raise ValueError("Workspace name must be 80 characters or fewer.")
    if not WORKSPACE_NAME_PATTERN.fullmatch(trimmed):
        raise ValueError("Use letters, numbers, hyphens, or underscores only.")
    return trimmed
