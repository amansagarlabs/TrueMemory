from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth_middleware import AuthContext, get_auth_context
from app.routes import memory_mcp


def _client(monkeypatch):
    app = FastAPI()
    app.include_router(memory_mcp.router)

    async def fake_auth():
        return AuthContext(
            authenticated=True,
            user={"id": "mcp-user", "plan": "pro"},
            session_token="test-session",
            scopes=["memory"],
        )

    class AllowedLimiter:
        @staticmethod
        def check(_key):
            return {"allowed": True}

    monkeypatch.setattr(memory_mcp, "get_settings", lambda: type("Settings", (), {"cors_origins": ["https://client.example"], "memory_rate_limit": 100, "memory_rate_window_seconds": 60})())
    monkeypatch.setattr(memory_mcp, "get_rate_limiter", lambda *_args, **_kwargs: AllowedLimiter())
    app.dependency_overrides[get_auth_context] = fake_auth
    return TestClient(app)


def _modern_request(client, method, *, params=None, headers=None, protocol_version="2026-07-28"):
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": {
            **(params or {}),
            "_meta": {
                "io.modelcontextprotocol/protocolVersion": protocol_version,
                "io.modelcontextprotocol/clientCapabilities": {},
            },
        },
    }
    request_headers = {
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": protocol_version,
        "Mcp-Method": method,
        **(headers or {}),
    }
    return client.post("/mcp", json=body, headers=request_headers)


def test_modern_discovery_and_per_request_tool_list(monkeypatch):
    with _client(monkeypatch) as client:
        discovered = _modern_request(client, "server/discover")
        assert discovered.status_code == 200
        assert discovered.json()["result"]["supportedVersions"][0] == "2026-07-28"
        assert discovered.json()["result"]["resultType"] == "complete"
        assert discovered.json()["result"]["_meta"][memory_mcp.SERVER_INFO_META_KEY]["name"] == "truememory-memory"

        listed = _modern_request(client, "tools/list")
        assert listed.status_code == 200
        assert listed.json()["result"]["resultType"] == "complete"
        assert listed.json()["result"]["_meta"][memory_mcp.SERVER_INFO_META_KEY]["name"] == "truememory-memory"
        assert {tool["name"] for tool in listed.json()["result"]["tools"]} == {tool["name"] for tool in memory_mcp.TOOLS}
        assert listed.json()["result"]["ttlMs"] == 0
        assert listed.json()["result"]["cacheScope"] == "private"


def test_modern_transport_rejects_missing_or_mismatched_headers(monkeypatch):
    with _client(monkeypatch) as client:
        missing = client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {
                    "_meta": {
                        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                        "io.modelcontextprotocol/clientCapabilities": {},
                    }
                },
            },
            headers={"Accept": "application/json, text/event-stream"},
        )
        assert missing.status_code == 400
        assert missing.json()["error"]["code"] == -32020

        mismatch = _modern_request(client, "tools/list", headers={"Mcp-Method": "tools/call"})
        assert mismatch.status_code == 400
        assert mismatch.json()["error"]["code"] == -32020

        unsupported = _modern_request(
            client,
            "tools/list",
            protocol_version="2027-01-01",
        )
        assert unsupported.status_code == 400
        assert unsupported.json()["error"]["code"] == -32022
        assert unsupported.json()["error"]["data"]["supported"] == ["2026-07-28"]


def test_modern_tool_call_validates_name_header_and_calls_existing_memory_path(monkeypatch):
    calls = []
    monkeypatch.setattr(memory_mcp, "_call", lambda name, args, _auth: calls.append((name, args)) or {"ok": True})
    with _client(monkeypatch) as client:
        mismatch = _modern_request(client, "tools/call", params={"name": "memory_search", "arguments": {}})
        assert mismatch.status_code == 400
        assert mismatch.json()["error"]["code"] == -32020

        result = _modern_request(
            client,
            "tools/call",
            params={"name": "memory_search", "arguments": {"query": "test"}},
            headers={"Mcp-Name": "memory_search"},
        )
        assert result.status_code == 200
        assert result.json()["result"]["resultType"] == "complete"
        assert result.json()["result"]["structuredContent"] == {"ok": True}
        assert calls == [("memory_search", {"query": "test"})]


def test_legacy_initialize_remains_supported(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            headers={"Accept": "application/json"},
        )
        assert response.status_code == 200
        assert response.json()["result"]["protocolVersion"] == memory_mcp.LEGACY_PROTOCOL_VERSION
