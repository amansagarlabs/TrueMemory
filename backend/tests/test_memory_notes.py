from services.memory_notes import extract_note_candidates, extract_note_relationships, render_memory_notes


def test_note_extracts_semantic_facts_not_whole_note():
    result = extract_note_candidates("My name is Aman. I'm 19. I prefer TypeScript. Context-OS uses PostgreSQL and Milvus.")
    contents = {item["content"] for item in result}
    assert "age = 19" in contents
    assert any("TypeScript" in content for content in contents)
    assert any("PostgreSQL" in content for content in contents)
    assert len(contents) > 1


def test_note_negation_does_not_create_positive_database_fact():
    assert not extract_note_candidates("I don't use MongoDB.")


def test_bare_number_is_ambiguous():
    assert not extract_note_candidates("19")


def test_note_candidates_are_deduplicated():
    result = extract_note_candidates("I'm 19. I'm 19.")
    assert [item["key"] for item in result].count("age") == 1


def test_note_resolves_multiple_named_subjects():
    result = extract_note_candidates("Aman is 19. Rahul is 24. Aman prefers TypeScript. Rahul prefers Python.")
    keys = {item["key"] for item in result}
    assert {"Aman.age", "Rahul.age", "Aman.preference.language", "Rahul.preference.language"} <= keys


def test_note_relationships_only_capture_explicit_uses_edges():
    result = extract_note_relationships("Context-OS uses PostgreSQL and Milvus.")
    assert {(item["from"], item["type"], item["to"]) for item in result} == {
        ("Context-OS", "uses", "PostgreSQL"), ("Context-OS", "uses", "Milvus")
    }


def test_human_notes_export_is_explicitly_lossy():
    notes = render_memory_notes([
        {"content": "age = 19"},
        {"content": "user.preference.language = TypeScript"},
        {"content": "project.database = PostgreSQL"},
    ])
    assert "I am 19 years old." in notes
    assert "I prefer TypeScript." in notes
    assert "The project database is PostgreSQL." in notes
