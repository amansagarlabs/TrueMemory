"""Disabled-by-default Docker runtime for isolated coding tasks."""

from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shlex
import shutil
import stat
import tarfile
import time
from typing import Any
from urllib.parse import quote
from uuid import UUID
import zipfile

import httpx

from services.code_index import (
    build_code_index,
    load_code_index,
    save_code_index,
    search_code_index,
)

_GITHUB_API = "https://api.github.com"
_MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
_MAX_SNAPSHOT_UPLOAD_BYTES = 50 * 1024 * 1024
_MAX_ARCHIVE_FILES = 20_000
_MAX_COMMAND_OUTPUT = 200_000
_MAX_PUBLISH_FILE_BYTES = 1_000_000
_MAX_PUBLISH_TOTAL_BYTES = 5_000_000
_MAX_PREVIEW_RESPONSE_BYTES = 10_000_000
_MAX_WORKSPACE_SYNC_FILES = 500
_MAX_WORKSPACE_SYNC_FILE_BYTES = 2_000_000
_MAX_WORKSPACE_SYNC_TOTAL_BYTES = 20_000_000


@dataclass(frozen=True)
class RuntimeResult:
    exit_code: int
    stdout: str
    stderr: str


@dataclass(frozen=True)
class BinaryRuntimeResult:
    exit_code: int
    stdout: bytes
    stderr: bytes


@dataclass(frozen=True)
class _UnifiedPatchHunk:
    old_start: int
    lines: list[str]


@dataclass(frozen=True)
class _UnifiedPatchFile:
    path: str
    old_path: str
    new_path: str
    hunks: list[_UnifiedPatchHunk]


def _container_name(task_id: str) -> str:
    return f"kontext-task-{UUID(task_id).hex}"


def _workspace_path(settings: Any, task_id: str) -> Path:
    root = Path(settings.coding_runtime_root).expanduser().resolve()
    workspace = (root / UUID(task_id).hex).resolve()
    if root not in workspace.parents:
        raise ValueError("invalid_runtime_workspace")
    return workspace


def _normalize_patch_path(value: str) -> str:
    path = value.strip().split()[0]
    if path == "/dev/null":
        return path
    return path.removeprefix("a/").removeprefix("b/").replace("\\", "/")


