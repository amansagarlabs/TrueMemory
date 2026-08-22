from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth_middleware import AuthContext, require_auth
from app.routes import query


def test_query_stream_http_shape(monkeypatch):
    app = FastAPI()
    app.include_router(query.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-1"})

    async def fake_stream(**_kwargs):
        yield "data: {\"type\":\"done\",\"content\":\"ok\"}\n\n"

    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )
    monkeypatch.setattr(query, "_chat_event_stream", fake_stream)
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/v1/query/stream",
        json={"question": "What is Kontext?"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "data: " in response.text
    assert '"type":"done"' in response.text


def test_query_stream_http_rejects_missing_openrouter_key(monkeypatch):
    app = FastAPI()
    app.include_router(query.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-1"})

    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": ""})(),
    )
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/v1/query/stream",
        json={"question": "What is Kontext?"},
    )

    assert response.status_code == 400
    assert "OPENROUTER_API_KEY missing" in response.json()["detail"]


def test_query_stream_http_reports_stream_construction_failure(monkeypatch):
    app = FastAPI()
    app.include_router(query.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-1"})

    def fake_stream(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )
    monkeypatch.setattr(query, "_chat_event_stream", fake_stream)
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/v1/query/stream",
        json={"question": "What is Kontext?", "fast_mode": True},
    )

    assert response.status_code == 500
    assert "Query stream initialization failed" in response.json()["detail"]


def test_query_stream_http_emits_error_event_on_runtime_failure(monkeypatch):
    app = FastAPI()
    app.include_router(query.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-1"}, session_token="token-1")

    async def fake_stream(**_kwargs):
        yield "data: {\"type\":\"status\",\"message\":\"starting\"}\n\n"
        raise RuntimeError("boom")

    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )
    monkeypatch.setattr(query, "_chat_event_stream", fake_stream)
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/v1/query/stream",
        json={"question": "What is Kontext?"},
    )

    assert response.status_code == 200
    assert '"type": "error"' in response.text or '"type":"error"' in response.text
    assert "Query stream failed: boom" in response.text


def test_query_stream_http_accepts_live_chat_payload(monkeypatch):
    app = FastAPI()
    app.include_router(query.router)

    async def fake_require_auth():
        return AuthContext(
            authenticated=True,
            user={"id": "user-1", "plan": "free"},
            session_token="token-1",
        )

    captured = {}

    async def fake_stream(**kwargs):
        captured.update(kwargs)
        yield "data: {\"type\":\"done\",\"content\":\"ok\"}\n\n"

    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )
    monkeypatch.setattr(query, "_chat_event_stream", fake_stream)
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/v1/query/stream",
        json={
            "question": "hii",
            "conversation_id": "231bc99f-bfe5-4c11-8356-a58a5092daa4",
            "mode": "search",
            "chat_mode": "web-search",
            "selected_model": "openrouter-free",
            "workspace_id": "c03565ed-89b2-41b7-990b-4ddae8243186",
            "workspace_name": "1",
            "options": {
                "web_allowed": True,
                "citations_required": True,
                "max_results": 5,
                "approved_tool_calls": [],
            },
        },
    )

    assert response.status_code == 200
    assert captured["question"] == "hii"
    assert captured["workspace_name"] == "1"
    assert captured["chat_mode"] == "web-search"
    assert captured["selected_model"] == "openrouter-free"
    assert captured["workspace_id"] == "c03565ed-89b2-41b7-990b-4ddae8243186"
