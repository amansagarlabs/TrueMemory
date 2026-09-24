from types import SimpleNamespace

import pytest

from services.memory_core import MemoryAuthorization, MemoryClient, MemoryOperationContext, MemoryScope, PostgresProfileMemoryRepository
from services.memory_store import init_memory_store


def test_memory_client_uses_core_for_crud(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)
    client = MemoryClient(settings)

    client.remember(user_id="user-a", key="role", content="Software engineer")
    assert client.search(user_id="user-a", query="role")[0]["content"] == "Software engineer"
    assert client.update(user_id="user-a", key="role", content="Platform engineer")
    assert client.forget(user_id="user-a", key="role")
    assert client.search(user_id="user-a", query="role") == []


def test_scope_rejects_missing_user() -> None:
    context = MemoryOperationContext(scope=MemoryScope())
    with pytest.raises(PermissionError, match="memory_user_required"):
        MemoryAuthorization.check(context)


def test_scope_rejects_cross_user_assertion() -> None:
    context = MemoryOperationContext(scope=MemoryScope(user_id="user-a"))
    with pytest.raises(PermissionError, match="memory_user_forbidden"):
        MemoryAuthorization.assert_user(context, "user-b")


def test_memory_client_prefers_postgres_when_database_url_is_configured(monkeypatch) -> None:
    settings = SimpleNamespace(database_url="postgresql://example", memory_db_path="/unused")
    monkeypatch.setattr("services.memory_core.postgres_enabled", lambda _: True)
    client = MemoryClient(settings)
    assert isinstance(client.core.repository, PostgresProfileMemoryRepository)


def test_configured_postgres_skips_local_sqlite_initialization(monkeypatch, tmp_path) -> None:
    database_path = tmp_path / "must-not-create.sqlite"
    from services.memory_store import init_memory_store

    init_memory_store(SimpleNamespace(database_url="postgresql://example", memory_db_path=str(database_path)))
    assert not database_path.exists()


def test_postgres_profile_repository_never_silently_falls_back(monkeypatch) -> None:
    settings = SimpleNamespace(database_url="postgresql://example")
    monkeypatch.setattr("services.memory_core.postgres_enabled", lambda _: False)
    repository = PostgresProfileMemoryRepository(settings)
    with pytest.raises(RuntimeError, match="refusing to read a local profile-memory copy"):
        repository.list(user_id="user-a", scope="general", limit=10)
    with pytest.raises(RuntimeError, match="refusing to delete a local profile-memory copy"):
        repository.forget(user_id="user-a", scope="general", key="role")


def test_postgres_profile_repository_uses_composite_scope_identity(monkeypatch) -> None:
    from datetime import datetime, timezone

    from services.memory_core import PostgresProfileMemoryRepository

    now = datetime.now(timezone.utc)
    repository = PostgresProfileMemoryRepository(SimpleNamespace())
    row = {
        "profile_key": "role",
        "content": "Platform engineer",
        "source": "mcp",
        "updated_at": now,
        "valid_from": None,
        "valid_until": None,
        "confidence_score": 0.9,
        "revision": 2,
    }
    item = repository._item(row, "general|workspace:abc|agent:def")
    assert item["id"] == "profile:general|workspace:abc|agent:def:role"
    assert item["revision"] == 2
    assert item["confidence"] == 0.9
