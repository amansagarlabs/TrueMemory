import asyncio
from types import SimpleNamespace
from uuid import UUID, uuid4

from fastapi import HTTPException
import pytest

from app.auth_middleware import AuthContext
from app.routes import coding
from services import coding_operations


def _auth() -> AuthContext:
    return AuthContext(authenticated=True, user={"id": str(uuid4())})


def test_create_coding_task_is_scoped_to_workspace_project_and_user(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    captured = {}

    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "upsert_workspace",
        lambda *_args, **_kwargs: {
            "id": str(workspace_id),
            "name": "My workspace",
            "platform": "Kontext Coding",
            "last_active": "2026-07-31T00:00:00Z",
        },
    )

    def create(_settings, **kwargs):
        captured.update(kwargs)
        return {"id": "task-1", "status": "planning", **kwargs}

    monkeypatch.setattr(coding, "create_coding_task", create)
    body = coding.CodingTaskCreateRequest(
        workspace_id=workspace_id,
        project_id=project_id,
        repository_full_name="aman/kontext",
        branch="main",
        task_type="review",
        goal="Review the authentication flow",
    )

    response = asyncio.run(coding.post_task(body, _auth()))

    assert response["item"]["id"] == "task-1"
    assert captured["user_id"] == "user-1"
    assert captured["workspace_id"] == str(workspace_id)
    assert captured["project_id"] == str(project_id)
    assert captured["repository_full_name"] == "aman/kontext"


def test_post_task_upserts_workspace_before_creating_task(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    calls = []

    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))

    def upsert(_settings, **kwargs):
        calls.append(("upsert", kwargs))
        return {
            "id": kwargs["workspace_id"],
            "name": kwargs["name"],
            "platform": kwargs["platform"],
            "last_active": "2026-07-31T00:00:00Z",
        }

    def create(_settings, **kwargs):
        calls.append(("create", kwargs))
        return {"id": "task-1", "status": "planning", **kwargs}

    monkeypatch.setattr(coding, "upsert_workspace", upsert)
    monkeypatch.setattr(coding, "create_coding_task", create)
    body = coding.CodingTaskCreateRequest(
        workspace_id=workspace_id,
        workspace_name="My workspace",
        project_id=project_id,
        repository_full_name="aman/kontext",
        branch="main",
        task_type="review",
        goal="Review the authentication flow",
    )

    response = asyncio.run(coding.post_task(body, _auth()))

    assert response["item"]["id"] == "task-1"
    assert calls[0][0] == "upsert"
    assert calls[0][1]["workspace_id"] == str(workspace_id)
    assert calls[0][1]["name"] == "My workspace"
    assert calls[0][1]["platform"] == "Kontext Coding"
    assert calls[1][0] == "create"
    assert calls[1][1]["workspace_id"] == str(workspace_id)


def test_task_events_and_status_updates_require_owned_task(monkeypatch) -> None:
    task_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))

    def append(_settings, **kwargs):
        captured["event"] = kwargs
        return {"id": "event-1", **kwargs}

    def update(_settings, **kwargs):
        captured["update"] = kwargs
        return {"id": str(task_id), **kwargs}

    monkeypatch.setattr(coding, "append_coding_task_event", append)
    monkeypatch.setattr(coding, "update_coding_task", update)

    event_response = asyncio.run(
        coding.post_task_event(
            task_id,
            coding.CodingTaskEventRequest(
                event_type="context_resolved",
                phase="planning",
                message="Resolved 12 files",
                metadata={"files": 12},
            ),
            _auth(),
        )
    )
    update_response = asyncio.run(
        coding.patch_task(
            task_id,
            coding.CodingTaskUpdateRequest(
                status="completed",
                result="Review complete",
            ),
            _auth(),
        )
    )

    assert event_response["item"]["metadata"] == {"files": 12}
    assert captured["event"]["user_id"] == "user-1"
    assert update_response["item"]["status"] == "completed"
    assert captured["update"]["user_id"] == "user-1"


