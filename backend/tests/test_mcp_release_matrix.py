"""Live MCP release matrix; run inside the backend container."""

from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from app.config import get_settings
from services.auth_store import create_api_token, create_user_with_password, revoke_api_token
from services.postgres_store import _connect


BASE = os.getenv("KONTEXT_RELEASE_BASE_URL", "http://127.0.0.1:8000")


def _request(path: str, *, token: str | None = None, method: str = "GET", body: dict | None = None, origin: str | None = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if origin:
        headers["Origin"] = origin
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    request = Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            return response.status, json.loads(response.read().decode())
    except HTTPError as exc:
        return exc.code, json.loads(exc.read().decode())


def _mcp(token: str | None, method: str, params: dict | None = None, *, origin: str | None = None):
    body = {"jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": method}
    if params is not None:
        body["params"] = params
    return _request("/mcp", token=token, method="POST", body=body, origin=origin)


def _call(token: str, name: str, arguments: dict):
    status, result = _mcp(token, "tools/call", {"name": name, "arguments": arguments})
    assert status == 200, result
    assert "error" not in result, result
    return result["result"]["structuredContent"]


def _identity(*, scopes: list[str], workspace_id: str, agent_id: str):
    settings = get_settings()
    user = create_user_with_password(
        settings,
        email=f"mcp-release-{uuid.uuid4().hex}@invalid.test",
        password=uuid.uuid4().hex,
        username=f"mcp_release_{uuid.uuid4().hex[:12]}",
        full_name="MCP Release Matrix",
    )
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO workspaces (id, owner_user_id, name, platform) VALUES (%s, %s, %s, 'Kontext Memory')", (workspace_id, user["id"], "MCP release matrix"))
        conn.commit()
    return user, create_api_token(settings, user_id=str(user["id"]), token_name="mcp-release-matrix", scopes=scopes, expires_days=1, tenant_id=str(uuid.uuid4()), workspace_id=workspace_id, agent_id=agent_id)


def _rest_store(token: str, key: str, content: str, workspace_id: str, agent_id: str):
    return _request("/v1/memories", token=token, method="POST", body={"key": key, "content": content, "source": "release-matrix", "workspace_id": workspace_id, "agent_id": agent_id})


def _rest_retrieve(token: str, query: str, workspace_id: str, agent_id: str):
    return _request("/v1/memories/retrieve", token=token, method="POST", body={"query": query, "limit": 20, "workspace_id": workspace_id, "agent_id": agent_id})


def _rest_metrics(token: str):
    return _request("/v1/memory/metrics", token=token)[1]["cache"]


def test_live_mcp_release_matrix():
    ws_a, ws_b = str(uuid.uuid4()), str(uuid.uuid4())
    agent_a, agent_b = str(uuid.uuid4()), str(uuid.uuid4())
    user_a, token_a = _identity(scopes=["memory"], workspace_id=ws_a, agent_id=agent_a)
    user_b, token_b = _identity(scopes=["memory"], workspace_id=ws_b, agent_id=agent_b)
    settings = get_settings()

    assert _mcp(token_a["token"], "tools/list")[0] == 200
    assert _mcp(None, "tools/list")[0] == 401
    assert _mcp("invalid-token", "tools/list")[0] == 401
    expired = create_api_token(settings, user_id=str(user_a["id"]), token_name="expired", scopes=["memory"], expires_days=-1, workspace_id=ws_a, agent_id=agent_a)
    assert _mcp(expired["token"], "tools/list")[0] == 401
    revoked = create_api_token(settings, user_id=str(user_a["id"]), token_name="revoked", scopes=["memory"], expires_days=1, workspace_id=ws_a, agent_id=agent_a)
    assert revoke_api_token(settings, user_id=str(user_a["id"]), token_id=str(revoked["id"]))
    assert _mcp(revoked["token"], "tools/list")[0] == 401
    no_scope = create_api_token(settings, user_id=str(user_a["id"]), token_name="no-scope", scopes=["artifacts"], expires_days=1, workspace_id=ws_a, agent_id=agent_a)
    assert _mcp(no_scope["token"], "tools/list")[0] == 403

    key = f"matrix-{uuid.uuid4().hex}"
    args = {"key": key, "content": "user-a secret", "workspace_id": ws_a, "agent_id": agent_a, "source": "matrix"}
    assert _call(token_a["token"], "memory_store", args)["saved"]
    assert _call(token_a["token"], "memory_retrieve", {"query": key, "workspace_id": ws_a, "agent_id": agent_a})["count"] >= 1
    assert _mcp(token_b["token"], "tools/call", {"name": "memory_retrieve", "arguments": {"query": key, "workspace_id": ws_a, "agent_id": agent_a}})[0] == 403
    assert _mcp(token_a["token"], "tools/call", {"name": "memory_retrieve", "arguments": {"query": key, "workspace_id": ws_b, "agent_id": agent_a}})[0] == 403
    assert _mcp(token_a["token"], "tools/call", {"name": "memory_retrieve", "arguments": {"query": key, "workspace_id": ws_a, "agent_id": agent_b}})[0] == 403

    rest_key = f"rest-{uuid.uuid4().hex}"
    status, _ = _rest_store(token_a["token"], rest_key, "rest value", ws_a, agent_a)
    assert status == 200
    assert _call(token_a["token"], "memory_retrieve", {"query": rest_key, "workspace_id": ws_a, "agent_id": agent_a})["count"] >= 1
    mcp_key = f"mcp-{uuid.uuid4().hex}"
    _call(token_a["token"], "memory_store", {"key": mcp_key, "content": "mcp value", "workspace_id": ws_a, "agent_id": agent_a})
    assert _rest_retrieve(token_a["token"], mcp_key, ws_a, agent_a)[0] == 200
    update_key = f"update-{uuid.uuid4().hex}"
    assert _rest_store(token_a["token"], update_key, "before update", ws_a, agent_a)[0] == 200
    update_id = f"profile:workspace:{ws_a}:{update_key}"
    status, _ = _request("/v1/memories/update", token=token_a["token"], method="POST", body={"id": update_id, "content": "after REST update", "source": "rest-update", "workspace_id": ws_a, "agent_id": agent_a})
    assert status == 200
    assert _call(token_a["token"], "memory_retrieve", {"query": update_key, "workspace_id": ws_a, "agent_id": agent_a})["items"][0]["content"] == "after REST update"
    mcp_update_key = f"mcp-update-{uuid.uuid4().hex}"
    _call(token_a["token"], "memory_store", {"key": mcp_update_key, "content": "before MCP update", "workspace_id": ws_a, "agent_id": agent_a})
    mcp_update_id = f"profile:workspace:{ws_a}:{mcp_update_key}"
    _call(token_a["token"], "memory_update", {"id": mcp_update_id, "content": "after MCP update"})
    assert _rest_retrieve(token_a["token"], mcp_update_key, ws_a, agent_a)[1]["items"][0]["content"] == "after MCP update"
    rest_delete_key = f"rest-delete-{uuid.uuid4().hex}"
    _rest_store(token_a["token"], rest_delete_key, "delete me", ws_a, agent_a)
    _call(token_a["token"], "memory_retrieve", {"query": rest_delete_key, "workspace_id": ws_a, "agent_id": agent_a})
    cached_metrics = _rest_metrics(token_a["token"])
    rest_delete_id = f"profile:workspace:{ws_a}:{rest_delete_key}"
    status, _ = _request("/v1/memories/forget", token=token_a["token"], method="POST", body={"id": rest_delete_id, "workspace_id": ws_a, "agent_id": agent_a})
    assert status == 200
    assert _call(token_a["token"], "memory_retrieve", {"query": rest_delete_key, "workspace_id": ws_a, "agent_id": agent_a})["count"] == 0
    invalidated_metrics = _rest_metrics(token_a["token"])
    assert invalidated_metrics["invalidations"] > cached_metrics["invalidations"]
    assert _call(token_a["token"], "memory_search", {"query": rest_delete_key, "workspace_id": ws_a, "agent_id": agent_a})["count"] == 0
    assert _call(token_a["token"], "memory_context", {"query": rest_delete_key, "workspace_id": ws_a, "agent_id": agent_a})["count"] == 0
    mcp_delete_key = f"mcp-delete-{uuid.uuid4().hex}"
    _call(token_a["token"], "memory_store", {"key": mcp_delete_key, "content": "delete me", "workspace_id": ws_a, "agent_id": agent_a})
    _call(token_a["token"], "memory_forget", {"id": f"profile:workspace:{ws_a}:{mcp_delete_key}"})
    assert _rest_retrieve(token_a["token"], mcp_delete_key, ws_a, agent_a)[1]["count"] == 0
    search = _call(token_a["token"], "memory_search", {"query": key, "workspace_id": ws_a, "agent_id": agent_a})
    assert search["items"] and search["items"][0].get("retrieval_tier", "L1_structured") in {"L1_structured", "L2_hybrid"}
    rest_search = _request("/v1/memories/search", token=token_a["token"], method="POST", body={"query": key, "limit": 20, "workspace_id": ws_a, "agent_id": agent_a})
    assert rest_search[0] == 200 and rest_search[1]["count"] == search["count"]
    for name in ("memory_context", "memory_profile", "memory_entities"):
        result = _call(token_a["token"], name, {"query": key, "workspace_id": ws_a, "agent_id": agent_a})
        assert isinstance(result, dict)
    for name, path in (("memory_search", "/v1/memories/search"), ("memory_retrieve", "/v1/memories/retrieve")):
        assert _mcp(token_a["token"], "tools/call", {"name": name, "arguments": {"query": key, "workspace_id": ws_b, "agent_id": agent_a}})[0] == 403
        assert _request(path, token=token_a["token"], method="POST", body={"query": key, "workspace_id": ws_b, "agent_id": agent_a})[0] == 403

    temporal_key = f"database-preference-{uuid.uuid4().hex}"
    old = "2024-01-01T00:00:00+00:00"
    current = "2025-01-01T00:00:00+00:00"
    _call(token_a["token"], "memory_store", {"key": temporal_key, "content": "I use PostgreSQL.", "source": "old-source", "valid_from": old, "valid_until": current, "confidence": 0.4, "workspace_id": ws_a, "agent_id": agent_a})
    _call(token_a["token"], "memory_update", {"id": f"profile:workspace:{ws_a}:{temporal_key}", "content": "I moved this project to MongoDB.", "source": "new-source", "valid_from": current, "valid_until": "2030-01-01T00:00:00+00:00", "confidence": 0.95})
    now = _call(token_a["token"], "memory_retrieve", {"query": "MongoDB", "workspace_id": ws_a, "agent_id": agent_a})
    assert now["items"][0]["content"] == "I moved this project to MongoDB."
    assert now["items"][0]["confidence"] == 0.95 and now["items"][0]["revision"] == 2
    historical = _call(token_a["token"], "memory_retrieve", {"query": "PostgreSQL", "as_of": "2024-06-01T00:00:00+00:00", "include_history": True, "workspace_id": ws_a, "agent_id": agent_a})
    assert historical["items"][0]["content"] == "I use PostgreSQL."
    assert _mcp(token_a["token"], "tools/list", origin="https://evil.invalid")[0] == 403
    assert _mcp(token_a["token"], "tools/list", origin="http://localhost:3000")[0] == 200

    _, limited = _identity(scopes=["memory"], workspace_id=str(uuid.uuid4()), agent_id=str(uuid.uuid4()))
    settings.memory_rate_limit = 2
    settings.memory_rate_window_seconds = 60
    # The live service reads configured settings, so this verifies the normal
    # configured limiter without contaminating the primary identity matrix.
    first = _mcp(limited["token"], "tools/list")[0]
    assert first == 200
    for _ in range(max(250, int(getattr(settings, "memory_rate_limit", 120)) * 2 + 10)):
        status, _ = _mcp(limited["token"], "tools/list")
        if status == 429:
            break
    else:
        raise AssertionError("configured MCP rate limit was not reached")
