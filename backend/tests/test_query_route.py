import asyncio
from uuid import uuid4

import pytest

from app.auth_middleware import AuthContext
from app.routes import query


def test_unified_query_forwards_workspace_project_mentions_and_skills(monkeypatch) -> None:
    captured = {}

    def stream(**kwargs):
        captured.update(kwargs)

        async def events():
            if False:
                yield ""

        return events()

    monkeypatch.setattr(query, "_chat_event_stream", stream)
    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )
    workspace_id = uuid4()
    project_id = uuid4()
    body = query.QueryRequest(
        question="Use this project",
        conversation_id=str(uuid4()),
        workspace_id=workspace_id,
        project_id=project_id,
        workspace_name="Product",
        prompt_context="Continue with the implementation constraints.",
        attachment_context="Active file: app/page.tsx",
        enabled_skills=["research"],
        context_mentions=[
            {"kind": "project", "id": str(project_id), "label": "Launch"}
        ],
    )

    asyncio.run(query.query_stream(
        body,
        AuthContext(authenticated=True, user={"id": str(uuid4())}),
    ))

    assert captured["workspace_id"] == str(workspace_id)
    assert captured["project_id"] == str(project_id)
    assert captured["workspace_name"] == "Product"
    assert captured["prompt_context"] == "Continue with the implementation constraints."
    assert captured["attachment_context"] == "Active file: app/page.tsx"
    assert captured["enabled_skills"] == ["research"]
    assert captured["context_mentions"][0]["id"] == str(project_id)


def test_unified_query_forwards_fast_mode(monkeypatch) -> None:
    captured = {}

    def stream(**kwargs):
        captured.update(kwargs)

        async def events():
            if False:
                yield ""

        return events()

    monkeypatch.setattr(query, "_chat_event_stream", stream)
    monkeypatch.setattr(
        query,
        "get_settings",
        lambda: type("Settings", (), {"openrouter_api_key": "test-key"})(),
    )

    asyncio.run(
        query.query_stream(
            query.QueryRequest(question="Hi", fast_mode=True),
            AuthContext(authenticated=True, user={"id": "user-1"}),
        )
    )

    assert captured["fast_mode"] is True


def test_unified_query_rejects_missing_openrouter_key(monkeypatch) -> None:
    monkeypatch.setattr(query, "get_settings", lambda: type("Settings", (), {"openrouter_api_key": ""})())
    body = query.QueryRequest(question="What is Kontext?")

    with pytest.raises(query.HTTPException) as exc_info:
        asyncio.run(query.query_stream(
            body,
            AuthContext(authenticated=True, user={"id": str(uuid4())}),
        ))

    assert exc_info.value.status_code == 400
    assert "OPENROUTER_API_KEY missing" in exc_info.value.detail