def test_command_approval_is_durable_and_bound_to_exact_payload(monkeypatch) -> None:
    task_id = uuid4()
    approval_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(coding, "_owned_task", lambda *_args: {"id": str(task_id)})
    monkeypatch.setattr(coding, "append_coding_task_event", lambda *_args, **_kwargs: {})

    def create_approval(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "id": str(approval_id),
            "task_id": str(task_id),
            "action": kwargs["action"],
            "title": kwargs["title"],
            "status": "pending",
        }

    monkeypatch.setattr(coding, "create_coding_approval", create_approval)
    response = asyncio.run(
        coding.post_task_approval(
            task_id,
            coding.CodingApprovalCreateRequest(
                action="run_command",
                title="Run tests",
                payload={"command": " npm test ", "timeout_seconds": 60},
            ),
            _auth(),
        )
    )

    assert response["item"]["status"] == "pending"
    assert captured["payload"] == {"command": "npm test", "timeout_seconds": 60}
    assert captured["payload_hash"] == coding._approval_payload_hash(
        "run_command",
        captured["payload"],
    )


def test_runtime_command_queues_exact_approved_worker_operation(monkeypatch) -> None:
    task_id = uuid4()
    approval_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(coding, "_owned_task", lambda *_args: {"id": str(task_id)})
    async def run_operation(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "task_id": str(task_id),
            "command": kwargs["payload"]["command"],
            "exit_code": 0,
            "stdout": "passed",
            "stderr": "",
        }

    monkeypatch.setattr(coding, "_run_approved_operation", run_operation)
    response = asyncio.run(
        coding.post_runtime_command(
            task_id,
            coding.RuntimeCommandRequest(
                command="npm test",
                approval_id=approval_id,
                timeout_seconds=60,
            ),
            _auth(),
        )
    )

    assert response["stdout"] == "passed"
    assert captured["approval_id"] == approval_id
    assert captured["action"] == "run_command"
    assert captured["payload"] == {
        "command": "npm test",
        "timeout_seconds": 60,
    }


def test_runtime_command_rejects_missing_or_replayed_approval(monkeypatch) -> None:
    task_id = uuid4()
    monkeypatch.setattr(
        coding,
        "create_or_get_approved_coding_operation_run",
        lambda *_args, **_kwargs: None,
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            coding._run_approved_operation(
                object(),
                user_id="user-1",
                task_id=task_id,
                approval_id=uuid4(),
                action="run_command",
                payload={"command": "npm test", "timeout_seconds": 60},
            )
        )

    assert exc_info.value.status_code == 409


def test_approved_operation_is_queued_once_with_durable_event(monkeypatch) -> None:
    task_id = uuid4()
    approval_id = uuid4()
    run_id = uuid4()
    events = []
    outputs = []
    captured = {}

    def create_run(_settings, **kwargs):
        captured.update(kwargs)
        return {"id": str(run_id), "status": "queued", "created": True}

    monkeypatch.setattr(
        coding,
        "create_or_get_approved_coding_operation_run",
        create_run,
    )
    monkeypatch.setattr(
        coding,
        "append_coding_task_event",
        lambda *_args, **kwargs: events.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding,
        "append_coding_agent_output",
        lambda *_args, **kwargs: outputs.append(kwargs) or kwargs,
    )

    run = coding._queue_approved_operation(  # noqa: SLF001
        object(),
        user_id="user-1",
        task_id=task_id,
        approval_id=approval_id,
        action="run_tests",
        payload={"command": "npm test", "timeout_seconds": 120},
    )

    assert run["id"] == str(run_id)
    assert captured["payload_hash"] == coding._approval_payload_hash(
        "run_tests",
        captured["payload"],
    )
    assert events[0]["event_type"] == "operation.queued"
    assert outputs[0]["event_type"] == "operation.queued"
    assert outputs[0]["run_id"] == str(run_id)


def test_local_runtime_workspace_sync_is_owned_and_exported(monkeypatch) -> None:
    task_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {
            "id": str(task_id),
            "repository_full_name": "local:workspace-1",
        },
    )

    async def export(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "task_id": str(task_id),
            "files": [
                {
                    "path": "app/page.tsx",
                    "status": "changed",
                    "encoding": "base64",
                    "content": "ZXhwb3J0IGRlZmF1bHQgMTsK",
                }
            ],
            "total_bytes": 18,
        }

    monkeypatch.setattr(coding, "export_runtime_working_tree", export)
    response = asyncio.run(coding.get_runtime_workspace_sync(task_id, _auth()))

    assert captured["task_id"] == str(task_id)
    assert response["files"][0]["path"] == "app/page.tsx"


