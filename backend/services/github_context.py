"""Authorized GitHub repository context retrieval."""

from __future__ import annotations

import asyncio
import base64
import re
from typing import Any
from urllib.parse import quote

import httpx

from services.context_engine import ContextNode

_API = "https://api.github.com"
_REPOSITORY_RE = re.compile(r"^[^/\s]+/[^/\s]+$")
_MAX_TREE_ENTRIES = 5_000
_MAX_FILE_BYTES = 1_000_000


def _headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "KONTEXT-Context-Engine",
    }


def _validate_repository(repository: str) -> str:
    normalized = repository.strip()
    if not _REPOSITORY_RE.fullmatch(normalized):
        raise ValueError("invalid_github_repository")
    return normalized


def _validate_repository_path(path: str) -> str:
    normalized = path.strip().replace("\\", "/").lstrip("/")
    parts = normalized.split("/")
    if (
        not normalized
        or len(normalized) > 1_024
        or any(part in {"", ".", ".."} for part in parts)
    ):
        raise ValueError("invalid_github_path")
    return normalized


def _rank_repositories(repositories: list[dict[str, Any]], question: str) -> list[dict[str, Any]]:
    terms = {part.casefold() for part in re.findall(r"[a-z0-9][a-z0-9_.-]+", question)}
    recently_updated = sorted(
        repositories,
        key=lambda repo: str(repo.get("updated_at") or ""),
        reverse=True,
    )
    return sorted(
        recently_updated,
        key=lambda repo: -len(
            terms
            & {
                part.casefold()
                for part in re.findall(
                    r"[a-z0-9][a-z0-9_.-]+",
                    f"{repo.get('name', '')} {repo.get('description', '')}",
                )
            }
        ),
    )


