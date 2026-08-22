from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth_middleware import AuthContext, require_auth
from app.routes import chat


def test_chat_stream_http_shape(monkeypatch):
    app = FastAPI()
    app.include_router(chat.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-1"})

    async def fake_stream(**_kwargs):
        yield "data: {\"type\":\"done\",\"content\":\"ok\"}\n\n"

    monkeypatch.setattr(
        chat,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )
    monkeypatch.setattr(chat, "_chat_event_stream", fake_stream)
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/chat/stream",
        json={
            "question": "What is Kontext?",
            "conversation_id": "conv-1",
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "data: " in response.text
    assert '"type":"done"' in response.text


def test_chat_stream_rejects_missing_openrouter_key(monkeypatch):
    app = FastAPI()
    app.include_router(chat.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-1"})

    monkeypatch.setattr(
        chat,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": ""})(),
    )
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.post(
        "/api/chat/stream",
        json={
            "question": "What is Kontext?",
            "conversation_id": "conv-1",
        },
    )

    assert response.status_code == 400
    assert "OPENROUTER_API_KEY missing" in response.json()["detail"]
