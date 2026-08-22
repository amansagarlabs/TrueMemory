from app.routes.chat import (
    _account_profile_memories,
    _context_routing_mode,
    _current_role_declaration,
    _memory_scope_instruction,
    _profile_memory_answer,
    _profile_memory_question,
    _recent_role_memory,
    _safe_profile_memories,
    _selected_memory_ids,
    _workspace_knowledge_query,
)
from query.models import QueryMode


def test_memory_mentions_are_read_as_scope_metadata() -> None:
    mentions = [
        {"kind": "memory", "id": "workspace-memory", "label": "Workspace knowledge"},
        {"kind": "connectors", "id": "github", "label": "GitHub"},
    ]

    assert _selected_memory_ids(mentions) == {"workspace-memory"}
    instruction = _memory_scope_instruction({"workspace-memory"})
    assert instruction is not None
    assert "curated workspace knowledge" in instruction
    assert "not text from the user" in instruction


def test_account_profile_memory_uses_allowlist_and_hides_secrets() -> None:
    memories = _account_profile_memories({
        "name": "Aman",
        "role": "developer",
        "email": "private@example.com",
        "password_hash": "secret",
    })
    assert {item["key"] for item in memories} == {"account_name", "account_role"}


def test_ambiguous_profile_reference_becomes_profile_summary_request() -> None:
    rewritten = _profile_memory_question("what is this", {"profile-memory"})
    assert rewritten.startswith("Summarize the relevant saved facts")
    assert _profile_memory_question("What is my role?", {"profile-memory"}) == "What is my role?"


def test_memory_scope_overrides_stale_web_mode() -> None:
    assert _context_routing_mode(
        QueryMode.SEARCH, {"profile-memory"}
    ) == QueryMode.MEMORY
    assert _context_routing_mode(QueryMode.SEARCH, set()) == QueryMode.SEARCH


def test_profile_summary_is_grounded_without_external_links() -> None:
    answer = _profile_memory_answer(
        "What is my profile?",
        {"profile-memory"},
        [
            {"key": "account_username", "content": "aman", "source": "account-profile"},
            {"key": "web:old", "content": "Google profile links", "source": "web_search"},
        ],
    )
    assert answer == "Here’s your saved KONTEXT profile:\n\n- **Username:** aman"
    assert "Google" not in answer


def test_empty_profile_summary_is_explicit() -> None:
    answer = _profile_memory_answer(
        "Who am I?", {"profile-memory"}, []
    )
    assert answer is not None
    assert "don’t have a name saved" in answer


def test_profile_company_question_never_falls_through_to_general_model() -> None:
    answer = _profile_memory_answer(
        "What is my company's name?", {"profile-memory"}, []
    )
    assert answer is not None
    assert "don’t have a company saved" in answer
    assert "Secretary of State" not in answer


def test_profile_company_question_returns_only_saved_company() -> None:
    answer = _profile_memory_answer(
        "Where do I work?",
        {"profile-memory"},
        [{"key": "account_company", "content": "KONTEXT Labs", "source": "account-profile"}],
    )
    assert answer == "Your saved company is **KONTEXT Labs**."

    declared_answer = _profile_memory_answer(
        "What is my company's name?",
        {"profile-memory"},
        [{"key": "company", "content": "My company is KONTEXT Labs.", "source": "user-declared"}],
    )
    assert declared_answer == "Your saved company is **KONTEXT Labs**."


def test_auto_professional_question_resolves_role_without_explicit_memory_mention() -> None:
    answer = _profile_memory_answer(
        "what i do? professionally",
        set(),
        [{"key": "account_role", "content": "Platform Engineer", "source": "account-profile"}],
        force_profile_route=True,
    )
    assert answer == "Your saved role is **Platform Engineer**."


def test_auto_professional_question_resolves_job_title_alias() -> None:
    answer = _profile_memory_answer(
        "what i do professionally",
        set(),
        [{"key": "account_job_title", "content": "Software Engineer", "source": "account-profile"}],
        force_profile_route=True,
    )
    assert answer == "Your saved role is **Software Engineer**."


def test_recent_role_declaration_is_recovered_from_user_history() -> None:
    memory = _recent_role_memory([
        {"role": "assistant", "content": "I do not know."},
        {
            "role": "user",
            "content": "my role build full-stack software with a strong bias toward practical AI systems.",
        },
    ])
    assert memory == {
        "key": "role",
        "content": "build full-stack software with a strong bias toward practical AI systems",
        "source": "conversation-memory",
    }


def test_current_role_declaration_is_available_same_turn() -> None:
    memory = _current_role_declaration("my role is software engineer")
    assert memory == {
        "key": "role",
        "content": "software engineer",
        "source": "conversation-memory",
    }
    assert _profile_memory_answer(
        "my role is software engineer",
        set(),
        [memory],
        force_profile_route=True,
    ) == "Your saved role is **software engineer**."


def test_internal_web_cache_never_appears_as_profile_memory() -> None:
    memories = _safe_profile_memories([
        {"key": "account_username", "content": "aman", "source": "account-profile"},
        {"key": "web:123", "content": '{"query":"internal"}', "source": "web_search"},
        {"key": "web:legacy", "content": "legacy cache", "source": "import"},
        {"key": "profile_summary", "content": "model output", "source": "chat-summary"},
    ])
    assert memories == [
        {"key": "account_username", "content": "aman", "source": "account-profile"}
    ]


def test_ambiguous_workspace_followup_uses_prior_user_topic() -> None:
    messages = [
        {"role": "user", "content": "Explain the Kontext retrieval architecture."},
        {"role": "assistant", "content": "It combines dense and BM25 retrieval."},
    ]

    query = _workspace_knowledge_query(
        "what is this",
        messages,
        {"workspace-memory"},
    )

    assert query.startswith("Explain the Kontext retrieval architecture.")
    assert query.endswith("Follow-up question: what is this")


def test_conversational_followup_uses_recent_chat_context() -> None:
    messages = [
        {"role": "user", "content": "hi whats my name"},
        {"role": "assistant", "content": "Your full name is Aman."},
    ]

    query = _workspace_knowledge_query(
        "can you change this name",
        messages,
        {"workspace-memory"},
    )

    assert query.startswith("hi whats my name")
    assert "Follow-up question: can you change this name" in query


def test_explicit_workspace_question_is_not_rewritten() -> None:
    question = "Which documents describe the retrieval architecture?"

    assert (
        _workspace_knowledge_query(
            question,
            [{"role": "user", "content": "An unrelated earlier topic"}],
            {"workspace-memory"},
        )
        == question
    )
