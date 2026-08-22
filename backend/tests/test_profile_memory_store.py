from types import SimpleNamespace

from services.memory_store import (
    _db_path,
    get_profile_memories,
    init_memory_store,
    maybe_store_profile_memory,
    sync_account_profile_memories,
)


def test_relative_memory_path_is_independent_of_working_directory(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.chdir(tmp_path)
    resolved = _db_path(SimpleNamespace(memory_db_path="backend/data/memory.db"))
    assert resolved.is_absolute()
    assert resolved.parts[-3:] == ("backend", "data", "memory.db")


def test_only_explicit_user_declarations_become_profile_memory(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)

    maybe_store_profile_memory(
        settings,
        user_id="user-1",
        doc_id="general",
        question="Who is Ada Lovelace?",
        answer="Ada was a mathematician.",
    )
    assert get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    ) == []

    maybe_store_profile_memory(
        settings,
        user_id="user-1",
        doc_id="general",
        question="My role is platform engineer.",
        answer="Thanks, I will remember that.",
    )
    memories = get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    )
    assert memories[0]["content"] == "My role is platform engineer."
    assert memories[0]["source"] == "user-declared"


def test_explicit_company_declaration_uses_company_key(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)
    maybe_store_profile_memory(
        settings,
        user_id="user-1",
        doc_id="general",
        question="My company is KONTEXT Labs.",
        answer="Saved.",
    )
    memories = get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    )
    assert memories[0]["key"] == "company"
    assert memories[0]["content"] == "My company is KONTEXT Labs."


def test_role_declaration_without_is_uses_role_key(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)
    maybe_store_profile_memory(
        settings,
        user_id="user-1",
        doc_id="general",
        question=(
            "my role build full-stack software with a strong bias toward practical AI systems."
        ),
        answer="Saved.",
    )
    memories = get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    )
    assert memories[0]["key"] == "role"


def test_account_profile_fields_sync_into_general_memory(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)

    sync_account_profile_memories(
        settings,
        user_id="user-1",
        profile={
            "full_name": "Aman Sagar",
            "username": "aman",
            "company": "KONTEXT Labs",
            "bio": "",
        },
    )

    memories = get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    )
    by_key = {item["key"]: item for item in memories}
    assert by_key["account_full_name"]["content"] == "Aman Sagar"
    assert by_key["account_company"]["content"] == "KONTEXT Labs"
    assert by_key["account_company"]["source"] == "account-profile"
    assert by_key["account_username"]["content"] == "aman"

    sync_account_profile_memories(
        settings,
        user_id="user-1",
        profile={"full_name": "Aman Sagar", "username": "aman", "company": None},
    )
    memories = get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    )
    assert "account_company" not in {item["key"] for item in memories}


def test_equal_username_and_full_name_are_deduplicated(tmp_path) -> None:
    settings = SimpleNamespace(memory_db_path=str(tmp_path / "memory.db"))
    init_memory_store(settings)

    sync_account_profile_memories(
        settings,
        user_id="user-1",
        profile={"full_name": "aman", "username": "Aman"},
    )

    memories = get_profile_memories(
        settings, user_id="user-1", doc_id="general", limit=10
    )
    assert [(item["key"], item["content"]) for item in memories] == [
        ("account_full_name", "aman")
    ]
