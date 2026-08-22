from rag.prompt_builder import (
    build_chat_messages,
    build_coding_chat_messages,
    build_general_chat_messages,
)


def test_document_prompt_is_explicitly_scoped_to_retrieved_document() -> None:
    messages = build_chat_messages(
        "Summarize this file.",
        [{"chunk_index": 1, "page": 2, "text": "Only document fact."}],
        recent_messages=[{"role": "assistant", "content": "Unrelated memory."}],
        profile_memories=[{"key": "role", "content": "Unrelated profile fact."}],
    )

    system_prompt = messages[0]["content"]
    assert "only factual source" in system_prompt
    assert "workspace knowledge" in system_prompt
    assert "Only document fact." in messages[1]["content"]


def test_attachment_prompt_rejects_unrelated_workspace_context() -> None:
    messages = build_general_chat_messages(
        "Summarize the attached text.",
        scope_to_supplied_context=True,
    )

    system_prompt = messages[0]["content"]
    assert "use only that supplied material as factual evidence" in system_prompt
    assert "repository files" in system_prompt


def test_coding_prompt_uses_repository_docs_when_no_upload_is_present() -> None:
    messages = build_coding_chat_messages("Summarize the relevant project files.")

    system_prompt = messages[0]["content"]
    assert "has not uploaded or attached a file" in system_prompt
    assert "repository files and documentation" in system_prompt
    assert "clickable file" in system_prompt
