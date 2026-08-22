from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.auth_middleware import AuthContext, get_auth_context
from app.routes import memory_api
from memory_main import api
from services.memory_store import init_memory_store


def test_memory_api_isolation_and_crud(tmp_path, monkeypatch) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)
    monkeypatch.setattr(memory_api, "get_settings", lambda: settings)

    current_user = {"id": "user-a", "plan": "pro"}

    async def fake_auth():
        return AuthContext(
            authenticated=True,
            user=current_user,
            session_token="test-session",
            scopes=["memory"],
        )

    api.dependency_overrides[get_auth_context] = fake_auth
    try:
        with TestClient(api) as client:
            response = client.post(
                "/v1/memories",
                json={"key": "role", "content": "Software engineer"},
            )
            assert response.status_code == 200
            memory_id = "profile:general:role"

            assert client.get(f"/v1/memories/{memory_id}").json()["content"] == "Software engineer"
            assert client.patch(
                f"/v1/memories/{memory_id}",
                json={"id": memory_id, "content": "Platform engineer"},
            ).json()["updated"] is True
            assert client.post(
                "/v1/memories/search",
                json={"query": "Platform engineer"},
            ).json()["items"][0]["content"] == "Platform engineer"

            current_user["id"] = "user-b"
            assert client.get(f"/v1/memories/{memory_id}").status_code == 404
    finally:
        api.dependency_overrides.clear()


def test_memory_api_rejects_bound_workspace_mismatch(tmp_path, monkeypatch) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)

    async def fake_auth():
        return AuthContext(
            authenticated=True,
            user={"id": "user-a", "plan": "pro"},
            session_token="bound-token",
            scopes=["memory"],
            token_bindings={"workspace_id": "workspace-a"},
        )

    monkeypatch.setattr(memory_api, "get_settings", lambda: settings)
    api.dependency_overrides[get_auth_context] = fake_auth
    try:
        with TestClient(api) as client:
            response = client.post(
                "/v1/memories",
                json={
                    "key": "secret",
                    "content": "must stay isolated",
                    "workspace_id": "workspace-b",
                },
            )
            assert response.status_code == 403
    finally:
        api.dependency_overrides.clear()


def test_memory_api_returns_retryable_429_when_limit_is_exceeded(tmp_path, monkeypatch) -> None:
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        memory_rate_limit=1,
        memory_rate_window_seconds=60,
    )
    init_memory_store(settings)

    async def fake_auth():
        return AuthContext(
            authenticated=True,
            user={"id": "user-rate", "plan": "pro"},
            session_token="rate-token",
            scopes=["memory"],
        )

    monkeypatch.setattr(memory_api, "get_settings", lambda: settings)
    api.dependency_overrides[get_auth_context] = fake_auth
    try:
        with TestClient(api) as client:
            assert client.get("/v1/memories").status_code == 200
            response = client.get("/v1/memories")
            assert response.status_code == 429
            assert response.headers["retry-after"] == "60"
            assert response.json()["detail"]["error"] == "rate_limited"
    finally:
        api.dependency_overrides.clear()


def test_memory_api_reports_l2_tier_after_structured_miss(tmp_path, monkeypatch) -> None:
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        memory_l2_semantic_enabled=False,
        memory_l2_candidate_limit=20,
    )
    init_memory_store(settings)

    async def fake_auth():
        return AuthContext(
            authenticated=True,
            user={"id": "user-l2", "plan": "pro"},
            session_token="l2-token",
            scopes=["memory"],
        )

    monkeypatch.setattr(memory_api, "get_settings", lambda: settings)
    api.dependency_overrides[get_auth_context] = fake_auth
    try:
        with TestClient(api) as client:
            assert client.post(
                "/v1/memories",
                json={"key": "role", "content": "I build practical AI systems."},
            ).status_code == 200
            response = client.post(
                "/v1/memories/search",
                json={"query": "what do i professionally"},
            )
            assert response.status_code == 200
            assert response.json()["tier"] == "L2_hybrid"
    finally:
        api.dependency_overrides.clear()
