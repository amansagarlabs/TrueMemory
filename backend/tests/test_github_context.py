import asyncio

import httpx

from services.github_context import (
    retrieve_github_repository_file,
    retrieve_github_repository_tree,
    retrieve_github_repositories,
    retrieve_github_repository_context,
    search_github_repositories,
)


def test_github_repository_context_is_authorized_and_canonical(monkeypatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret"
        if request.url.path == "/user/repos":
            return httpx.Response(200, json=[{
                "id": 7,
                "name": "kontext",
                "full_name": "aman/kontext",
                "description": "Context engine",
                "html_url": "https://github.com/aman/kontext",
                "updated_at": "2026-07-24T00:00:00Z",
                "visibility": "private",
            }])
        return httpx.Response(200, text="# Kontext\nMention retrieval")

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    nodes = asyncio.run(retrieve_github_repositories(
        token="secret",
        question="kontext context",
        source_id="github-repositories",
    ))
    assert nodes[0].label == "aman/kontext"
    assert "Mention retrieval" in nodes[0].content
    assert nodes[0].metadata["visibility"] == "private"


def test_github_provider_requires_server_side_token() -> None:
    try:
        asyncio.run(retrieve_github_repositories(
            token="", question="anything", source_id="github"
        ))
    except RuntimeError as exc:
        assert str(exc) == "github_not_configured"
    else:
        raise AssertionError("missing GitHub token must fail closed")


def test_search_and_repository_context_resolve_code_issues_and_pull_requests(monkeypatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret"
        path = request.url.path
        if path == "/user/repos":
            return httpx.Response(200, json=[{
                "id": 7,
                "name": "kontext",
                "full_name": "aman/kontext",
                "description": "Context engine",
                "html_url": "https://github.com/aman/kontext",
                "updated_at": "2026-07-24T00:00:00Z",
                "visibility": "private",
                "language": "Python",
                "default_branch": "main",
            }])
        if path == "/repos/aman/kontext":
            return httpx.Response(200, json={
                "description": "Context engine",
                "html_url": "https://github.com/aman/kontext",
                "default_branch": "main",
            })
        if path == "/repos/aman/kontext/readme":
            return httpx.Response(200, text="# Kontext\nRepository overview")
        if path == "/repos/aman/kontext/issues":
            return httpx.Response(200, json=[{
                "number": 4,
                "title": "Improve retrieval",
                "body": "Add better ranking",
                "html_url": "https://github.com/aman/kontext/issues/4",
                "state": "open",
            }])
        if path == "/repos/aman/kontext/pulls":
            return httpx.Response(200, json=[{
                "number": 8,
                "title": "Add GitHub context",
                "body": "Resolve repository files",
                "html_url": "https://github.com/aman/kontext/pull/8",
                "state": "open",
                "head": {"ref": "feature/github"},
                "base": {"ref": "main"},
            }])
        if path == "/repos/aman/kontext/pulls/8/files":
            return httpx.Response(200, json=[{
                "filename": "backend/services/github_context.py",
                "status": "modified",
                "additions": 20,
                "deletions": 3,
            }])
        if path == "/repos/aman/kontext/git/trees/main":
            return httpx.Response(200, json={"tree": [{"path": "backend/services/github_context.py", "type": "blob"}]})
        if path == "/repos/aman/kontext/contents/backend/services/github_context.py":
            import base64
            return httpx.Response(200, json={
                "encoding": "base64",
                "content": base64.b64encode(b"def retrieve_context():\n    return []").decode(),
                "html_url": "https://github.com/aman/kontext/blob/main/backend/services/github_context.py",
            })
        return httpx.Response(404)

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    repositories = asyncio.run(search_github_repositories(token="secret", query="kontext"))
    assert repositories[0]["full_name"] == "aman/kontext"
    nodes = asyncio.run(retrieve_github_repository_context(
        token="secret",
        repository="aman/kontext",
        question="review retrieval code",
        source_id="aman/kontext",
    ))
    kinds = {node.kind for node in nodes}
    assert {"github_repository", "github_file", "github_issue", "github_pull_request"} <= kinds
    pull = next(node for node in nodes if node.kind == "github_pull_request")
    assert "github_context.py" in pull.content
    file_node = next(node for node in nodes if node.kind == "github_file")
    assert file_node.metadata["parent_id"] == nodes[0].id


def test_repository_tree_and_file_content_are_bounded_and_authorized(monkeypatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer secret"
        path = request.url.path
        if path == "/repos/aman/kontext":
            return httpx.Response(200, json={"default_branch": "main"})
        if path == "/repos/aman/kontext/git/trees/main":
            assert request.url.params["recursive"] == "1"
            return httpx.Response(
                200,
                json={
                    "sha": "tree-sha",
                    "truncated": False,
                    "tree": [
                        {"path": "src", "type": "tree", "sha": "dir-sha", "mode": "040000"},
                        {
                            "path": "src/app.ts",
                            "type": "blob",
                            "sha": "file-sha",
                            "size": 24,
                            "mode": "100644",
                        },
                    ],
                },
            )
        if path == "/repos/aman/kontext/contents/src/app.ts":
            import base64

            return httpx.Response(
                200,
                json={
                    "type": "file",
                    "encoding": "base64",
                    "content": base64.b64encode(b"export const ready = true;").decode(),
                    "sha": "file-sha",
                    "size": 26,
                    "html_url": "https://github.com/aman/kontext/blob/main/src/app.ts",
                },
            )
        return httpx.Response(404)

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    tree = asyncio.run(
        retrieve_github_repository_tree(
            token="secret",
            repository="aman/kontext",
        )
    )
    assert tree["ref"] == "main"
    assert [entry["path"] for entry in tree["entries"]] == ["src", "src/app.ts"]

    file = asyncio.run(
        retrieve_github_repository_file(
            token="secret",
            repository="aman/kontext",
            path="src/app.ts",
            ref="main",
        )
    )
    assert file["content"] == "export const ready = true;"
    assert file["sha"] == "file-sha"


def test_empty_repository_is_a_valid_connected_source(monkeypatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/repos/aman/empty":
            return httpx.Response(200, json={"default_branch": "main"})
        if request.url.path == "/repos/aman/empty/git/trees/main":
            return httpx.Response(409, json={"message": "Git Repository is empty."})
        return httpx.Response(404)

    original_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    tree = asyncio.run(
        retrieve_github_repository_tree(
            token="secret",
            repository="aman/empty",
        )
    )

    assert tree["empty"] is True
    assert tree["entries"] == []
    assert tree["ref"] == "main"


def test_repository_file_rejects_path_traversal() -> None:
    try:
        asyncio.run(
            retrieve_github_repository_file(
                token="secret",
                repository="aman/kontext",
                path="../secret.env",
            )
        )
    except ValueError as exc:
        assert str(exc) == "invalid_github_path"
    else:
        raise AssertionError("repository paths must fail closed")
