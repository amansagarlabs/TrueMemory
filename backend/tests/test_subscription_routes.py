from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth_middleware import AuthContext, require_auth
from app.routes import subscriptions


def test_api_usage_summary_returns_user_specific_usage(monkeypatch):
    app = FastAPI()
    app.include_router(subscriptions.router)

    async def fake_require_auth():
        return AuthContext(authenticated=True, user={"id": "user-123", "plan": "pro"})

    monkeypatch.setattr("app.config.get_settings", lambda: SimpleNamespace())
    monkeypatch.setattr(
        subscriptions,
        "get_usage_summary",
        lambda _settings, user_id: {
            "plan": "pro",
            "user_id": user_id,
            "usage": {"crawl:scrape": {"used": 11, "limit": 1000}},
        },
    )
    app.dependency_overrides[require_auth] = fake_require_auth

    client = TestClient(app)
    response = client.get("/api/subscriptions/usage")

    assert response.status_code == 200
    assert response.json() == {
        "plan": "pro",
        "user_id": "user-123",
        "usage": {"crawl:scrape": {"used": 11, "limit": 1000}},
    }
