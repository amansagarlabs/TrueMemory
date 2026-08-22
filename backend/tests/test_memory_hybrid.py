from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import numpy as np

from services.memory_hybrid import MemoryHybridRetriever
from services.memory_core import MemoryClient
from services.memory_store import init_memory_store


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        embedding_model="test-model",
        memory_l2_semantic_enabled=True,
        memory_l2_rrf_k=60,
    )


def _fake_embeddings(texts: list[str], *, model_name: str) -> dict:
    del model_name
    vectors = []
    for text in texts:
        lowered = text.casefold()
        vectors.append(
            [
                1.0 if "mongo" in lowered or "database" in lowered else 0.0,
                1.0 if "python" in lowered or "language" in lowered else 0.0,
            ]
        )
    return {"vectors": np.asarray(vectors, dtype=np.float32)}


def test_l2_fuses_paths_and_deduplicates_current_revision(monkeypatch) -> None:
    monkeypatch.setattr("services.memory_hybrid.embed_texts", _fake_embeddings)
    retriever = MemoryHybridRetriever(_settings())
    records = [
        {
            "id": "old-db",
            "key": "database",
            "content": "I use PostgreSQL.",
            "revision": 1,
            "updated_at": "2026-01-01T00:00:00Z",
            "valid_until": "2026-08-01T00:00:00Z",
            "confidence": 0.7,
        },
        {
            "id": "current-db",
            "key": "database",
            "content": "I moved this project to MongoDB.",
            "revision": 2,
            "updated_at": "2026-08-01T00:00:00Z",
            "confidence": 0.95,
        },
        {
            "id": "language",
            "key": "language",
            "content": "Python is preferred.",
            "revision": 1,
            "updated_at": "2026-07-01T00:00:00Z",
            "confidence": 0.8,
        },
    ]

    results = retriever.search(records, scope="general", query="current database", limit=5)

    assert results[0]["id"] == "current-db"
    assert "lexical" in results[0]["retrieval_sources"]
    assert "semantic" in results[0]["retrieval_sources"]
    assert len([item for item in results if item["key"] == "database"]) == 1
    assert results[0]["retrieval_tier"] == "L2_hybrid"


def test_l2_historical_query_can_retrieve_superseded_fact(monkeypatch) -> None:
    monkeypatch.setattr("services.memory_hybrid.embed_texts", _fake_embeddings)
    retriever = MemoryHybridRetriever(_settings())
    records = [
        {
            "id": "old-db",
            "key": "database",
            "content": "I use PostgreSQL.",
            "revision": 1,
            "lifecycle_status": "superseded",
            "valid_until": "2026-08-01T00:00:00Z",
        },
        {
            "id": "current-db",
            "key": "database",
            "content": "I moved this project to MongoDB.",
            "revision": 2,
        },
    ]

    results = retriever.search(
        records,
        scope="general",
        query="historical database",
        limit=5,
        include_history=True,
    )

    assert {item["id"] for item in results} == {"old-db", "current-db"}


def test_l2_returns_lexical_results_when_embeddings_fail(monkeypatch) -> None:
    def fail_embeddings(*args, **kwargs):
        raise RuntimeError("embedding unavailable")

    monkeypatch.setattr("services.memory_hybrid.embed_texts", fail_embeddings)
    retriever = MemoryHybridRetriever(_settings())
    results = retriever.search(
        [{"id": "role", "key": "role", "content": "Software engineer"}],
        scope="general",
        query="software engineer",
        limit=5,
    )

    assert results[0]["id"] == "role"
    assert retriever.metrics()["errors"] == ["semantic:RuntimeError"]


def test_memory_client_escalates_l1_miss_to_l2(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("services.memory_hybrid.embed_texts", _fake_embeddings)
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        embedding_model="test-model",
        memory_l2_semantic_enabled=True,
        memory_l2_rrf_k=60,
        memory_l2_candidate_limit=50,
    )
    init_memory_store(settings)
    client = MemoryClient(settings)
    client.remember(
        user_id="user-a",
        key="role",
        content="I build practical AI systems.",
    )

    results = client.search(user_id="user-a", query="what do i do professionally", limit=5)

    assert results[0]["key"] == "role"
    assert results[0]["retrieval_tier"] == "L2_hybrid"


