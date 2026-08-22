from types import SimpleNamespace

import pytest

from services.memory_core import MemoryAuthorization, MemoryClient, MemoryOperationContext, MemoryScope
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
