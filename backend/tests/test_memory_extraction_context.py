from services.memory_extraction import extract_contextual_memories_sync


def test_short_answer_is_linked_to_recent_question():
    result = extract_contextual_memories_sync(
        "19", recent_messages=[{"role": "assistant", "content": "How old are you?"}]
    )
    assert any(c.content == "age = 19" and c.confidence >= 0.97 for c in result.candidates)


def test_bare_number_without_age_question_is_not_age_memory():
    result = extract_contextual_memories_sync(
        "19", recent_messages=[{"role": "assistant", "content": "How many files are there?"}]
    )
    assert not any("age" in c.content for c in result.candidates)


def test_explicit_build_number_is_not_age_memory():
    result = extract_contextual_memories_sync("The build generated 19 files.")
    assert not any("age" in c.content for c in result.candidates)


def test_negated_contextual_answer_is_not_positive_memory():
    result = extract_contextual_memories_sync(
        "I don't use PostgreSQL",
        recent_messages=[{"role": "assistant", "content": "Which database are you using?"}],
    )
    assert not result.candidates
