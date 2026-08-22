from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

from services.memory_core import MemoryClient
from services.memory_hot_cache import HotMemoryCache
from services.memory_store import init_memory_store


def _client(tmp_path) -> MemoryClient:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)
    return MemoryClient(settings)


def test_l0_hit_and_write_invalidation(tmp_path) -> None:
    client = _client(tmp_path)
    client.remember(user_id="user-a", key="role", content="Software engineer")

    assert client.list(user_id="user-a")[0]["content"] == "Software engineer"
    first_metrics = client.cache_metrics()
    assert first_metrics["misses"] >= 1

    assert client.list(user_id="user-a")[0]["content"] == "Software engineer"
    assert client.cache_metrics()["hits"] >= 1

    assert client.update(user_id="user-a", key="role", content="Platform engineer")
    assert client.list(user_id="user-a")[0]["content"] == "Platform engineer"

    assert client.forget(user_id="user-a", key="role")
    assert client.list(user_id="user-a") == []


def test_l0_isolates_users_and_scopes(tmp_path) -> None:
    client = _client(tmp_path)
    client.remember(user_id="user-a", key="role", content="A role")
    client.remember(user_id="user-a", scope="workspace:w-a", key="role", content="A workspace role")
    client.remember(user_id="user-b", key="role", content="B role")

    assert client.search(user_id="user-a", query="role")[0]["content"] == "A role"
    assert client.search(user_id="user-b", query="role")[0]["content"] == "B role"
    assert client.list(user_id="user-a", scope="workspace:w-a")[0]["content"] == "A workspace role"
    assert client.list(user_id="user-a", scope="workspace:w-b") == []


def test_l0_concurrent_reads_return_consistent_memory(tmp_path) -> None:
    client = _client(tmp_path)
    client.remember(user_id="user-a", key="goal", content="Ship Memory Core")

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: client.search(user_id="user-a", query="goal"), range(32)))

    assert all(result[0]["content"] == "Ship Memory Core" for result in results)


def test_temporal_revision_survives_l0_invalidation(tmp_path) -> None:
    client = _client(tmp_path)
    client.remember(
        user_id="user-a",
        key="database",
        content="PostgreSQL",
        valid_from="2026-01-01T00:00:00Z",
        confidence=0.8,
    )
    assert client.update(
        user_id="user-a",
        key="database",
        content="MongoDB",
        valid_from="2026-08-01T00:00:00Z",
        confidence=0.95,
    )
    item = client.search(user_id="user-a", query="database")[0]
    assert item["content"] == "MongoDB"
    assert item["revision"] == 2
    assert item["confidence"] == 0.95


def test_l0_ttl_and_bounded_size(monkeypatch) -> None:
    settings = SimpleNamespace(memory_db_path="memory.db")
    clock = {"value": 100.0}
    monkeypatch.setattr("services.memory_hot_cache.time.monotonic", lambda: clock["value"])
    cache = HotMemoryCache(settings, max_entries=16, ttl_seconds=1)

    for index in range(20):
        cache.set(f"user-a|general|fact:{index}", {"index": index})
    assert cache.metrics()["entries"] == 16
    assert cache.get("user-a|general|fact:19")["index"] == 19

    clock["value"] = 102.0
    assert cache.get("user-a|general|fact:19") is None


def test_concurrent_writes_and_deletes_invalidate_l0(tmp_path) -> None:
    client = _client(tmp_path)
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(
            executor.map(
                lambda index: client.remember(
                    user_id="user-a", key=f"goal-{index}", content=f"Goal {index}"
                ),
                range(12),
            )
        )
    assert len(client.list(user_id="user-a", limit=20)) == 12

    with ThreadPoolExecutor(max_workers=4) as executor:
        deleted = list(
            executor.map(
                lambda index: client.forget(user_id="user-a", key=f"goal-{index}"),
                range(12),
            )
        )
    assert all(deleted)
    assert client.list(user_id="user-a") == []
