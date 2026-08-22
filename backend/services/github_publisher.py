"""Publish reviewed runtime commits through the connected GitHub account."""

from __future__ import annotations

import base64
import re
from typing import Any
from urllib.parse import quote

import httpx

_GITHUB_API = "https://api.github.com"
_REPOSITORY_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
_BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$")


def _validate_publish_target(repository: str, base: str, branch: str) -> None:
    if not _REPOSITORY_RE.fullmatch(repository):
        raise ValueError("invalid_github_repository")
    for value, error in (
        (base, "invalid_base_branch"),
        (branch, "invalid_head_branch"),
    ):
        if (
            not _BRANCH_RE.fullmatch(value)
            or ".." in value
            or value.endswith(("/", "."))
            or "//" in value
            or "@{" in value
        ):
            raise ValueError(error)
    if branch == base:
        raise ValueError("head_branch_matches_base")


async def publish_pull_request(
    *,
    token: str,
    repository: str,
    base: str,
    branch: str,
    title: str,
    body: str,
    commit: dict[str, Any],
) -> dict[str, Any]:
    _validate_publish_target(repository, base, branch)
    if not token.strip():
        raise RuntimeError("github_not_configured")
    normalized_title = title.strip()
    if not normalized_title or len(normalized_title) > 256:
        raise ValueError("invalid_pull_request_title")
    if len(body) > 10_000:
        raise ValueError("pull_request_body_too_large")

    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "KONTEXT-Coding-Agent",
    }
    repository_path = quote(repository, safe="/")
    try:
        async with httpx.AsyncClient(
            base_url=_GITHUB_API,
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=5.0),
        ) as client:
            base_ref = await client.get(
                f"/repos/{repository_path}/git/ref/heads/{quote(base, safe='')}",
            )
            if base_ref.status_code == 404:
                raise ValueError("github_base_branch_not_found")
            base_ref.raise_for_status()
            base_sha = str(base_ref.json()["object"]["sha"])

            base_commit = await client.get(
                f"/repos/{repository_path}/git/commits/{base_sha}",
            )
            base_commit.raise_for_status()
            base_tree_sha = str(base_commit.json()["tree"]["sha"])

            tree_entries: list[dict[str, Any]] = []
            for change in commit["changes"]:
                if change["status"] == "deleted":
                    tree_entries.append(
                        {
                            "path": change["path"],
                            "mode": "100644",
                            "type": "blob",
                            "sha": None,
                        }
                    )
                    continue
                blob = await client.post(
                    f"/repos/{repository_path}/git/blobs",
                    json={
                        "content": base64.b64encode(change["content"]).decode("ascii"),
                        "encoding": "base64",
                    },
                )
                blob.raise_for_status()
                tree_entries.append(
                    {
                        "path": change["path"],
                        "mode": change.get("mode") or "100644",
                        "type": "blob",
                        "sha": blob.json()["sha"],
                    }
                )

            tree = await client.post(
                f"/repos/{repository_path}/git/trees",
                json={"base_tree": base_tree_sha, "tree": tree_entries},
            )
            tree.raise_for_status()
            github_commit = await client.post(
                f"/repos/{repository_path}/git/commits",
                json={
                    "message": commit["message"] or normalized_title,
                    "tree": tree.json()["sha"],
                    "parents": [base_sha],
                },
            )
            github_commit.raise_for_status()
            commit_sha = str(github_commit.json()["sha"])

            branch_ref = await client.post(
                f"/repos/{repository_path}/git/refs",
                json={"ref": f"refs/heads/{branch}", "sha": commit_sha},
            )
            if branch_ref.status_code == 422:
                raise ValueError("github_head_branch_already_exists")
            branch_ref.raise_for_status()

            pull = await client.post(
                f"/repos/{repository_path}/pulls",
                json={
                    "title": normalized_title,
                    "body": body,
                    "head": branch,
                    "base": base,
                },
            )
            pull.raise_for_status()
            payload = pull.json()
            return {
                "number": payload["number"],
                "url": payload["html_url"],
                "branch": branch,
                "base": base,
                "commit_sha": commit_sha,
                "title": payload["title"],
            }
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in {401, 403}:
            raise RuntimeError("github_write_permission_required") from exc
        raise RuntimeError("github_pull_request_publish_failed") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError("github_pull_request_request_failed") from exc
