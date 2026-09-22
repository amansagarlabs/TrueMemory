from services.agentic_brain import WorkingMemory, WorkingMemoryItem, classify_semantic_state, create_episodic_evidence


def test_working_memory_is_budgeted_and_expires_by_eviction():
    memory = WorkingMemory(token_budget=5)
    memory.add(WorkingMemoryItem("old", token_estimate=3))
    memory.add(WorkingMemoryItem("new", token_estimate=3))
    assert [item.content for item in memory.items] == ["new"]


def test_episodic_evidence_is_not_semantic_truth():
    evidence = create_episodic_evidence("assistant said a value", source_type="assistant_message")
    state = classify_semantic_state(memory_type="fact", evidence_ids=[evidence.experience_id])
    assert evidence.source_type == "assistant_message"
    assert state["layer"] == "semantic"
    assert state["adaptive"] is False
