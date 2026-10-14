"""TrueBot boundaries that matter before enabling a production worker."""
import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.auth_middleware import AuthContext
from app.routes import truebot
from services.truebot_catalog import catalog
from services.truebot_runtime import ExecutionError, OpenAIResponsesProvider, execute_run, execute_tool, tool_definitions


def _settings():
    return SimpleNamespace(
        truebot_enabled=True, openai_api_key="server-only-placeholder",
        truebot_models=["approved-model"], truebot_max_agents=2,
        truebot_daily_runs=3, truebot_concurrent_runs=1,
    )


def _agent(**updates):
    values = dict(name="Reviewer", description="", instructions="Review the input", provider="openai", model="approved-model", workspace_id=None, memory_enabled=False, tools=[], max_output_tokens=512, max_steps=2, timeout_seconds=30, status="active")
    values.update(updates)
    return truebot.AgentBody(**values)


def test_disabled_or_unconfigured_provider_is_honest():
    settings = _settings()
    settings.openai_api_key = ""
    result = catalog(settings)
    assert result["providers"][0]["configured"] is False
    assert all(not provider["configured"] for provider in result["providers"])
    assert result["automations_enabled"] is False


def test_agent_allowlist_and_memory_scope():
    with pytest.raises(ValidationError):
        _agent(provider="anthropic")
    with pytest.raises(ValidationError):
        _agent(tools=["terminal"])
    with pytest.raises(ValidationError):
        _agent(tools=["memory.search", "memory.search"])
    with pytest.raises(HTTPException) as exc:
        truebot._validate_agent(_agent(memory_enabled=True, tools=["memory.search"]), _settings(), AuthContext(authenticated=True, scopes=[]))
    assert exc.value.status_code == 403


def test_run_requires_separate_provider_and_memory_consent(monkeypatch):
    class Store:
        def __init__(self):
            self.called = False

        def enqueue(self, *args, **kwargs):
            self.called = True
            return {"id": "run"}

        def worker_ready(self):
            return True

    store = Store()
    monkeypatch.setattr(truebot, "_store", lambda auth: (_settings(), store, str(uuid4())))
    auth = AuthContext(authenticated=True, scopes=["memory"])
    base = dict(agent_id=uuid4(), task="Review this", idempotency_key=uuid4())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(truebot.create_run(truebot.RunBody(**base), auth))
    assert exc.value.status_code == 422
    assert not store.called
    with pytest.raises(HTTPException) as exc:
        asyncio.run(truebot.create_run(truebot.RunBody(**base, allow_external_provider=True, allow_memory_write=True), auth))
    assert exc.value.status_code == 422
    assert not store.called
    asyncio.run(truebot.create_run(truebot.RunBody(**base, allow_external_provider=True), auth))
    assert store.called


def test_memory_tools_require_permission_before_storage(monkeypatch):
    agent = dict(memory_enabled=True, memory_access_approved=False, memory_write_approved=False, tools=["memory.search"])
    assert [tool["name"] for tool in tool_definitions(agent)] == ["memory_search"]
    run = {"agent_snapshot": agent}
    with pytest.raises(ExecutionError, match="without permission"):
        execute_tool(_settings(), run, {"name": "memory_save", "arguments": '{}'})


def test_provider_error_never_returns_secret_or_provider_body(monkeypatch):
    class Response:
        status_code = 401
        text = "secret-provider-body"

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, *, headers, json):
            assert url == "https://api.openai.com/v1/responses"
            assert json["store"] is False
            assert headers["Authorization"] == "Bearer server-only-placeholder"
            return Response()

    monkeypatch.setattr("services.truebot_runtime.httpx.AsyncClient", lambda **kwargs: Client())
    with pytest.raises(ExecutionError) as exc:
        asyncio.run(OpenAIResponsesProvider(_settings()).respond({"model": "approved-model", "instructions": "help", "max_output_tokens": 512}, [{"role": "user", "content": "Hi"}], []))
    assert "secret-provider-body" not in str(exc.value)
    assert "server-only-placeholder" not in str(exc.value)


def test_completed_model_output_is_persisted_without_fake_tool_activity(monkeypatch):
    class Provider:
        def __init__(self, settings):
            pass

        async def respond(self, agent, items, tools):
            assert tools == []
            assert items[-1] == {"role": "user", "content": "Explain the plan"}
            return {"status": "completed", "usage": {"input_tokens": 8, "output_tokens": 12}, "output": [{"type": "message", "content": [{"type": "output_text", "text": "A real provider result"}]}]}

    class Store:
        def __init__(self):
            self.record = None

        def alive(self, run):
            return True

        def history(self, run):
            return []

        def update(self, run, **values):
            self.record = values

    monkeypatch.setitem(__import__("services.truebot_runtime", fromlist=["PROVIDERS"]).PROVIDERS, "openai", Provider)
    store = Store()
    agent = dict(provider="openai", model="approved-model", instructions="Explain clearly", max_output_tokens=512, max_steps=2, timeout_seconds=30, memory_enabled=False, tools=[], external_provider_approved=True)
    run = {"agent_snapshot": agent, "task": "Explain the plan"}
    asyncio.run(execute_run(_settings(), store, run))
    assert store.record["status"] == "completed"
    assert store.record["output"] == "A real provider result"
    assert store.record["usage"] == {"input_tokens": 8, "output_tokens": 12, "model_calls": 1, "tool_calls": 0}
