import asyncio
import base64

import httpx
import pytest

import services.github_publisher as publisher


def _response(method: str, path: str, payload: dict, status: int = 200):
    return httpx.Response(
        status,
        json=payload,
        request=httpx.Request(method, f"https://api.github.com{path}"),
    )


def test_publish_target_rejects_unsafe_branches() -> None:
    with pytest.raises(ValueError):
        publisher._validate_publish_target(
            "aman/kontext",
            "main",
            "../unsafe",
        )


def test_pull_request_uploads_reviewed_commit_without_runtime_network(
    monkeypatch,
) -> None:
    posted = []

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, path):
            if "/git/ref/heads/" in path:
                return _response("GET", path, {"object": {"sha": "base-sha"}})
            return _response("GET", path, {"tree": {"sha": "base-tree"}})

        async def post(self, path, json):
            posted.append((path, json))
            if path.endswith("/git/blobs"):
                return _response("POST", path, {"sha": "blob-sha"}, 201)
            if path.endswith("/git/trees"):
                return _response("POST", path, {"sha": "tree-sha"}, 201)
            if path.endswith("/git/commits"):
                return _response("POST", path, {"sha": "commit-sha"}, 201)
            if path.endswith("/git/refs"):
                return _response("POST", path, {"ref": json["ref"]}, 201)
            return _response(
                "POST",
                path,
                {
                    "number": 42,
                    "html_url": "https://github.com/aman/kontext/pull/42",
                    "title": json["title"],
                },
                201,
            )

    monkeypatch.setattr(
        publisher.httpx,
        "AsyncClient",
        lambda **_kwargs: FakeClient(),
    )
    result = asyncio.run(
        publisher.publish_pull_request(
            token="secret",
            repository="aman/kontext",
            base="main",
            branch="kontext/task-1",
            title="Fix app",
            body="Reviewed change",
            commit={
                "message": "Fix app",
                "changes": [
                    {
                        "path": "app.py",
                        "status": "changed",
                        "mode": "100644",
                        "content": b"print('ok')\n",
                    }
                ],
            },
        )
    )

    blob_payload = next(payload for path, payload in posted if path.endswith("/git/blobs"))
    assert base64.b64decode(blob_payload["content"]) == b"print('ok')\n"
    assert result["number"] == 42
    assert result["commit_sha"] == "commit-sha"