def test_l2_enforces_bound_workspace_before_retrieval(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)
    client = MemoryClient(settings)

    try:
        client.search_l2(
            user_id="user-a",
            workspace_id="workspace-b",
            token_bindings={"workspace_id": "workspace-a"},
            query="secret",
        )
    except PermissionError as exc:
        assert str(exc) == "memory_workspace_id_forbidden"
    else:  # pragma: no cover - assertion guard
        raise AssertionError("unauthorized L2 workspace query was allowed")


def test_l2_returns_empty_on_workspace_store_failure(monkeypatch, tmp_path) -> None:
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        database_url="postgresql://unavailable",
        embedding_model="test-model",
    )
    init_memory_store(settings)
    client = MemoryClient(settings)
    monkeypatch.setattr("services.memory_core.postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(
        "services.memory_core.list_workspace_memories",
        lambda *args, **kwargs: (_ for _ in ()).throw(ConnectionError("postgres down")),
    )

    assert client.search_l2(user_id="user-a", workspace_id="workspace-a", query="anything") == []


def test_hierarchy_does_not_return_expired_l1_memory(tmp_path, monkeypatch) -> None:
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        memory_l2_semantic_enabled=False,
        memory_l2_candidate_limit=20,
    )
    init_memory_store(settings)
    client = MemoryClient(settings)
    client.remember(
        user_id="user-a",
        key="database",
        content="Old database fact",
        valid_until="2020-01-01T00:00:00Z",
    )
    monkeypatch.setattr("services.memory_hybrid.embed_texts", lambda *args, **kwargs: {"vectors": np.zeros((len(args[0]), 2))})

    assert client.search(user_id="user-a", query="database", limit=5) == []


def test_l2_scopes_user_workspace_and_agent_namespaces(tmp_path) -> None:
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        memory_l2_semantic_enabled=False,
        memory_l2_candidate_limit=20,
    )
    init_memory_store(settings)
    client = MemoryClient(settings)
    client.remember(user_id="user-a", key="secret", content="user-a general fact")
    client.remember(user_id="user-b", key="secret", content="user-b general fact")
    client.remember(
        user_id="user-a",
        key="secret",
        content="workspace A fact",
        workspace_id="w-a",
    )
    client.remember(
        user_id="user-a",
        key="secret",
        content="workspace B fact",
        workspace_id="w-b",
    )
    client.remember(
        user_id="user-a",
        key="secret",
        content="agent A fact",
        agent_id="agent-a",
    )

    assert client.search_l2(user_id="user-a", query="secret")[0]["content"] == "user-a general fact"
    assert client.search_l2(user_id="user-b", query="secret")[0]["content"] == "user-b general fact"
    assert client.search_l2(user_id="user-a", workspace_id="w-a", query="secret")[0]["content"] == "workspace A fact"
    assert client.search_l2(user_id="user-a", workspace_id="w-b", query="secret")[0]["content"] == "workspace B fact"
    assert client.search_l2(user_id="user-a", agent_id="agent-a", query="secret")[0]["content"] == "agent A fact"
    assert client.search_l2(user_id="user-a", agent_id="agent-b", query="secret") == []


def test_l2_concurrent_reads_preserve_scope_isolation(tmp_path) -> None:
    settings = SimpleNamespace(
        memory_db_path=str(tmp_path / "memory.db"),
        memory_l2_semantic_enabled=False,
        memory_l2_candidate_limit=20,
    )
    init_memory_store(settings)
    client = MemoryClient(settings)
    for user_id in ("user-a", "user-b"):
        client.remember(user_id=user_id, key="role", content=f"{user_id} role")

    def read(user_id: str) -> str:
        return client.search_l2(user_id=user_id, query="role")[0]["content"]

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(read, ["user-a", "user-b"] * 16))

    assert results[::2] == ["user-a role"] * 16
    assert results[1::2] == ["user-b role"] * 16
