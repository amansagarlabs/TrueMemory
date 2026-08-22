from asyncio import run
from uuid import NAMESPACE_URL, uuid5

from app.auth_middleware import AuthContext
from app.routes import chat


def test_conversation_messages_normalize_legacy_ids(monkeypatch) -> None:
    captured: dict[str, str] = {}

    monkeypatch.setattr(chat, "get_settings", lambda: object())
    monkeypatch.setattr(chat, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(chat, "resolve_user_id", lambda _settings, _user_id: "resolved-user")
    monkeypatch.setattr(
        chat,
        "load_conversation_messages",
        lambda _settings, user_id, conversation_id: captured.update(
            {"user_id": user_id, "conversation_id": conversation_id}
        )
        or [{"id": "message-1"}],
    )

    result = run(
        chat.conversation_messages(
            "chat-1",
            AuthContext(authenticated=True, user={"id": "user-1"}),
        )
    )

    assert result == {"items": [{"id": "message-1"}]}
    assert captured["user_id"] == "resolved-user"
    assert captured["conversation_id"] == str(
        uuid5(NAMESPACE_URL, "kontext:resolved-user:chat-1")
    )


def test_conversation_update_normalizes_legacy_ids(monkeypatch) -> None:
    captured: dict[str, str] = {}

    monkeypatch.setattr(chat, "get_settings", lambda: object())
    monkeypatch.setattr(chat, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(chat, "resolve_user_id", lambda _settings, _user_id: "resolved-user")
    monkeypatch.setattr(
        chat,
        "update_conversation",
        lambda _settings, conversation_id, user_id, action, title=None: captured.update(
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "action": action,
                "title": title or "",
            }
        )
        or {"id": conversation_id, "title": title or "Untitled"},
    )

    result = run(
        chat.conversation_update(
            "chat-1",
            chat.ConversationUpdateRequest(action="archive"),
            AuthContext(authenticated=True, user={"id": "user-1"}),
        )
    )

    assert result == {
        "item": {"id": str(uuid5(NAMESPACE_URL, "kontext:resolved-user:chat-1")), "title": "Untitled"}
    }
    assert captured["user_id"] == "resolved-user"
    assert captured["action"] == "archive"
    assert captured["conversation_id"] == str(
        uuid5(NAMESPACE_URL, "kontext:resolved-user:chat-1")
    )