async def search_github_repositories(
    *,
    token: str,
    query: str = "",
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return searchable repositories without exposing the GitHub token."""
    if not token.strip():
        raise RuntimeError("github_not_configured")
    timeout = httpx.Timeout(8.0, connect=4.0)
    async with httpx.AsyncClient(
        base_url=_API,
        headers=_headers(token),
        timeout=timeout,
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/user/repos",
            params={
                "affiliation": "owner,collaborator,organization_member",
                "sort": "updated",
                "direction": "desc",
                "per_page": min(max(limit * 2, 20), 100),
            },
        )
        response.raise_for_status()
        repositories = response.json()
        if not isinstance(repositories, list):
            return []
        return [
            {
                "id": str(repo.get("full_name") or repo.get("id") or ""),
                "full_name": str(repo.get("full_name") or ""),
                "name": str(repo.get("name") or ""),
                "description": str(repo.get("description") or ""),
                "html_url": str(repo.get("html_url") or ""),
                "updated_at": str(repo.get("updated_at") or ""),
                "visibility": str(repo.get("visibility") or ""),
                "language": str(repo.get("language") or ""),
                "default_branch": str(repo.get("default_branch") or "main"),
            }
            for repo in _rank_repositories(repositories, query)
            if repo.get("full_name")
        ][: max(1, min(limit, 50))]


async def retrieve_github_repository_tree(
    *,
    token: str,
    repository: str,
    ref: str | None = None,
    max_entries: int = _MAX_TREE_ENTRIES,
) -> dict[str, Any]:
    """Return a bounded recursive repository tree for the connected account."""
    if not token.strip():
        raise RuntimeError("github_not_configured")
    repository = _validate_repository(repository)
    timeout = httpx.Timeout(12.0, connect=4.0)
    async with httpx.AsyncClient(
        base_url=_API,
        headers=_headers(token),
        timeout=timeout,
        follow_redirects=False,
    ) as client:
        repo_response = await client.get(f"/repos/{repository}")
        if repo_response.status_code == 404:
            raise ValueError("github_repository_not_found")
        repo_response.raise_for_status()
        repo = repo_response.json()
        resolved_ref = str(ref or repo.get("default_branch") or "main").strip()
        if not resolved_ref or len(resolved_ref) > 255:
            raise ValueError("invalid_github_ref")

        tree_response = await client.get(
            f"/repos/{repository}/git/trees/{quote(resolved_ref, safe='')}",
            params={"recursive": "1"},
        )
        if tree_response.status_code == 404:
            raise ValueError("github_ref_not_found")
        if tree_response.status_code == 409:
            detail = tree_response.json() if tree_response.content else {}
            message = str(detail.get("message") or "").lower() if isinstance(detail, dict) else ""
            if "empty" in message:
                return {
                    "repository": repository,
                    "ref": resolved_ref,
                    "sha": "",
                    "truncated": False,
                    "entries": [],
                    "empty": True,
                }
        tree_response.raise_for_status()
        payload = tree_response.json()
        raw_entries = payload.get("tree", []) if isinstance(payload, dict) else []
        limit = max(1, min(max_entries, _MAX_TREE_ENTRIES))
        entries = []
        for item in raw_entries:
            if not isinstance(item, dict) or item.get("type") not in {"blob", "tree"}:
                continue
            path = str(item.get("path") or "").strip()
            if not path:
                continue
            entries.append(
                {
                    "path": path,
                    "type": str(item.get("type")),
                    "sha": str(item.get("sha") or ""),
                    "size": int(item.get("size") or 0),
                    "mode": str(item.get("mode") or ""),
                }
            )
            if len(entries) >= limit:
                break

        return {
            "repository": repository,
            "ref": resolved_ref,
            "sha": str(payload.get("sha") or "") if isinstance(payload, dict) else "",
            "truncated": bool(
                (payload.get("truncated") if isinstance(payload, dict) else False)
                or len(entries) < len(raw_entries)
            ),
            "entries": entries,
            "empty": False,
        }


async def retrieve_github_repository_file(
    *,
    token: str,
    repository: str,
    path: str,
    ref: str | None = None,
) -> dict[str, Any]:
    """Return one bounded UTF-8 text file from an authorized repository."""
    if not token.strip():
        raise RuntimeError("github_not_configured")
    repository = _validate_repository(repository)
    normalized_path = _validate_repository_path(path)
    timeout = httpx.Timeout(12.0, connect=4.0)
    async with httpx.AsyncClient(
        base_url=_API,
        headers=_headers(token),
        timeout=timeout,
        follow_redirects=False,
    ) as client:
        response = await client.get(
            f"/repos/{repository}/contents/{quote(normalized_path, safe='/')}",
            params={"ref": ref} if ref else None,
        )
        if response.status_code == 404:
            raise ValueError("github_file_not_found")
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or payload.get("type") != "file":
            raise ValueError("github_path_is_not_file")
        size = int(payload.get("size") or 0)
        if size > _MAX_FILE_BYTES:
            raise OverflowError("github_file_too_large")
        if payload.get("encoding") != "base64":
            raise ValueError("github_file_encoding_unsupported")
        try:
            content_bytes = base64.b64decode(
                str(payload.get("content") or "").replace("\n", ""),
                validate=True,
            )
        except (ValueError, base64.binascii.Error) as exc:
            raise ValueError("github_file_invalid_content") from exc
        if len(content_bytes) > _MAX_FILE_BYTES:
            raise OverflowError("github_file_too_large")
        if b"\x00" in content_bytes:
            raise ValueError("github_binary_file")
        return {
            "repository": repository,
            "ref": str(ref or ""),
            "path": normalized_path,
            "sha": str(payload.get("sha") or ""),
            "size": len(content_bytes),
            "html_url": str(payload.get("html_url") or ""),
            "content": content_bytes.decode("utf-8", errors="replace"),
        }


async def retrieve_github_repository_context(
    *,
    token: str,
    repository: str,
    question: str,
    source_id: str,
    limit: int = 4,
) -> list[ContextNode]:
    """Resolve a repository into root, file, issue, and pull-request nodes."""
    if not token.strip():
        raise RuntimeError("github_not_configured")
    if not _REPOSITORY_RE.match(repository):
        raise ValueError("invalid_github_repository")

    timeout = httpx.Timeout(8.0, connect=4.0)
    async with httpx.AsyncClient(
        base_url=_API,
        headers=_headers(token),
        timeout=timeout,
        follow_redirects=False,
    ) as client:
        async def get_json(path: str, **kwargs: Any) -> Any:
            response = await client.get(path, **kwargs)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()

        async def get_readme(path: str) -> str:
            response = await client.get(
                path,
                headers={"Accept": "application/vnd.github.raw+json"},
            )
            if response.status_code == 404:
                return ""
            response.raise_for_status()
            # GitHub may return either raw markdown or the normal base64 JSON
            # envelope depending on the installation/proxy.
            content_type = response.headers.get("content-type", "")
            if "json" in content_type:
                try:
                    payload = response.json()
                except ValueError:
                    return response.text
                encoded = str(payload.get("content") or "").replace("\n", "")
                try:
                    return base64.b64decode(encoded).decode("utf-8", errors="replace")
                except (ValueError, base64.binascii.Error):
                    return ""
            return response.text

        repo = await get_json(f"/repos/{repository}")
        if not isinstance(repo, dict):
            return []
        readme_task = get_readme(f"/repos/{repository}/readme")
        issues_task = get_json(
            f"/repos/{repository}/issues",
            params={"state": "open", "per_page": min(max(limit * 2, 6), 20)},
        )
        pulls_task = get_json(
            f"/repos/{repository}/pulls",
            params={"state": "open", "per_page": min(max(limit * 2, 6), 20)},
        )
        tree_task = get_json(
            f"/repos/{repository}/git/trees/{repo.get('default_branch') or 'main'}",
            params={"recursive": "1"},
        )
        readme, issues, pulls, tree = await asyncio.gather(
            readme_task, issues_task, pulls_task, tree_task
        )

        readme_text = str(readme or "")[:6000]

        root_id = f"github-repository:{repository}"
        root_content = "\n\n".join(
            part for part in [
                str(repo.get("description") or "").strip(),
                readme_text.strip(),
            ] if part
        ) or f"GitHub repository {repository}"
        nodes = [
            ContextNode(
                id=root_id,
                kind="github_repository",
                label=repository,
                content=root_content,
                source_id=source_id,
                score=1.0,
                metadata={
                    "root_kind": "github_repository",
                    "resource_type": "repository",
                    "canonical_uri": str(repo.get("html_url") or ""),
                    "default_branch": str(repo.get("default_branch") or "main"),
                },
            )
        ]

        issue_items = [
            item for item in (issues if isinstance(issues, list) else [])
            if isinstance(item, dict) and not item.get("pull_request")
        ][:limit]
        for index, issue in enumerate(issue_items):
            number = issue.get("number")
            nodes.append(ContextNode(
                id=f"github-issue:{repository}:{number}",
                kind="github_issue",
                label=f"#{number} {issue.get('title') or 'Issue'}",
                content=str(issue.get("body") or issue.get("title") or "").strip()[:5000],
                source_id=source_id,
                score=0.82 - index * 0.04,
                metadata={
                    "root_kind": "github_repository",
                    "resource_type": "issue",
                    "parent_id": root_id,
                    "relation": "contains_issue",
                    "url": str(issue.get("html_url") or ""),
                    "state": str(issue.get("state") or "open"),
                },
            ))

        async def pull_node(pull: dict[str, Any], index: int) -> ContextNode:
            number = pull.get("number")
            files = await get_json(
                f"/repos/{repository}/pulls/{number}/files",
                params={"per_page": 20},
            )
            file_lines = [
                f"{item.get('filename')}: {item.get('status')} (+{item.get('additions', 0)}/-{item.get('deletions', 0)})"
                for item in (files if isinstance(files, list) else [])
                if isinstance(item, dict)
            ]
            content = "\n".join(
                part for part in [
                    str(pull.get("body") or pull.get("title") or "").strip()[:3500],
                    "Changed files:\n" + "\n".join(file_lines[:20]) if file_lines else "",
                ] if part
            )
            return ContextNode(
                id=f"github-pull-request:{repository}:{number}",
                kind="github_pull_request",
                label=f"PR #{number} {pull.get('title') or 'Pull request'}",
                content=content,
                source_id=source_id,
                score=0.9 - index * 0.04,
                metadata={
                    "root_kind": "github_repository",
                    "resource_type": "pull_request",
                    "parent_id": root_id,
                    "relation": "contains_pull_request",
                    "url": str(pull.get("html_url") or ""),
                    "state": str(pull.get("state") or "open"),
                    "head": str((pull.get("head") or {}).get("ref") or ""),
                    "base": str((pull.get("base") or {}).get("ref") or ""),
                },
            )

        pull_items = [
            item for item in (pulls if isinstance(pulls, list) else [])
            if isinstance(item, dict)
        ][:limit]
        pull_nodes = await asyncio.gather(
            *(pull_node(pull, index) for index, pull in enumerate(pull_items))
        )
        nodes.extend(pull_nodes)

        terms = {
            part.casefold()
            for part in re.findall(r"[a-z0-9][a-z0-9_.-]+", question)
            if len(part) > 2
        }
        blobs = [
            item for item in ((tree or {}).get("tree", []) if isinstance(tree, dict) else [])
            if isinstance(item, dict) and item.get("type") == "blob"
        ]
        ranked_files = sorted(
            blobs,
            key=lambda item: (
                -len(terms & set(str(item.get("path") or "").casefold().split("/"))),
                len(str(item.get("path") or "")),
            ),
        )[:limit]
        for item in ranked_files:
            path = str(item.get("path") or "")
            file_data = await get_json(
                f"/repos/{repository}/contents/{path}",
                params={"ref": str(repo.get("default_branch") or "main")},
            )
            if not isinstance(file_data, dict) or file_data.get("encoding") != "base64":
                continue
            try:
                content = base64.b64decode(
                    str(file_data.get("content") or "").replace("\n", "")
                ).decode("utf-8", errors="replace")[:6000]
            except (ValueError, base64.binascii.Error):
                continue
            if not content.strip():
                continue
            nodes.append(ContextNode(
                id=f"github-file:{repository}:{path}",
                kind="github_file",
                label=path,
                content=content,
                source_id=source_id,
                score=0.86,
                metadata={
                    "root_kind": "github_repository",
                    "resource_type": "repository_file",
                    "parent_id": root_id,
                    "relation": "contains_file",
                    "path": path,
                    "url": str(file_data.get("html_url") or ""),
                },
            ))
        return nodes


async def retrieve_github_repositories(
    *,
    token: str,
    question: str,
    source_id: str,
    limit: int = 8,
) -> list[ContextNode]:
    if not token.strip():
        raise RuntimeError("github_not_configured")
    timeout = httpx.Timeout(8.0, connect=4.0)
    async with httpx.AsyncClient(
        base_url=_API,
        headers=_headers(token),
        timeout=timeout,
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/user/repos",
            params={
                "affiliation": "owner,collaborator,organization_member",
                "sort": "updated",
                "direction": "desc",
                "per_page": min(max(limit * 2, 10), 50),
            },
        )
        response.raise_for_status()
        repositories = response.json()
        if not isinstance(repositories, list):
            return []

        terms = {part.casefold() for part in question.split() if len(part) > 2}
        recently_updated = sorted(
            repositories,
            key=lambda repo: str(repo.get("updated_at") or ""),
            reverse=True,
        )
        ranked = sorted(
            recently_updated,
            key=lambda repo: (
                -len(
                    terms
                    & {
                        part.casefold()
                        for part in (
                            f"{repo.get('name', '')} {repo.get('description', '')}"
                        ).split()
                    }
                ),
            ),
        )[:limit]

        async def readme(repo: dict[str, Any]) -> str:
            full_name = str(repo.get("full_name") or "")
            if not full_name or "/" not in full_name:
                return ""
            try:
                readme_response = await client.get(
                    f"/repos/{full_name}/readme",
                    headers={"Accept": "application/vnd.github.raw+json"},
                )
                if readme_response.status_code == 200:
                    return readme_response.text[:6_000]
            except httpx.HTTPError:
                pass
            return ""

        readmes = await asyncio.gather(*(readme(repo) for repo in ranked))
        return [
            ContextNode(
                id=f"github:{repo.get('id') or repo.get('full_name')}",
                kind="github_repository",
                label=str(repo.get("full_name") or repo.get("name") or "Repository"),
                content="\n\n".join(
                    part
                    for part in [
                        str(repo.get("description") or "").strip(),
                        readmes[index].strip(),
                    ]
                    if part
                ),
                source_id=source_id,
                score=max(0.1, 1.0 - index * 0.08),
                metadata={
                    "canonical_uri": str(repo.get("html_url") or ""),
                    "freshness": str(repo.get("updated_at") or ""),
                    "visibility": str(repo.get("visibility") or ""),
                },
            )
            for index, repo in enumerate(ranked)
            if repo.get("full_name")
        ]
