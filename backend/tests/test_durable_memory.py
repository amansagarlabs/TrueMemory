from services.durable_memory import extract_durable_memories, rank_durable_memories


def test_questions_are_not_saved_as_durable_memory() -> None:
    assert extract_durable_memories("What did we decide about the database?") == []


def test_declared_decision_is_extracted() -> None:
    memories = extract_durable_memories(
        "We decided to use PostgreSQL for durable workspace state."
    )

    assert len(memories) == 1
    assert memories[0].memory_type == "decision"
    assert memories[0].content == (
        "We decided to use PostgreSQL for durable workspace state."
    )
    assert memories[0].importance_score == 0.9


def test_preference_and_task_statements_are_classified() -> None:
    preference = extract_durable_memories("I prefer compact context previews.")
    task = extract_durable_memories("Our next task is to add memory provenance.")

    assert preference[0].memory_type == "preference"
    assert task[0].memory_type == "task_state"


def test_ranking_prioritizes_requested_memory_type() -> None:
    memories = [
        {
            "id": "task",
            "memory_type": "task_state",
            "memory_key": "task:1",
            "content": "Add PostgreSQL backups.",
            "importance_score": 0.95,
            "updated_at": "2026-07-24T10:00:00Z",
        },
        {
            "id": "decision",
            "memory_type": "decision",
            "memory_key": "decision:1",
            "content": "We decided to use PostgreSQL.",
            "importance_score": 0.75,
            "updated_at": "2026-07-24T09:00:00Z",
        },
    ]

    ranked = rank_durable_memories("What did we decide about PostgreSQL?", memories)

    assert ranked[0]["id"] == "decision"
