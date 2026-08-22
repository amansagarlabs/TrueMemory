from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.routes.chat import ChatRequest
from services import postgres_store


class _Cursor:
    def __init__(self):
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, statement, params=()):
        self.calls.append((statement, params))

    def fetchall(self):
        return []

    def fetchone(self):
        return None


class _Connection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def cursor(self):
        return self._cursor

    def commit(self):
        return None


def test_chat_request_accepts_uuid_workspace_and_rejects_invalid_id() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    request = ChatRequest(
        question="Continue the project",
        conversation_id="chat-1",
        workspace_id=workspace_id,
        workspace_name="Product",
        project_id=project_id,
    )
    assert request.workspace_id == workspace_id
    assert request.project_id == project_id

    with pytest.raises(ValidationError):
        ChatRequest(
            question="Continue the project",
            conversation_id="chat-1",
            workspace_id="not-a-workspace",
        )


def test_recent_conversations_are_filtered_by_workspace(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(
        postgres_store, "ensure_conversation_controls", lambda _settings: None
    )
    monkeypatch.setattr(
        postgres_store, "_connect", lambda _settings: _Connection(cursor)
    )

    workspace_id = str(uuid4())
    postgres_store.list_recent_conversations(
        object(),
        user_id="user-1",
        workspace_id=workspace_id,
    )

    statement, params = cursor.calls[-1]
    assert "c.workspace_id = %s" in statement
    assert "c.conversation_type = %s" in statement
    assert params == ("user-1", workspace_id, "artifact_chat", 12)


def test_recent_conversations_can_be_filtered_by_project(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(postgres_store, "ensure_conversation_controls", lambda _settings: None)
    monkeypatch.setattr(postgres_store, "_connect", lambda _settings: _Connection(cursor))

    project_id = str(uuid4())
    postgres_store.list_recent_conversations(
        object(),
        user_id="user-1",
        workspace_id="workspace-1",
        project_id=project_id,
    )

    statement, params = cursor.calls[-1]
    assert "c.project_id = %s" in statement
    assert "c.conversation_type = %s" in statement
    assert params == ("user-1", "workspace-1", project_id, "artifact_chat", 12)


def test_recent_artifacts_can_be_filtered_by_project(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(postgres_store, "_connect", lambda _settings: _Connection(cursor))

    project_id = str(uuid4())
    workspace_id = str(uuid4())
    postgres_store.list_recent_artifacts(
        object(),
        user_id="user-1",
        workspace_id=workspace_id,
        project_id=project_id,
    )

    statement, params = cursor.calls[-1]
    assert "workspace_id = %s" in statement
    assert "project_id = %s" in statement
    assert "%s::uuid IS NULL" in statement
    assert "workspace_id = %s::uuid" in statement
    assert "project_id = %s::uuid" in statement
    assert params == (
        "user-1",
        workspace_id,
        workspace_id,
        project_id,
        project_id,
        12,
    )


def test_new_conversation_is_assigned_to_workspace(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(
        postgres_store, "_connect", lambda _settings: _Connection(cursor)
    )

    workspace_id = str(uuid4())
    project_id = str(uuid4())
    postgres_store.ensure_conversation(
        object(),
        conversation_id=str(uuid4()),
        user_id="user-1",
        question="Continue the project",
        workspace_id=workspace_id,
        project_id=project_id,
    )

    statement, params = cursor.calls[-1]
    assert "workspace_id" in statement
    assert params[2] == workspace_id
    assert params[3] == project_id


def test_workspace_memory_query_can_be_scoped_to_project(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(postgres_store, "_connect", lambda _settings: _Connection(cursor))

    project_id = str(uuid4())
    postgres_store.list_workspace_memories(
        object(),
        user_id="user-1",
        workspace_id="workspace-1",
        project_id=project_id,
    )

    statement, params = cursor.calls[-1]
    assert "project_id = %s" in statement
    assert "%s::uuid IS NULL" in statement
    assert "project_id = %s::uuid" in statement
    assert params[:4] == ("user-1", "workspace-1", project_id, project_id)
    assert "lifecycle_status = 'approved'" in statement


def test_memory_management_query_is_user_workspace_and_project_scoped(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "_connect", lambda _settings: _Connection(cursor))
    project_id = str(uuid4())

    postgres_store.list_managed_memories(
        object(),
        user_id="user-1",
        workspace_id="workspace-1",
        project_id=project_id,
        query="decision",
        status="pending",
    )

    statement, params = cursor.calls[-1]
    assert "memory.user_id = %s AND memory.workspace_id = %s" in statement
    assert "memory.project_id = %s" in statement
    assert params[:6] == (
        "user-1", "workspace-1", project_id, project_id, "pending", "pending",
    )


def test_project_lookup_types_optional_workspace_as_uuid(monkeypatch) -> None:
    cursor = _Cursor()
    monkeypatch.setattr(postgres_store, "_connect", lambda _settings: _Connection(cursor))

    postgres_store.get_project_for_user(
        object(),
        project_id=str(uuid4()),
        user_id=str(uuid4()),
        workspace_id=None,
    )

    statement, params = cursor.calls[-1]
    assert "%s::uuid IS NULL" in statement
    assert "workspace_id = %s::uuid" in statement
    assert params[2:] == (None, None)