def _normalize_patch_line(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _patch_lines_match(left: str, right: str) -> bool:
    return left == right or _normalize_patch_line(left) == _normalize_patch_line(right)


def _parse_unified_patch(patch: str) -> list[_UnifiedPatchFile]:
    lines = patch.replace("\r\n", "\n").split("\n")
    files: list[_UnifiedPatchFile] = []
    current: _UnifiedPatchFile | None = None
    current_hunk: _UnifiedPatchHunk | None = None

    for index, line in enumerate(lines):
        if line.startswith("--- ") and lines[index + 1 : index + 2] and lines[index + 1].startswith("+++ "):
            old_path = _normalize_patch_path(line[4:])
            new_path = _normalize_patch_path(lines[index + 1][4:])
            if not old_path and not new_path:
                raise ValueError("invalid_runtime_patch")
            path = new_path if new_path != "/dev/null" else old_path
            if not path:
                raise ValueError("invalid_runtime_patch")
            current = _UnifiedPatchFile(
                path=path,
                old_path=old_path,
                new_path=new_path,
                hunks=[],
            )
            files.append(current)
            current_hunk = None
            continue
        hunk = re.match(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
        if current and hunk:
            current_hunk = _UnifiedPatchHunk(old_start=int(hunk.group(1)), lines=[])
            current.hunks.append(current_hunk)
            continue
        if current_hunk and (line.startswith((" ", "+", "-")) or line.startswith("\\ No newline")):
            current_hunk.lines.append(line)

    if not files:
        raise ValueError("No valid unified diff was found in the agent response.")
    if any(not file.hunks for file in files):
        raise ValueError("Every file in a unified diff must contain at least one hunk.")
    return files


def _find_hunk_start_candidates(
    original_lines: list[str],
    hunk: _UnifiedPatchHunk,
    cursor: int,
) -> list[int]:
    expected = [
        line[1:]
        for line in hunk.lines
        if line.startswith(" ") or line.startswith("-")
    ]
    preferred = max(cursor, hunk.old_start - 1)
    if not expected:
        return [min(preferred, len(original_lines))]

    last_start = len(original_lines) - len(expected)
    if last_start < cursor:
        return []

    exact: list[int] = []
    relaxed: list[int] = []
    for start in range(cursor, last_start + 1):
        if all(
            _patch_lines_match(original_lines[start + index], line)
            for index, line in enumerate(expected)
        ):
            if all(original_lines[start + index] == line for index, line in enumerate(expected)):
                exact.append(start)
            else:
                relaxed.append(start)

    def rank(starts: list[int]) -> list[int]:
        return [
            item["start"]
            for item in sorted(
                (
                    {
                        "start": start,
                        "distance": abs(start - preferred),
                    }
                    for start in starts
                ),
                key=lambda item: (item["distance"], item["start"]),
            )
        ]

    return [*rank(exact), *rank(relaxed)]


def _try_apply_hunk_at(
    original_lines: list[str],
    hunk: _UnifiedPatchHunk,
    start: int,
    cursor: int,
) -> tuple[list[str], int] | None:
    if start < cursor:
        return None
    result: list[str] = []
    next_cursor = start
    for line in hunk.lines:
        if line.startswith("\\ No newline"):
            continue
        marker = line[0]
        content = line[1:]
        if marker == "+":
            result.append(content)
            continue
        current = original_lines[next_cursor] if next_cursor < len(original_lines) else ""
        if not _patch_lines_match(current, content):
            return None
        if marker == " ":
            result.append(content)
        next_cursor += 1
    return result, next_cursor


def _safe_patch_target(workspace: Path, raw_path: str) -> Path:
    normalized = raw_path.replace("\\", "/").strip()
    if not normalized or normalized == "/dev/null":
        raise ValueError("unsafe_runtime_patch_path")
    candidate = PurePosixPath(normalized)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise ValueError("unsafe_runtime_patch_path")
    target = (workspace / Path(*candidate.parts)).resolve()
    if workspace != target and workspace not in target.parents:
        raise ValueError("unsafe_runtime_patch_path")
    return target


def _apply_unified_patch_to_workspace(
    workspace: Path,
    patch: str,
) -> list[str]:
    files = _parse_unified_patch(patch)
    changed_paths: list[str] = []

    for file in files:
        source_target = (
            _safe_patch_target(workspace, file.old_path)
            if file.old_path != "/dev/null"
            else _safe_patch_target(workspace, file.path)
        )
        target = _safe_patch_target(workspace, file.path)
        if file.new_path == "/dev/null":
            if source_target.exists():
                source_target.unlink()
            changed_paths.append(file.path)
            continue

        if file.old_path != "/dev/null":
            if not source_target.exists():
                raise ValueError(f"Patch context does not match {file.path} near line 1.")
            original = source_target.read_text(encoding="utf-8")
        else:
            original = ""

        original_lines = original.replace("\r\n", "\n").split("\n")
        if not original and original_lines == [""]:
            original_lines = []

        result: list[str] = []
        cursor = 0
        for hunk in file.hunks:
            candidates = _find_hunk_start_candidates(original_lines, hunk, cursor)
            applied: tuple[list[str], int] | None = None
            for start in candidates:
                prefix = original_lines[cursor:start]
                next_result = _try_apply_hunk_at(original_lines, hunk, start, cursor)
                if next_result is None:
                    continue
                hunk_result, next_cursor = next_result
                applied = ([*prefix, *hunk_result], next_cursor)
                break
            if applied is None:
                raise ValueError(
                    f"Patch context does not match {file.path} near line {cursor + 1}."
                )
            segment, cursor = applied
            result.extend(segment)

        result.extend(original_lines[cursor:])
        updated = "\n".join(result)
        if result:
            updated += "\n"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(updated, encoding="utf-8")
        if file.old_path not in {"", "/dev/null"} and file.old_path != file.path:
            if source_target.exists():
                source_target.unlink()
        changed_paths.append(file.path)

    return changed_paths


def detect_runtime_validation_command(settings: Any, *, task_id: str) -> str:
    """Choose one existing, non-interactive validation script for a runtime."""
    workspace = _workspace_path(settings, task_id)
    package_json = workspace / "package.json"
    if package_json.is_file():
        try:
            manifest = json.loads(package_json.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            manifest = {}
        scripts = manifest.get("scripts") if isinstance(manifest, dict) else {}
        if isinstance(scripts, dict):
            selected = ""
            for script_name in ("test", "typecheck", "lint", "build"):
                script = scripts.get(script_name)
                if not isinstance(script, str) or not script.strip():
                    continue
                if (
                    script_name == "test"
                    and "no test specified" in script.lower()
                ):
                    continue
                selected = script_name
                break
            if selected:
                if (workspace / "pnpm-lock.yaml").is_file():
                    return f"pnpm {selected}"
                if (workspace / "yarn.lock").is_file():
                    return f"yarn {selected}"
                if any(
                    (workspace / name).is_file()
                    for name in ("bun.lock", "bun.lockb")
                ):
                    return f"bun run {selected}"
                return (
                    "npm test"
                    if selected == "test"
                    else f"npm run {selected}"
                )
    if any(
        (workspace / marker).is_file()
        for marker in ("pyproject.toml", "pytest.ini", "setup.cfg")
    ):
        return "python -m pytest"
    if (workspace / "go.mod").is_file():
        return "go test ./..."
    if (workspace / "Cargo.toml").is_file():
        return "cargo test"
    return ""


def _diagnostic_path(raw_path: str, workspace: Path) -> str:
    value = raw_path.strip().strip("\"'").replace("\\", "/")
    workspace_value = str(workspace).replace("\\", "/").rstrip("/")
    for prefix in (f"{workspace_value}/", "/workspace/"):
        if value.lower().startswith(prefix.lower()):
            value = value[len(prefix):]
            break
    value = value.removeprefix("./").lstrip("/")
    if not value or ".." in PurePosixPath(value).parts:
        return ""
    return value


def parse_runtime_diagnostics(
    settings: Any,
    *,
    task_id: str,
    stdout: str,
    stderr: str,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Extract bounded, navigable diagnostics from common validation output."""
    workspace = _workspace_path(settings, task_id)
    diagnostics: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int, str]] = set()
    active_eslint_path = ""
    typescript = re.compile(
        r"^(?P<path>.+?)\((?P<line>\d+),(?P<column>\d+)\):\s*"
        r"(?P<severity>error|warning)\s*(?P<code>[A-Z]+\d+)?\s*:?\s*"
        r"(?P<message>.+)$",
        re.IGNORECASE,
    )
    colon = re.compile(
        r"^(?P<path>(?:[A-Za-z]:)?[^:\r\n]+?\.(?:[cm]?[jt]sx?|py|go|rs|"
        r"vue|svelte|css|scss|less|html|json|ya?ml)):"
        r"(?P<line>\d+):(?P<column>\d+):?\s*"
        r"(?:(?P<severity>error|warning|info)\s*)?"
        r"(?:(?P<code>[A-Z][A-Z0-9_-]*\d+)\s*:?\s*)?"
        r"(?P<message>.+)$",
        re.IGNORECASE,
    )
    eslint_row = re.compile(
        r"^\s*(?P<line>\d+):(?P<column>\d+)\s+"
        r"(?P<severity>error|warning)\s+"
        r"(?P<message>.+?)(?:\s{2,}(?P<code>[\w@/-]+))?\s*$",
        re.IGNORECASE,
    )

    def append_diagnostic(
        *,
        path: str,
        line: str,
        column: str,
        severity: str | None,
        message: str,
        source: str,
        code: str | None = None,
    ) -> None:
        normalized_path = _diagnostic_path(path, workspace)
        normalized_message = message.strip()
        if not normalized_path or not normalized_message:
            return
        key = (
            normalized_path,
            int(line),
            int(column),
            normalized_message,
        )
        if key in seen or len(diagnostics) >= limit:
            return
        seen.add(key)
        diagnostics.append(
            {
                "path": normalized_path,
                "line": max(1, int(line)),
                "column": max(1, int(column)),
                "severity": (
                    severity.lower()
                    if severity and severity.lower() in {"error", "warning", "info"}
                    else "error"
                ),
                "message": normalized_message[:2_000],
                "source": source,
                **({"code": code} if code else {}),
            }
        )

    for raw_line in f"{stdout}\n{stderr}".splitlines():
        line = raw_line.rstrip()
        match = typescript.match(line) or colon.match(line)
        if match:
            groups = match.groupdict()
            append_diagnostic(
                path=groups["path"],
                line=groups["line"],
                column=groups["column"],
                severity=groups.get("severity"),
                message=groups["message"],
                source="validation",
                code=groups.get("code"),
            )
            continue
        candidate = _diagnostic_path(line, workspace)
        if candidate and (
            candidate.endswith(
                (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte")
            )
            or (workspace / candidate).is_file()
        ):
            active_eslint_path = candidate
            continue
        eslint_match = eslint_row.match(line)
        if eslint_match and active_eslint_path:
            groups = eslint_match.groupdict()
            append_diagnostic(
                path=active_eslint_path,
                line=groups["line"],
                column=groups["column"],
                severity=groups.get("severity"),
                message=groups["message"],
                source="eslint",
                code=groups.get("code"),
            )
    return diagnostics


def _index_path(settings: Any, task_id: str) -> Path:
    root = Path(settings.coding_runtime_root).expanduser().resolve()
    index_root = (root / ".indexes").resolve()
    path = (index_root / f"{UUID(task_id).hex}.json").resolve()
    if index_root not in path.parents:
        raise ValueError("invalid_code_index_path")
    return path


def is_local_workspace_repository(repository: str) -> bool:
    return repository.startswith("local:")


def _snapshot_path(settings: Any, task_id: str) -> Path:
    root = Path(settings.coding_runtime_root).expanduser().resolve()
    snapshot_root = (root / ".local-snapshots").resolve()
    path = (snapshot_root / f"{UUID(task_id).hex}.zip").resolve()
    if snapshot_root not in path.parents:
        raise ValueError("invalid_workspace_snapshot_path")
    return path


def _runtime_snapshot_marker_path(settings: Any, task_id: str) -> Path:
    root = Path(settings.coding_runtime_root).expanduser().resolve()
    state_root = (root / ".runtime-state").resolve()
    path = (state_root / f"{UUID(task_id).hex}.snapshot").resolve()
    if state_root not in path.parents:
        raise ValueError("invalid_runtime_state_path")
    return path


def _safe_snapshot_member(info: zipfile.ZipInfo) -> PurePosixPath | None:
    raw_name = info.filename.replace("\\", "/")
    relative = PurePosixPath(raw_name)
    if (
        not raw_name
        or relative.is_absolute()
        or ".." in relative.parts
        or any(":" in part for part in relative.parts)
    ):
        raise ValueError("unsafe_workspace_snapshot")
    if info.is_dir():
        return None
    mode = (info.external_attr >> 16) & 0xFFFF
    if stat.S_ISLNK(mode):
        raise ValueError("workspace_snapshot_symlink_not_allowed")
    lowered = [part.lower() for part in relative.parts]
    basename = lowered[-1]
    if (
        ".git" in lowered
        or "node_modules" in lowered
        or ".next" in lowered
        or basename == ".env"
        or (basename.startswith(".env.") and basename != ".env.example")
        or basename in {"id_rsa", "id_ed25519"}
        or basename in {
            ".npmrc",
            ".netrc",
            ".pypirc",
            ".git-credentials",
            "credentials.json",
        }
        or basename.endswith((".pem", ".key", ".p12", ".pfx"))
    ):
        raise ValueError("workspace_snapshot_contains_private_file")
    return relative


def _validate_workspace_snapshot(archive_bytes: bytes) -> dict[str, Any]:
    if not archive_bytes:
        raise ValueError("workspace_snapshot_empty")
    if len(archive_bytes) > _MAX_SNAPSHOT_UPLOAD_BYTES:
        raise OverflowError("workspace_snapshot_too_large")
    total_size = 0
    file_count = 0
    try:
        with zipfile.ZipFile(BytesIO(archive_bytes), mode="r") as archive:
            for info in archive.infolist():
                relative = _safe_snapshot_member(info)
                if relative is None:
                    continue
                file_count += 1
                total_size += int(info.file_size or 0)
                if (
                    file_count > _MAX_ARCHIVE_FILES
                    or total_size > _MAX_ARCHIVE_BYTES
                ):
                    raise OverflowError("workspace_snapshot_too_large")
                if len(relative.parts) > 64 or len(str(relative)) > 1_000:
                    raise ValueError("workspace_snapshot_path_too_long")
    except zipfile.BadZipFile as exc:
        raise ValueError("workspace_snapshot_invalid_zip") from exc
    if file_count == 0:
        raise ValueError("workspace_snapshot_empty")
    return {
        "files": file_count,
        "uncompressed_bytes": total_size,
        "compressed_bytes": len(archive_bytes),
        "sha256": hashlib.sha256(archive_bytes).hexdigest(),
    }


def save_local_workspace_snapshot(
    settings: Any,
    *,
    task_id: str,
    archive_bytes: bytes,
) -> dict[str, Any]:
    metadata = _validate_workspace_snapshot(archive_bytes)
    path = _snapshot_path(settings, task_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f".{secrets.token_hex(6)}.tmp")
    try:
        temporary.write_bytes(archive_bytes)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    _index_path(settings, task_id).unlink(missing_ok=True)
    return {
        "task_id": task_id,
        "status": "ready",
        **metadata,
    }


def local_workspace_snapshot_status(
    settings: Any,
    *,
    task_id: str,
) -> dict[str, Any]:
    path = _snapshot_path(settings, task_id)
    if not path.exists():
        return {"task_id": task_id, "status": "missing"}
    metadata = _validate_workspace_snapshot(path.read_bytes())
    return {"task_id": task_id, "status": "ready", **metadata}


def _extract_local_workspace_snapshot(
    settings: Any,
    *,
    task_id: str,
    workspace: Path,
) -> dict[str, Any]:
    path = _snapshot_path(settings, task_id)
    if not path.exists():
        raise RuntimeError("workspace_snapshot_not_uploaded")
    archive_bytes = path.read_bytes()
    metadata = _validate_workspace_snapshot(archive_bytes)
    workspace.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(BytesIO(archive_bytes), mode="r") as archive:
        for info in archive.infolist():
            relative = _safe_snapshot_member(info)
            if relative is None:
                continue
            target = (workspace / Path(*relative.parts)).resolve()
            if workspace not in target.parents:
                raise ValueError("unsafe_workspace_snapshot")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info, mode="r") as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
    return metadata


def _shared_index_path(
    settings: Any,
    *,
    cache_scope: str,
    repository: str,
    ref: str,
) -> Path:
    root = Path(settings.coding_runtime_root).expanduser().resolve()
    index_root = (root / ".repository-indexes").resolve()
    cache_key = hashlib.sha256(
        f"{cache_scope}\0{repository}\0{ref}".encode("utf-8")
    ).hexdigest()
    path = (index_root / f"{cache_key}.json").resolve()
    if index_root not in path.parents:
        raise ValueError("invalid_code_index_path")
    return path


async def _run_process(*args: str, timeout: float = 30.0) -> RuntimeResult:
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("docker_cli_not_found") from exc
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("runtime_command_timeout") from None
    except asyncio.CancelledError:
        process.kill()
        await process.communicate()
        raise
    return RuntimeResult(
        exit_code=int(process.returncode or 0),
        stdout=stdout[:_MAX_COMMAND_OUTPUT].decode("utf-8", errors="replace"),
        stderr=stderr[:_MAX_COMMAND_OUTPUT].decode("utf-8", errors="replace"),
    )


async def _run_process_with_input(
    *args: str,
    input_bytes: bytes,
    timeout: float = 30.0,
) -> RuntimeResult:
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("docker_cli_not_found") from exc
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(input_bytes),
            timeout,
        )
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("runtime_command_timeout") from None
    except asyncio.CancelledError:
        process.kill()
        await process.communicate()
        raise
    return RuntimeResult(
        exit_code=int(process.returncode or 0),
        stdout=stdout[:_MAX_COMMAND_OUTPUT].decode("utf-8", errors="replace"),
        stderr=stderr[:_MAX_COMMAND_OUTPUT].decode("utf-8", errors="replace"),
    )


async def _run_process_binary(
    *args: str,
    timeout: float = 30.0,
) -> BinaryRuntimeResult:
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("docker_cli_not_found") from exc
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("runtime_command_timeout") from None
    except asyncio.CancelledError:
        process.kill()
        await process.communicate()
        raise
    return BinaryRuntimeResult(
        exit_code=int(process.returncode or 0),
        stdout=stdout,
        stderr=stderr,
    )


async def _run_process_binary_with_input(
    *args: str,
    input_bytes: bytes,
    timeout: float = 30.0,
) -> BinaryRuntimeResult:
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("docker_cli_not_found") from exc
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(input_bytes),
            timeout,
        )
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("runtime_preview_timeout") from None
    except asyncio.CancelledError:
        process.kill()
        await process.communicate()
        raise
    return BinaryRuntimeResult(
        exit_code=int(process.returncode or 0),
        stdout=stdout,
        stderr=stderr,
    )


def _extract_repository_archive(archive_bytes: bytes, workspace: Path) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    total_size = 0
    file_count = 0
    with tarfile.open(fileobj=BytesIO(archive_bytes), mode="r:gz") as archive:
        for member in archive:
            if member.issym() or member.islnk() or member.isdev():
                continue
            parts = PurePosixPath(member.name).parts
            if len(parts) < 2:
                continue
            relative = PurePosixPath(*parts[1:])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("unsafe_repository_archive")
            target = (workspace / Path(*relative.parts)).resolve()
            if workspace not in target.parents and target != workspace:
                raise ValueError("unsafe_repository_archive")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                continue
            file_count += 1
            total_size += int(member.size or 0)
            if file_count > _MAX_ARCHIVE_FILES or total_size > _MAX_ARCHIVE_BYTES:
                raise OverflowError("repository_archive_too_large")
            source = archive.extractfile(member)
            if source is None:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("wb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)


async def _download_repository(
    *,
    token: str,
    repository: str,
    ref: str,
) -> bytes:
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "KONTEXT-Coding-Runtime",
    }
    try:
        async with httpx.AsyncClient(
            base_url=_GITHUB_API,
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=5.0),
            follow_redirects=True,
        ) as client:
            async with client.stream(
                "GET",
                f"/repos/{repository}/tarball/{ref}",
            ) as response:
                if response.status_code == 404:
                    tree_response = await client.get(
                        f"/repos/{repository}/git/trees/{quote(ref, safe='')}",
                    )
                    detail = tree_response.json() if tree_response.content else {}
                    message = str(detail.get("message") or "").lower() if isinstance(detail, dict) else ""
                    if tree_response.status_code == 409 and "empty" in message:
                        return b""
                    raise ValueError("github_repository_archive_not_found")
                response.raise_for_status()
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > _MAX_ARCHIVE_BYTES:
                        raise OverflowError("repository_archive_too_large")
                return bytes(content)
    except httpx.HTTPError as exc:
        raise RuntimeError("github_archive_request_failed") from exc


def code_index_status(settings: Any, *, task_id: str) -> dict[str, Any]:
    index = load_code_index(_index_path(settings, task_id))
    if not index:
        return {"task_id": task_id, "status": "not_indexed"}
    return {
        "task_id": task_id,
        "status": "ready",
        "created_at": index.get("created_at"),
        **dict(index.get("stats") or {}),
    }


async def prepare_code_index(
    settings: Any,
    *,
    task_id: str,
    repository: str,
    ref: str,
    github_token: str,
    cache_scope: str,
    force: bool = False,
    max_cache_age_seconds: int = 300,
) -> dict[str, Any]:
    """Download a read-only snapshot and build an incremental workspace index."""
    local_source = is_local_workspace_repository(repository)
    if not local_source and not github_token.strip():
        raise RuntimeError("github_not_configured")
    index_path = _index_path(settings, task_id)
    if local_source:
        snapshot = local_workspace_snapshot_status(settings, task_id=task_id)
        if snapshot["status"] != "ready":
            raise RuntimeError("workspace_snapshot_not_uploaded")
        previous = load_code_index(index_path)
        if (
            not force
            and previous
            and previous.get("snapshot_sha256") == snapshot["sha256"]
        ):
            return {**code_index_status(settings, task_id=task_id), "cache_hit": True}
        checkout_root = (
            Path(settings.coding_runtime_root).expanduser().resolve()
            / ".index-workspaces"
        ).resolve()
        checkout_root.mkdir(parents=True, exist_ok=True)
        checkout = checkout_root / f"{UUID(task_id).hex}-{secrets.token_hex(4)}"
        try:
            _extract_local_workspace_snapshot(
                settings,
                task_id=task_id,
                workspace=checkout,
            )
            index = await asyncio.to_thread(
                build_code_index,
                checkout,
                previous=previous,
            )
            index["repository"] = repository
            index["ref"] = ref
            index["snapshot_sha256"] = snapshot["sha256"]
            await asyncio.to_thread(save_code_index, index, index_path)
        finally:
            shutil.rmtree(checkout, ignore_errors=True)
        return {**code_index_status(settings, task_id=task_id), "cache_hit": False}

    shared_index_path = _shared_index_path(
        settings,
        cache_scope=cache_scope,
        repository=repository,
        ref=ref,
    )
    shared_index = load_code_index(shared_index_path)
    if (
        not force
        and shared_index
        and time.time() - float(shared_index.get("created_at") or 0)
        <= max_cache_age_seconds
    ):
        await asyncio.to_thread(save_code_index, shared_index, index_path)
        return {**code_index_status(settings, task_id=task_id), "cache_hit": True}
    previous = load_code_index(index_path) or shared_index
    checkout_root = (
        Path(settings.coding_runtime_root).expanduser().resolve() / ".index-workspaces"
    ).resolve()
    checkout_root.mkdir(parents=True, exist_ok=True)
    checkout = checkout_root / f"{UUID(task_id).hex}-{secrets.token_hex(4)}"
    try:
        archive = await _download_repository(
            token=github_token,
            repository=repository,
            ref=ref,
        )
        if archive:
            _extract_repository_archive(archive, checkout)
        else:
            checkout.mkdir(parents=True, exist_ok=True)
        index = await asyncio.to_thread(
            build_code_index,
            checkout,
            previous=previous,
        )
        index["repository"] = repository
        index["ref"] = ref
        await asyncio.gather(
            asyncio.to_thread(save_code_index, index, shared_index_path),
            asyncio.to_thread(save_code_index, index, index_path),
        )
    finally:
        shutil.rmtree(checkout, ignore_errors=True)
    return {**code_index_status(settings, task_id=task_id), "cache_hit": False}


async def search_task_code_index(
    settings: Any,
    *,
    task_id: str,
    query: str,
    mode: str = "hybrid",
    limit: int = 12,
    max_chars: int = 18_000,
) -> dict[str, Any]:
    index = await asyncio.to_thread(load_code_index, _index_path(settings, task_id))
    if not index:
        raise RuntimeError("code_index_not_ready")
    result = await asyncio.to_thread(
        search_code_index,
        index,
        query,
        mode=mode,
        limit=limit,
        max_chars=max_chars,
    )
    return {
        "task_id": task_id,
        "status": "ready",
        "stats": dict(index.get("stats") or {}),
        **result,
    }


def _runtime_user(workspace: Path) -> str:
    """Use a non-root container user that can write the isolated checkout."""
    if os.name == "posix":
        host_uid = os.geteuid()
        host_gid = os.getegid()
        if host_uid != 0:
            return f"{host_uid}:{host_gid}"
        runtime_uid = 1000
        runtime_gid = 1000
        for path in (workspace, *workspace.rglob("*")):
            try:
                os.chown(path, runtime_uid, runtime_gid)
            except (FileNotFoundError, PermissionError):
                raise RuntimeError("runtime_workspace_permissions") from None
        return f"{runtime_uid}:{runtime_gid}"
    return "1000:1000"


def runtime_enabled(settings: Any) -> bool:
    return bool(getattr(settings, "coding_runtime_enabled", False))


def _runtime_workspace_mount(settings: Any, *, task_id: str, workspace: Path) -> str:
    volume = str(getattr(settings, "coding_runtime_volume", "") or "").strip()
    if not volume:
        return f"type=bind,src={workspace},dst=/workspace"
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", volume):
        raise ValueError("invalid_runtime_volume")
    return (
        f"type=volume,src={volume},dst=/workspace,"
        f"volume-subpath={UUID(task_id).hex}"
    )


async def _initialize_git_repository(
    *,
    task_id: str,
    branch: str,
) -> None:
    container = _container_name(task_id)
    commands = [
        ("git", "check-ref-format", "--branch", branch),
        ("git", "init"),
        ("git", "config", "user.name", "KONTEXT Coding Agent"),
        ("git", "config", "user.email", "coding-agent@kontext.local"),
        ("git", "checkout", "-B", branch),
        ("git", "add", "--all"),
        ("git", "commit", "--allow-empty", "-m", "KONTEXT runtime baseline"),
    ]
    for command in commands:
        result = await _run_process(
            "docker",
            "exec",
            container,
            *command,
            timeout=30.0,
        )
        if result.exit_code != 0:
            if "not found" in result.stderr.lower():
                raise RuntimeError("runtime_git_unavailable")
            raise RuntimeError(result.stderr.strip() or "runtime_git_init_failed")


def _materialize_plan_artifact(workspace: Path, markdown: str) -> bool:
    content = markdown.strip()
    if not content:
        return False
    if "\x00" in content or len(content.encode("utf-8")) > 100_000:
        raise ValueError("invalid_coding_plan_artifact")
    target = workspace / "plans-goals" / "task.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"{content}\n", encoding="utf-8")
    return True


async def _commit_runtime_plan_baseline(*, task_id: str) -> None:
    container = _container_name(task_id)
    add = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "add",
        "--",
        "plans-goals/task.md",
        timeout=20.0,
    )
    if add.exit_code != 0:
        raise RuntimeError(add.stderr.strip() or "runtime_plan_stage_failed")
    changed = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "diff",
        "--cached",
        "--quiet",
        "--",
        "plans-goals/task.md",
        timeout=20.0,
    )
    if changed.exit_code == 0:
        return
    if changed.exit_code != 1:
        raise RuntimeError(changed.stderr.strip() or "runtime_plan_diff_failed")
    committed = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "commit",
        "-m",
        "Update Kontext plan baseline",
        timeout=30.0,
    )
    if committed.exit_code != 0:
        raise RuntimeError(
            committed.stderr.strip() or "runtime_plan_commit_failed"
        )


async def materialize_runtime_plan(
    settings: Any,
    *,
    task_id: str,
    markdown: str,
) -> dict[str, Any]:
    status = await runtime_status(settings, task_id=task_id)
    if status.get("status") != "running":
        raise RuntimeError("coding_runtime_not_running")
    workspace = _workspace_path(settings, task_id)
    _materialize_plan_artifact(workspace, markdown)
    await _commit_runtime_plan_baseline(task_id=task_id)
    return {
        "task_id": task_id,
        "artifact_path": "plans-goals/task.md",
        "status": "ready",
    }


async def start_runtime(
    settings: Any,
    *,
    task_id: str,
    repository: str,
    ref: str,
    github_token: str,
    plan_artifact: str = "",
) -> dict[str, Any]:
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    local_source = is_local_workspace_repository(repository)
    if not local_source and not github_token.strip():
        raise RuntimeError("github_not_configured")
    workspace = _workspace_path(settings, task_id)
    container = _container_name(task_id)

    existing = await runtime_status(settings, task_id=task_id)
    if existing["status"] == "running":
        if plan_artifact and _materialize_plan_artifact(workspace, plan_artifact):
            await _commit_runtime_plan_baseline(task_id=task_id)
        if not local_source:
            return {**existing, "plan_artifact": "plans-goals/task.md"}
        snapshot = local_workspace_snapshot_status(settings, task_id=task_id)
        marker = _runtime_snapshot_marker_path(settings, task_id)
        if (
            snapshot["status"] == "ready"
            and marker.exists()
            and marker.read_text(encoding="utf-8").strip() == snapshot["sha256"]
        ):
            return existing
        await stop_runtime(settings, task_id=task_id)

    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.mkdir(parents=True, exist_ok=False)
    try:
        if local_source:
            _extract_local_workspace_snapshot(
                settings,
                task_id=task_id,
                workspace=workspace,
            )
        else:
            archive = await _download_repository(
                token=github_token,
                repository=repository,
                ref=ref,
            )
            if archive:
                _extract_repository_archive(archive, workspace)
        _materialize_plan_artifact(workspace, plan_artifact)
        runtime_user = _runtime_user(workspace)
    except Exception:
        shutil.rmtree(workspace, ignore_errors=True)
        raise

    args = [
        "docker",
        "run",
        "--detach",
        "--rm",
        "--name",
        container,
        "--label",
        f"kontext.task_id={task_id}",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        str(settings.coding_runtime_pids),
        "--memory",
        str(settings.coding_runtime_memory),
        "--cpus",
        str(settings.coding_runtime_cpus),
        "--user",
        runtime_user,
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=128m",
        "--mount",
        _runtime_workspace_mount(
            settings,
            task_id=task_id,
            workspace=workspace,
        ),
        "--workdir",
        "/workspace",
        str(settings.coding_runtime_image),
        "sleep",
        "infinity",
    ]
    result = await _run_process(*args, timeout=90.0)
    if result.exit_code != 0:
        shutil.rmtree(workspace, ignore_errors=True)
        raise RuntimeError(result.stderr.strip() or "runtime_start_failed")
    try:
        await _initialize_git_repository(task_id=task_id, branch=ref)
    except Exception:
        await _run_process("docker", "rm", "--force", container, timeout=20.0)
        shutil.rmtree(workspace, ignore_errors=True)
        raise
    if local_source:
        snapshot = local_workspace_snapshot_status(settings, task_id=task_id)
        marker = _runtime_snapshot_marker_path(settings, task_id)
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(str(snapshot["sha256"]), encoding="utf-8")
    return {
        "task_id": task_id,
        "container": container,
        "status": "running",
        "workspace": "/workspace",
        "network": "disabled",
        "writable": True,
        "plan_artifact": (
            "plans-goals/task.md" if plan_artifact.strip() else None
        ),
    }


async def runtime_status(settings: Any, *, task_id: str) -> dict[str, Any]:
    if not runtime_enabled(settings):
        return {"task_id": task_id, "status": "disabled"}
    container = _container_name(task_id)
    result = await _run_process(
        "docker",
        "inspect",
        "--format",
        "{{.State.Status}}",
        container,
        timeout=10.0,
    )
    if result.exit_code != 0:
        return {"task_id": task_id, "container": container, "status": "stopped"}
    return {
        "task_id": task_id,
        "container": container,
        "status": result.stdout.strip() or "unknown",
        "workspace": "/workspace",
        "network": "disabled",
        "writable": True,
    }


async def execute_runtime_command(
    settings: Any,
    *,
    task_id: str,
    command: str,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    normalized = command.strip()
    if not normalized or len(normalized) > 2_000 or "\x00" in normalized:
        raise ValueError("invalid_runtime_command")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    result = await _run_process(
        "docker",
        "exec",
        "--interactive",
        _container_name(task_id),
        "sh",
        "-lc",
        normalized,
        timeout=float(max(1, min(timeout_seconds, 120))),
    )
    return {
        "task_id": task_id,
        "command": normalized,
        "exit_code": result.exit_code,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }


async def runtime_changes(settings: Any, *, task_id: str) -> dict[str, Any]:
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    container = _container_name(task_id)
    status_result = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "-c",
        "core.quotepath=false",
        "status",
        "--short",
        "--untracked-files=all",
        "--no-renames",
        timeout=15.0,
    )
    diff_result = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "diff",
        "--no-ext-diff",
        "--unified=3",
        "--",
        timeout=30.0,
    )
    if status_result.exit_code != 0 or diff_result.exit_code != 0:
        raise RuntimeError(
            status_result.stderr.strip()
            or diff_result.stderr.strip()
            or "runtime_git_status_failed"
        )
    files = [
        line[3:].strip()
        for line in status_result.stdout.splitlines()
        if len(line) > 3
    ]
    return {
        "task_id": task_id,
        "files": files[:500],
        "status": status_result.stdout,
        "diff": diff_result.stdout,
    }


def _working_tree_records(status: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for line in status.splitlines():
        if len(line) < 4:
            continue
        state = line[:2]
        path = line[3:].strip()
        relative = PurePosixPath(path)
        if (
            not path
            or relative.is_absolute()
            or ".." in relative.parts
            or len(path) > 1_024
        ):
            raise ValueError("unsafe_runtime_sync_path")
        records.append(
            {
                "path": path,
                "status": "deleted" if "D" in state else "changed",
            }
        )
    return records


async def export_runtime_working_tree(
    settings: Any,
    *,
    task_id: str,
) -> dict[str, Any]:
    """Export reviewed working-tree changes for a reconnectable browser sync."""
    changes = await runtime_changes(settings, task_id=task_id)
    records = _working_tree_records(str(changes.get("status") or ""))
    if len(records) > _MAX_WORKSPACE_SYNC_FILES:
        raise OverflowError("runtime_sync_too_many_files")

    container = _container_name(task_id)
    total_bytes = 0
    exported: list[dict[str, Any]] = []
    for record in records:
        if record["status"] == "deleted":
            exported.append(record)
            continue
        content = await _run_process_binary(
            "docker",
            "exec",
            container,
            "sh",
            "-c",
            'cat -- "$1"',
            "kontext-sync",
            record["path"],
            timeout=20.0,
        )
        if content.exit_code != 0:
            raise RuntimeError("runtime_sync_file_unavailable")
        if len(content.stdout) > _MAX_WORKSPACE_SYNC_FILE_BYTES:
            raise OverflowError("runtime_sync_file_too_large")
        total_bytes += len(content.stdout)
        if total_bytes > _MAX_WORKSPACE_SYNC_TOTAL_BYTES:
            raise OverflowError("runtime_sync_too_large")
        exported.append(
            {
                **record,
                "encoding": "base64",
                "content": base64.b64encode(content.stdout).decode("ascii"),
            }
        )
    return {
        "task_id": task_id,
        "files": exported,
        "total_bytes": total_bytes,
    }


async def apply_runtime_patch(
    settings: Any,
    *,
    task_id: str,
    patch: str,
) -> dict[str, Any]:
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    encoded = patch.encode("utf-8")
    if not encoded or len(encoded) > 250_000 or b"\x00" in encoded:
        raise ValueError("invalid_runtime_patch")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    container = _container_name(task_id)
    workspace = _workspace_path(settings, task_id)

    async def _try_git_apply() -> bool:
        check = await _run_process_with_input(
            "docker",
            "exec",
            "--interactive",
            container,
            "git",
            "apply",
            "--check",
            "--whitespace=error-all",
            "-",
            input_bytes=encoded,
            timeout=30.0,
        )
        if check.exit_code != 0:
            raise ValueError(check.stderr.strip() or "runtime_patch_check_failed")
        applied = await _run_process_with_input(
            "docker",
            "exec",
            "--interactive",
            container,
            "git",
            "apply",
            "--whitespace=fix",
            "-",
            input_bytes=encoded,
            timeout=30.0,
        )
        if applied.exit_code != 0:
            raise RuntimeError(applied.stderr.strip() or "runtime_patch_apply_failed")
        return True

    applied_mode = "git_apply"
    try:
        await _try_git_apply()
    except (ValueError, RuntimeError) as exc:
        message = str(exc)
        if not re.search(
            r"(patch context does not match|runtime_patch_check_failed|runtime_patch_apply_failed|failed to apply|rejected hunk|patch failed)",
            message,
            re.IGNORECASE,
        ):
            raise
        _apply_unified_patch_to_workspace(workspace, patch)
        applied_mode = "workspace_rebase"

    changes = await runtime_changes(settings, task_id=task_id)
    return {**changes, "applied_mode": applied_mode, "recovered_from_drift": applied_mode == "workspace_rebase"}


async def create_runtime_commit(
    settings: Any,
    *,
    task_id: str,
    message: str,
) -> dict[str, Any]:
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    normalized = message.strip()
    if not normalized or len(normalized) > 200 or "\x00" in normalized:
        raise ValueError("invalid_commit_message")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    container = _container_name(task_id)
    for command in (
        ("git", "add", "--all"),
        ("git", "commit", "-m", normalized),
    ):
        result = await _run_process(
            "docker",
            "exec",
            container,
            *command,
            timeout=30.0,
        )
        if result.exit_code != 0:
            raise RuntimeError(result.stderr.strip() or "runtime_commit_failed")
    sha = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "rev-parse",
        "HEAD",
        timeout=10.0,
    )
    summary = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "show",
        "--stat",
        "--oneline",
        "--no-renames",
        "HEAD",
        timeout=20.0,
    )
    return {
        "task_id": task_id,
        "sha": sha.stdout.strip(),
        "summary": summary.stdout,
    }


async def export_runtime_commit(
    settings: Any,
    *,
    task_id: str,
) -> dict[str, Any]:
    """Export the latest reviewed commit without granting the runtime network."""
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    container = _container_name(task_id)
    metadata = await _run_process_binary(
        "docker",
        "exec",
        container,
        "git",
        "diff",
        "--name-status",
        "--no-renames",
        "-z",
        "HEAD~1",
        "HEAD",
        timeout=20.0,
    )
    if metadata.exit_code != 0:
        raise RuntimeError(
            metadata.stderr.decode("utf-8", errors="replace").strip()
            or "runtime_commit_not_found"
        )
    parts = metadata.stdout.split(b"\x00")
    changes: list[dict[str, Any]] = []
    total_bytes = 0
    index = 0
    while index + 1 < len(parts) and parts[index]:
        status_code = parts[index].decode("ascii", errors="replace")[:1]
        path = parts[index + 1].decode("utf-8", errors="strict")
        index += 2
        if (
            not path
            or path.startswith("/")
            or ".." in PurePosixPath(path).parts
            or len(path) > 1_024
        ):
            raise ValueError("unsafe_commit_path")
        if len(changes) >= 200:
            raise OverflowError("runtime_commit_too_many_files")
        if status_code == "D":
            changes.append({"path": path, "status": "deleted"})
            continue
        if status_code not in {"A", "M"}:
            raise ValueError("unsupported_commit_change")
        content = await _run_process_binary(
            "docker",
            "exec",
            container,
            "git",
            "show",
            f"HEAD:{path}",
            timeout=20.0,
        )
        if content.exit_code != 0:
            raise RuntimeError("runtime_commit_file_unavailable")
        if len(content.stdout) > _MAX_PUBLISH_FILE_BYTES:
            raise OverflowError("runtime_commit_file_too_large")
        total_bytes += len(content.stdout)
        if total_bytes > _MAX_PUBLISH_TOTAL_BYTES:
            raise OverflowError("runtime_commit_too_large")
        mode_result = await _run_process(
            "docker",
            "exec",
            container,
            "git",
            "ls-tree",
            "HEAD",
            "--",
            path,
            timeout=10.0,
        )
        mode = mode_result.stdout.split(maxsplit=1)[0]
        if mode not in {"100644", "100755"}:
            mode = "100644"
        changes.append(
            {
                "path": path,
                "status": "changed",
                "mode": mode,
                "content": content.stdout,
            }
        )
    if not changes:
        raise ValueError("runtime_commit_has_no_changes")
    message = await _run_process(
        "docker",
        "exec",
        container,
        "git",
        "log",
        "-1",
        "--pretty=%B",
        timeout=10.0,
    )
    return {
        "task_id": task_id,
        "message": message.stdout.strip(),
        "changes": changes,
    }


_PREVIEW_PROXY_SCRIPT = f"""
import json
import sys
import urllib.error
import urllib.request

port = int(sys.argv[1])
path = sys.argv[2]
method = sys.argv[3]
headers = json.loads(sys.argv[4])
body = sys.stdin.buffer.read()
request = urllib.request.Request(
    f"http://127.0.0.1:{{port}}{{path}}",
    data=body if body else None,
    headers=headers,
    method=method,
)
try:
    response = urllib.request.urlopen(request, timeout=10)
except urllib.error.HTTPError as error:
    response = error
payload = response.read({_MAX_PREVIEW_RESPONSE_BYTES + 1})
if len(payload) > {_MAX_PREVIEW_RESPONSE_BYTES}:
    raise RuntimeError("preview response too large")
allowed = {{}}
for key in ("Content-Type", "Cache-Control", "ETag", "Last-Modified", "Location"):
    value = response.headers.get(key)
    if value:
        allowed[key] = value
metadata = json.dumps({{"status": response.status, "headers": allowed}}).encode()
sys.stdout.buffer.write(metadata + b"\\n" + payload)
""".strip()


async def proxy_runtime_preview(
    settings: Any,
    *,
    task_id: str,
    port: int,
    path: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes = b"",
) -> dict[str, Any]:
    if not runtime_enabled(settings):
        raise RuntimeError("coding_runtime_disabled")
    if port < 1024 or port > 65535:
        raise ValueError("invalid_preview_port")
    if (
        not path.startswith("/")
        or len(path) > 4_096
        or "\x00" in path
        or method not in {"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
    ):
        raise ValueError("invalid_preview_request")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    forwarded_headers = {
        key: value[:1_000]
        for key, value in (headers or {}).items()
        if key.lower() in {"accept", "content-type", "if-none-match", "if-modified-since"}
    }
    result = await _run_process_binary_with_input(
        "docker",
        "exec",
        "--interactive",
        _container_name(task_id),
        "python3",
        "-c",
        _PREVIEW_PROXY_SCRIPT,
        str(port),
        path,
        method,
        json.dumps(forwarded_headers),
        input_bytes=body[:1_000_000],
        timeout=15.0,
    )
    if result.exit_code != 0:
        raise RuntimeError(
            result.stderr.decode("utf-8", errors="replace").strip()
            or "runtime_preview_unavailable"
        )
    metadata_line, separator, payload = result.stdout.partition(b"\n")
    if not separator:
        raise RuntimeError("runtime_preview_invalid_response")
    try:
        metadata = json.loads(metadata_line)
    except (TypeError, ValueError):
        raise RuntimeError("runtime_preview_invalid_response") from None
    return {
        "status": int(metadata["status"]),
        "headers": dict(metadata.get("headers") or {}),
        "body": payload,
    }


async def start_runtime_preview(
    settings: Any,
    *,
    task_id: str,
    command: str,
    port: int,
) -> dict[str, Any]:
    normalized = command.strip()
    if not normalized or len(normalized) > 2_000 or "\x00" in normalized:
        raise ValueError("invalid_preview_command")
    if port < 1024 or port > 65535:
        raise ValueError("invalid_preview_port")
    status = await runtime_status(settings, task_id=task_id)
    if status["status"] != "running":
        raise RuntimeError("coding_runtime_not_running")
    launch_script = (
        "if [ -f /tmp/kontext-preview.pid ]; then "
        "kill \"$(cat /tmp/kontext-preview.pid)\" 2>/dev/null || true; "
        "fi; "
        f"nohup sh -lc {shlex.quote(normalized)} "
        "> /tmp/kontext-preview.log 2>&1 < /dev/null & "
        "echo $! > /tmp/kontext-preview.pid"
    )
    result = await _run_process(
        "docker",
        "exec",
        _container_name(task_id),
        "sh",
        "-lc",
        launch_script,
        timeout=10.0,
    )
    if result.exit_code != 0:
        raise RuntimeError(result.stderr.strip() or "runtime_preview_start_failed")
    for _ in range(12):
        await asyncio.sleep(0.25)
        try:
            await proxy_runtime_preview(
                settings,
                task_id=task_id,
                port=port,
                path="/",
            )
            return {
                "task_id": task_id,
                "port": port,
                "status": "running",
            }
        except RuntimeError:
            continue
    raise RuntimeError("runtime_preview_start_timeout")


async def stop_runtime(settings: Any, *, task_id: str) -> dict[str, Any]:
    if not runtime_enabled(settings):
        return {"task_id": task_id, "status": "disabled"}
    result = await _run_process(
        "docker",
        "rm",
        "--force",
        _container_name(task_id),
        timeout=20.0,
    )
    workspace = _workspace_path(settings, task_id)
    if workspace.exists():
        shutil.rmtree(workspace)
    _runtime_snapshot_marker_path(settings, task_id).unlink(missing_ok=True)
    return {
        "task_id": task_id,
        "status": "stopped",
        "message": result.stderr.strip() if result.exit_code else "",
    }