def test_remote_repository_cannot_use_browser_workspace_sync(monkeypatch) -> None:
    task_id = uuid4()
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {
            "id": str(task_id),
            "repository_full_name": "aman/kontext",
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(coding.get_runtime_workspace_sync(task_id, _auth()))

    assert exc_info.value.status_code == 400


def test_applying_patch_requests_post_apply_validation(monkeypatch) -> None:
    task_id = uuid4()
    events = []
    captured_approval = {}

    async def apply_patch(_settings, **_kwargs):
        return {
            "task_id": str(task_id),
            "files": ["app/page.tsx"],
            "status": " M app/page.tsx\n",
            "diff": "diff",
        }

    def create_approval(_settings, **kwargs):
        captured_approval.update(kwargs)
        return {
            "id": str(uuid4()),
            "task_id": str(task_id),
            "action": kwargs["action"],
            "title": kwargs["title"],
            "description": kwargs["description"],
            "payload": kwargs["payload"],
            "status": "pending",
        }

    monkeypatch.setattr(coding_operations, "apply_runtime_patch", apply_patch)
    monkeypatch.setattr(
        coding_operations,
        "detect_runtime_validation_command",
        lambda *_args, **_kwargs: "npm test",
    )
    monkeypatch.setattr(coding_operations, "create_coding_approval", create_approval)

    async def emit(event_type, phase, message, metadata):
        events.append(
            {
                "event_type": event_type,
                "phase": phase,
                "message": message,
                "metadata": metadata,
            }
        )

    outcome = asyncio.run(
        coding_operations.execute_coding_operation(
            object(),
            user_id="user-1",
            task_id=str(task_id),
            task={"repository_full_name": "local:workspace-1"},
            action="apply_patch",
            payload={
                "patch": (
                    "--- a/app/page.tsx\n"
                    "+++ b/app/page.tsx\n"
                    "@@ -1 +1 @@\n-old\n+new\n"
                )
            },
            emit=emit,
        )
    )

    assert outcome["result"]["next_approval"]["action"] == "run_tests"
    assert outcome["result"]["next_approval"]["payload"]["command"] == "npm test"
    assert outcome["task_status"] == "waiting_approval"
    assert captured_approval["payload_hash"] == coding._approval_payload_hash(
        "run_tests",
        captured_approval["payload"],
    )
    assert [event["event_type"] for event in events] == [
        "operation.patch.started",
        "patch_applied",
        "approval_requested",
    ]


def test_applying_patch_reports_workspace_rebase_when_runtime_drifted(monkeypatch) -> None:
    task_id = uuid4()
    events = []

    async def apply_patch(_settings, **_kwargs):
        return {
            "task_id": str(task_id),
            "files": ["app/page.tsx"],
            "status": " M app/page.tsx\n",
            "diff": "diff",
            "applied_mode": "workspace_rebase",
            "recovered_from_drift": True,
        }

    monkeypatch.setattr(coding_operations, "apply_runtime_patch", apply_patch)
    monkeypatch.setattr(
        coding_operations,
        "detect_runtime_validation_command",
        lambda *_args, **_kwargs: "",
    )

    async def emit(event_type, phase, message, metadata):
        events.append(
            {
                "event_type": event_type,
                "phase": phase,
                "message": message,
                "metadata": metadata,
            }
        )

    outcome = asyncio.run(
        coding_operations.execute_coding_operation(
            object(),
            user_id="user-1",
            task_id=str(task_id),
            task={"repository_full_name": "local:workspace-1"},
            action="apply_patch",
            payload={
                "patch": (
                    "--- a/app/page.tsx\n"
                    "+++ b/app/page.tsx\n"
                    "@@ -1 +1 @@\n-old\n+new\n"
                )
            },
            emit=emit,
        )
    )

    assert outcome["result"]["applied_mode"] == "workspace_rebase"
    assert outcome["result"]["recovered_from_drift"] is True
    assert [event["event_type"] for event in events] == [
        "operation.patch.started",
        "patch_rebased",
        "patch_applied",
        "validation_unavailable",
    ]


def test_patch_context_failure_requests_fresh_agent_recovery(monkeypatch) -> None:
    task_id = uuid4()
    run_id = uuid4()
    monkeypatch.setattr(
        coding,
        "create_or_get_approved_coding_operation_run",
        lambda *_args, **_kwargs: {
            "id": str(run_id),
            "created": False,
        },
    )
    monkeypatch.setattr(
        coding,
        "get_coding_agent_run",
        lambda *_args, **_kwargs: {
            "id": str(run_id),
            "status": "failed",
            "error": "Patch context does not match package.json near line 1.",
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            coding._run_approved_operation(
                object(),
                user_id="user-1",
                task_id=task_id,
                approval_id=uuid4(),
                action="apply_patch",
                payload={
                    "patch": (
                        "--- a/package.json\n+++ b/package.json\n"
                        "@@ -1 +1 @@\n-old\n+new\n"
                    )
                },
            )
        )

    assert exc_info.value.status_code == 400
    assert "Patch context does not match" in str(exc_info.value.detail)


def test_failed_tests_persist_diagnostics_and_request_bounded_recovery(
    monkeypatch,
) -> None:
    task_id = uuid4()
    events = []

    async def execute(_settings, **kwargs):
        return {
            "task_id": str(task_id),
            "command": kwargs["command"],
            "exit_code": 1,
            "stdout": "1 failed",
            "stderr": "AssertionError: expected 200",
        }

    monkeypatch.setattr(coding_operations, "execute_runtime_command", execute)
    monkeypatch.setattr(
        coding_operations,
        "parse_runtime_diagnostics",
        lambda *_args, **_kwargs: [],
    )

    async def emit(event_type, phase, message, metadata):
        events.append(
            {
                "event_type": event_type,
                "phase": phase,
                "message": message,
                "metadata": metadata,
            }
        )

    outcome = asyncio.run(
        coding_operations.execute_coding_operation(
            object(),
            user_id="user-1",
            task_id=str(task_id),
            task={"repository_full_name": "local:workspace-1"},
            action="run_tests",
            payload={"command": "python -m pytest", "timeout_seconds": 120},
            emit=emit,
        )
    )

    assert outcome["result"]["exit_code"] == 1
    assert outcome["task_status"] == "running"
    assert [event["event_type"] for event in events] == [
        "validation_started",
        "tests_started",
        "tests_completed",
        "validation_completed",
        "agent.recovery.requested",
    ]
    assert events[2]["metadata"]["stderr"].startswith("AssertionError")


def test_preview_html_rewrites_root_assets_through_private_token() -> None:
    html = b'<script src="/app.js"></script><link href="/style.css">'
    rewritten = coding._rewrite_preview_html(html, "private-token").decode()

    assert 'src="/api/coding/previews/private-token/app.js"' in rewritten
    assert 'href="/api/coding/previews/private-token/style.css"' in rewritten


def test_repository_index_build_is_scoped_and_emits_progress(monkeypatch) -> None:
    task_id = uuid4()
    settings = SimpleNamespace(github_token="fallback-token")
    events = []
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (settings, "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {
            "id": str(task_id),
            "repository_full_name": "aman/kontext",
            "branch": "main",
        },
    )
    monkeypatch.setattr(
        coding,
        "get_github_access_token",
        lambda *_args, **_kwargs: "installation-token",
    )
    monkeypatch.setattr(
        coding,
        "append_coding_task_event",
        lambda *_args, **kwargs: events.append(kwargs) or kwargs,
    )

    async def prepare(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "task_id": str(task_id),
            "status": "ready",
            "files": 42,
            "symbols": 180,
            "import_edges": 73,
        }

    monkeypatch.setattr(coding, "prepare_code_index", prepare)

    response = asyncio.run(coding.post_task_index(task_id, False, _auth()))

    assert response["status"] == "ready"
    assert captured["github_token"] == "installation-token"
    assert captured["repository"] == "aman/kontext"
    assert captured["cache_scope"] == "user-1"
    assert captured["force"] is False
    assert [event["event_type"] for event in events] == [
        "index_started",
        "index_completed",
    ]


def test_repository_index_search_requires_owned_task(monkeypatch) -> None:
    task_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(coding, "_owned_task", lambda *_args: {"id": str(task_id)})

    async def search(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "task_id": str(task_id),
            "status": "ready",
            "query": kwargs["query"],
            "results": [],
            "repository_map": "Repository map:",
            "context": "Repository map:",
            "stats": {},
        }

    monkeypatch.setattr(coding, "search_task_code_index", search)

    response = asyncio.run(
        coding.get_task_index_search(
            task_id,
            q="authentication flow",
            limit=8,
            max_chars=12_000,
            auth=_auth(),
        )
    )

    assert response["status"] == "ready"
    assert captured["query"] == "authentication flow"
    assert captured["limit"] == 8
    assert captured["max_chars"] == 12_000


def test_agent_stream_queues_run_and_replays_durable_state(monkeypatch) -> None:
    task_id = uuid4()
    settings = SimpleNamespace(
        openrouter_api_key="test-key",
        openrouter_model="openrouter/free",
        openrouter_vision_model="openrouter/free",
        openrouter_max_tokens=1024,
    )
    run = {
        "id": str(uuid4()),
        "task_id": str(task_id),
        "status": "queued",
        "phase": "queued",
        "created": True,
        "request": {"prompt": "Explain session refresh"},
    }
    outputs = []
    events = []

    monkeypatch.setattr(coding, "_storage", lambda _auth: (settings, "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {
            "id": str(task_id),
            "repository_full_name": "aman/kontext",
            "branch": "main",
            "task_type": "explain",
            "goal": "Explain the authentication flow",
        },
    )
    monkeypatch.setattr(
        coding,
        "create_or_get_coding_agent_run",
        lambda *_args, **_kwargs: dict(run),
    )
    monkeypatch.setattr(
        coding,
        "append_coding_task_event",
        lambda *_args, **kwargs: events.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding,
        "append_coding_agent_output",
        lambda *_args, **kwargs: outputs.append(
            {
                "sequence": len(outputs) + 1,
                "id": kwargs["event_id"],
                "run_id": kwargs["run_id"],
                "event_type": kwargs["event_type"],
                "payload": kwargs["payload"],
            }
        )
        or {
            "sequence": len(outputs),
            "id": kwargs["event_id"],
            "run_id": kwargs["run_id"],
            "event_type": kwargs["event_type"],
            "payload": kwargs["payload"],
        },
    )
    monkeypatch.setattr(
        coding,
        "list_coding_agent_outputs",
        lambda *_args, **kwargs: [
            output
            for output in outputs
            if output["sequence"] > kwargs.get("after_sequence", 0)
        ],
    )
    monkeypatch.setattr(
        coding,
        "get_coding_agent_run",
        lambda *_args, **_kwargs: dict(run),
    )

    async def collect():
        response = await coding.post_agent_stream(
            task_id,
            coding.CodingAgentRunRequest(prompt="Explain session refresh"),
            _auth(),
        )
        first_chunk = await anext(response.body_iterator)
        await response.body_iterator.aclose()
        return first_chunk.decode() if isinstance(first_chunk, bytes) else first_chunk

    stream = asyncio.run(collect())

    assert '"type": "agent.run.queued"' in stream
    assert events[0]["event_type"] == "agent.run.queued"
    assert outputs[0]["event_type"] == "agent.run.queued"
    assert outputs[0]["payload"]["message"] == "Coding agent run queued."


def test_coding_worker_claims_and_completes_a_run(monkeypatch) -> None:
    from worker import coding_worker

    task_id = uuid4()
    run_id = uuid4()
    claim = {
        "id": str(run_id),
        "task_id": str(task_id),
        "user_id": "user-1",
        "idempotency_key": "abc123",
        "status": "queued",
        "model": "openrouter/free",
        "request": {"prompt": "Explain session refresh", "task_type": "explain"},
        "phase": "queued",
        "checkpoint": {},
        "lease_owner": "",
        "lease_expires_at": None,
        "cancel_requested_at": None,
        "error": "",
        "created_at": "2026-07-29T00:00:00Z",
        "updated_at": "2026-07-29T00:00:00Z",
        "started_at": None,
        "completed_at": None,
        "repository_full_name": "aman/kontext",
        "branch": "main",
        "task_type": "explain",
        "goal": "Explain the authentication flow",
        "workspace_id": str(uuid4()),
        "project_id": None,
    }
    events = []
    outputs = []
    messages = []
    checkpoints = []
    run_updates = []
    task_updates = []

    monkeypatch.setattr(coding_worker, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(
        coding_worker,
        "get_settings",
        lambda: SimpleNamespace(
            openrouter_api_key="test-key",
            openrouter_model="openrouter/free",
            openrouter_vision_model="openrouter/free",
            openrouter_max_tokens=1024,
            github_token="",
        ),
    )
    monkeypatch.setattr(
        coding_worker,
        "claim_next_coding_agent_run",
        lambda *_args, **_kwargs: dict(claim),
    )
    monkeypatch.setattr(
        coding_worker,
        "update_coding_task",
        lambda *_args, **kwargs: task_updates.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "update_coding_agent_run",
        lambda *_args, **kwargs: run_updates.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "append_coding_task_event",
        lambda *_args, **kwargs: events.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "append_coding_agent_output",
        lambda *_args, **kwargs: outputs.append(kwargs) or {
            "sequence": len(outputs),
            "id": kwargs["event_id"],
            "run_id": kwargs["run_id"],
            "event_type": kwargs["event_type"],
            "payload": kwargs["payload"],
        },
    )
    monkeypatch.setattr(
        coding_worker,
        "append_coding_agent_message",
        lambda *_args, **kwargs: messages.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "append_coding_agent_checkpoint",
        lambda *_args, **kwargs: checkpoints.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "upsert_coding_agent_step",
        lambda *_args, **kwargs: kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "renew_coding_agent_run_lease",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        coding_worker,
        "get_coding_agent_run",
        lambda *_args, **_kwargs: dict(claim, status="running"),
    )
    monkeypatch.setattr(
        coding_worker,
        "list_coding_agent_runs",
        lambda *_args, **_kwargs: [],
    )
    monkeypatch.setattr(
        coding_worker,
        "list_coding_agent_messages",
        lambda *_args, **_kwargs: [],
    )
    monkeypatch.setattr(
        coding_worker,
        "list_coding_agent_task_outputs",
        lambda *_args, **_kwargs: [],
    )
    monkeypatch.setattr(
        coding_worker,
        "create_coding_approval",
        lambda *_args, **kwargs: {"title": kwargs["title"], "action": kwargs["action"]},
    )
    monkeypatch.setattr(
        coding_worker,
        "get_github_access_token",
        lambda *_args, **_kwargs: "installation-token",
    )
    monkeypatch.setattr(
        coding_worker,
        "prepare_code_index",
        lambda *_args, **_kwargs: asyncio.sleep(0, result={"files": 12}),
    )
    monkeypatch.setattr(
        coding_worker,
        "search_task_code_index",
        lambda *_args, **_kwargs: asyncio.sleep(
            0,
            result={
                "repository_map": "Repository map:\n- backend/auth.py",
                "context": "backend/auth.py:1-10",
                "results": [
                    {
                        "path": "backend/auth.py",
                        "start_line": 1,
                        "end_line": 10,
                        "score": 8.2,
                    }
                ],
            },
        ),
    )

    async def build_plan(**_kwargs):
        return (
            SimpleNamespace(summary="Plan summary", public_dict=lambda: {"steps": []}),
            False,
        )

    async def execute_plan(*_args, **_kwargs):
        return []

    async def synthesize(**_kwargs):
        yield "Authentication starts in `backend/auth.py`."

    monkeypatch.setattr(coding_worker, "build_agent_plan", build_plan)
    monkeypatch.setattr(coding_worker, "execute_agent_plan", execute_plan)
    monkeypatch.setattr(coding_worker, "stream_agent_synthesis", synthesize)

    async def run_once():
        await coding_worker._execute_claimed_run(  # noqa: SLF001
            coding_worker.get_settings(),
            claim=claim,
            lease_owner="worker-1",
        )

    asyncio.run(run_once())

    assert events[0]["event_type"] == "agent.run.started"
    assert any(output["event_type"] == "agent.message.delta" for output in outputs)
    assert any(event["event_type"] == "agent.synthesis.started" for event in events)
    assert any(event["event_type"] == "agent.synthesis.completed" for event in events)
    assert events[-1]["event_type"] == "agent.run.completed"
    assert task_updates[-1]["status"] == "completed"
    assert messages[-1]["content"].startswith("Authentication starts")
    assert checkpoints[-1]["checkpoint_type"] == "agent.run.completed"


def test_coding_worker_output_ids_are_database_safe_uuids() -> None:
    from worker import coding_worker

    payload = coding_worker._output_payload(  # noqa: SLF001
        event_type="agent.run.started",
        phase=coding_worker.AgentPhase.RETRIEVING,
        message="Started.",
        task_id=str(uuid4()),
        run_id=str(uuid4()),
    )

    assert str(UUID(payload["id"])) == payload["id"]


def test_coding_worker_dispatches_runtime_operations_without_indexing(
    monkeypatch,
) -> None:
    from worker import coding_worker

    task_id = uuid4()
    run_id = uuid4()
    claim = {
        "id": str(run_id),
        "task_id": str(task_id),
        "user_id": "user-1",
        "request": {
            "kind": "runtime_operation",
            "action": "run_tests",
            "approval_id": str(uuid4()),
            "payload": {"command": "npm test", "timeout_seconds": 120},
        },
        "repository_full_name": "aman/kontext",
        "branch": "main",
        "task_type": "implement",
        "goal": "Implement the feature",
    }
    captured = {}

    async def execute_operation(_settings, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(
        coding_worker,
        "_execute_runtime_operation_run",
        execute_operation,
    )
    monkeypatch.setattr(
        coding_worker,
        "prepare_code_index",
        lambda *_args, **_kwargs: pytest.fail(
            "Runtime operations must not re-index the repository."
        ),
    )

    asyncio.run(
        coding_worker._execute_claimed_run(  # noqa: SLF001
            object(),
            claim=claim,
            lease_owner="worker-1",
        )
    )

    assert captured["claim"] == claim
    assert captured["request"]["action"] == "run_tests"
    assert captured["lease_owner"] == "worker-1"


def test_coding_worker_persists_patch_recovery_when_workspace_drifted(
    monkeypatch,
) -> None:
    from worker import coding_worker

    task_id = str(uuid4())
    run_id = str(uuid4())
    events = []
    task_updates = []
    run_updates = []

    async def fail_patch(*_args, **_kwargs):
        raise ValueError("Patch context does not match package.json near line 1.")

    async def store_event(_settings, **kwargs):
        events.append(kwargs)
        return kwargs

    monkeypatch.setattr(coding_worker, "execute_coding_operation", fail_patch)
    monkeypatch.setattr(coding_worker, "_store_event", store_event)
    monkeypatch.setattr(
        coding_worker,
        "get_coding_agent_run",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        coding_worker,
        "update_coding_task",
        lambda *_args, **kwargs: task_updates.append(kwargs) or kwargs,
    )
    monkeypatch.setattr(
        coding_worker,
        "update_coding_agent_run",
        lambda *_args, **kwargs: run_updates.append(kwargs) or kwargs,
    )

    asyncio.run(
        coding_worker._execute_runtime_operation_run(  # noqa: SLF001
            object(),
            claim={
                "id": run_id,
                "task_id": task_id,
                "user_id": "user-1",
            },
            task={"repository_full_name": "local:workspace"},
            request={
                "kind": "runtime_operation",
                "action": "apply_patch",
                "approval_id": str(uuid4()),
                "payload": {"patch": "diff"},
            },
            lease_owner="worker-1",
        )
    )

    assert [event["event_type"] for event in events] == [
        "operation.started",
        "patch_failed",
        "agent.recovery.requested",
        "operation.failed",
    ]
    assert task_updates[-1]["status"] == "running"
    assert run_updates[-1]["status"] == "failed"
    assert "Patch context does not match" in run_updates[-1]["error"]


def test_coding_worker_continues_after_a_failed_claim(monkeypatch) -> None:
    from worker import coding_worker

    settings = object()
    claim = {
        "id": str(uuid4()),
        "task_id": str(uuid4()),
        "user_id": str(uuid4()),
        "phase": "retrieving",
    }
    claims = [claim, None]
    heartbeats = []

    monkeypatch.setattr(coding_worker, "get_settings", lambda: settings)
    monkeypatch.setattr(coding_worker, "postgres_enabled", lambda _settings: True)
    monkeypatch.setattr(
        coding_worker, "ensure_coding_task_schema", lambda _settings: None
    )
    monkeypatch.setattr(
        coding_worker,
        "claim_next_coding_agent_run",
        lambda *_args, **_kwargs: claims.pop(0),
    )
    monkeypatch.setattr(
        coding_worker,
        "upsert_coding_worker_heartbeat",
        lambda *_args, **kwargs: heartbeats.append(kwargs),
    )

    async def fail_run(*_args, **_kwargs):
        raise RuntimeError("broken run")

    async def stop_polling(_seconds):
        raise asyncio.CancelledError

    monkeypatch.setattr(coding_worker, "_execute_claimed_run", fail_run)
    monkeypatch.setattr(coding_worker.asyncio, "sleep", stop_polling)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(coding_worker.run_worker())

    assert not claims
    assert heartbeats[-1]["status"] == "idle"


def test_agent_history_reconstructs_durable_conversation(monkeypatch) -> None:
    task_id = uuid4()
    run_id = uuid4()
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {"id": str(task_id), "goal": "Explain the router"},
    )
    monkeypatch.setattr(
        coding,
        "list_coding_agent_runs",
        lambda *_args, **_kwargs: [
            {
                "id": str(run_id),
                "request": {"prompt": "How does routing work?"},
                "status": "completed",
                "created_at": "2026-07-29T00:00:00Z",
                "updated_at": "2026-07-29T00:00:01Z",
            }
        ],
    )
    monkeypatch.setattr(
        coding,
        "list_coding_agent_task_outputs",
        lambda *_args, **_kwargs: [
            {
                "sequence": 1,
                "run_id": str(run_id),
                "event_type": "agent.message.delta",
                "payload": {
                    "type": "agent.message.delta",
                    "phase": "reviewing",
                    "content": "The ",
                },
                "created_at": "2026-07-29T00:00:00Z",
            },
            {
                "sequence": 2,
                "run_id": str(run_id),
                "event_type": "agent.message.delta",
                "payload": {
                    "type": "agent.message.delta",
                    "phase": "reviewing",
                    "content": "router dispatches requests.",
                },
                "created_at": "2026-07-29T00:00:01Z",
            },
        ],
    )
    monkeypatch.setattr(
        coding,
        "list_coding_agent_messages",
        lambda *_args, **_kwargs: [],
    )

    response = asyncio.run(
        coding.get_agent_history(
            task_id,
            after_sequence=0,
            event_limit=1_000,
            auth=_auth(),
        )
    )

    assert [message["role"] for message in response["messages"]] == [
        "user",
        "assistant",
    ]
    assert response["messages"][1]["content"] == "The router dispatches requests."
    assert response["events"][1]["sequence"] == 2


def test_agent_run_cancellation_is_durable_and_owned(monkeypatch) -> None:
    task_id = uuid4()
    run_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {"id": str(task_id)},
    )

    def request_cancel(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "id": str(run_id),
            "task_id": str(task_id),
            "status": "running",
            "cancel_requested_at": "2026-07-29T00:00:00Z",
        }

    monkeypatch.setattr(
        coding,
        "request_coding_agent_run_cancel",
        request_cancel,
    )

    response = asyncio.run(coding.delete_agent_run(task_id, run_id, _auth()))

    assert response["item"]["cancel_requested_at"]
    assert captured == {
        "user_id": "user-1",
        "task_id": str(task_id),
        "run_id": str(run_id),
    }


def test_agent_run_rejects_reused_idempotency_key_for_different_request(
    monkeypatch,
) -> None:
    task_id = uuid4()
    settings = SimpleNamespace(
        openrouter_api_key="test-key",
        openrouter_model="openrouter/free",
        openrouter_vision_model="openrouter/free",
        openrouter_max_tokens=1024,
        github_token="",
    )
    monkeypatch.setattr(coding, "_storage", lambda _auth: (settings, "user-1"))
    monkeypatch.setattr(
        coding,
        "_owned_task",
        lambda *_args: {
            "id": str(task_id),
            "repository_full_name": "aman/kontext",
            "branch": "main",
            "task_type": "review",
            "goal": "Review the changed files",
        },
    )
    monkeypatch.setattr(
        coding,
        "create_or_get_coding_agent_run",
        lambda *_args, **_kwargs: {
            "id": str(uuid4()),
            "status": "completed",
            "request_matches": False,
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            coding.post_agent_stream(
                task_id,
                coding.CodingAgentRunRequest(idempotency_key="same-key"),
                _auth(),
            )
        )

    assert exc_info.value.status_code == 409
