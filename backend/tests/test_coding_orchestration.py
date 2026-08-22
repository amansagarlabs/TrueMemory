import asyncio
from uuid import uuid4

from app.auth_middleware import AuthContext
from app.routes import coding
from services.coding_agent import CompiledContext, synthesis_messages
from worker.coding_worker import (
    mode_allows_writes,
    specialist_roles_for_effort,
    user_facing_coding_error,
)


def _auth() -> AuthContext:
    return AuthContext(authenticated=True, user={"id": str(uuid4())})


def test_preferences_are_account_scoped_and_patchable(monkeypatch) -> None:
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "get_coding_preferences",
        lambda _settings, *, user_id: {
            "onboardingVersion": 1,
            "defaultInteractionMode": "plan",
            "defaultEffortProfile": "balanced",
            "lastSource": None,
            "user": user_id,
        },
    )

    def update(_settings, *, user_id, preferences):
        captured.update({"user_id": user_id, "preferences": preferences})
        return {
            "onboardingVersion": preferences["onboardingVersion"],
            "defaultInteractionMode": preferences["defaultInteractionMode"],
            "defaultEffortProfile": "balanced",
            "lastSource": None,
        }

    monkeypatch.setattr(coding, "update_coding_preferences", update)
    current = asyncio.run(coding.get_preferences(_auth()))
    updated = asyncio.run(
        coding.patch_preferences(
            coding.CodingPreferencesPatchRequest(
                onboardingVersion=1,
                defaultInteractionMode="build",
            ),
            _auth(),
        )
    )

    assert current["user"] == "user-1"
    assert updated["defaultInteractionMode"] == "build"
    assert captured == {
        "user_id": "user-1",
        "preferences": {
            "onboardingVersion": 1,
            "defaultInteractionMode": "build",
        },
    }


def test_effort_profiles_have_bounded_read_only_specialists() -> None:
    assert specialist_roles_for_effort("fast") == []
    assert specialist_roles_for_effort("balanced") == [
        "explorer",
        "dependency_analyst",
    ]
    assert specialist_roles_for_effort("deep") == [
        "explorer",
        "dependency_analyst",
        "reviewer",
    ]
    assert len(specialist_roles_for_effort("deep")) == 3


def test_task_configuration_persists_mode_effort_and_goal(monkeypatch) -> None:
    task_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))

    def configure(_settings, **kwargs):
        captured.update(kwargs)
        return {"id": str(task_id), **kwargs}

    monkeypatch.setattr(coding, "configure_coding_task", configure)
    response = asyncio.run(
        coding.patch_task_configuration(
            task_id,
            coding.CodingTaskConfigurationRequest(
                interaction_mode="build",
                effort_profile="deep",
                goal_spec=coding.CodingGoalSpec(
                    objective="Ship the agent home",
                    acceptanceCriteria=["No automatic Monaco"],
                    constraints=["One writer"],
                ),
            ),
            _auth(),
        )
    )

    assert response["item"]["interaction_mode"] == "build"
    assert captured["user_id"] == "user-1"
    assert captured["effort_profile"] == "deep"
    assert captured["goal_spec"]["constraints"] == ["One writer"]


def test_approved_plan_is_persisted_with_artifact_metadata(monkeypatch) -> None:
    task_id = uuid4()
    captured = {}
    monkeypatch.setattr(coding, "_storage", lambda _auth: (object(), "user-1"))
    monkeypatch.setattr(
        coding,
        "get_coding_task",
        lambda _settings, *, user_id, task_id: {"id": task_id, "user_id": user_id},
    )

    def save(_settings, **kwargs):
        captured.update(kwargs)
        return {
            "task_id": kwargs["task_id"],
            "plan": kwargs["plan"],
            "status": kwargs["status"],
            "revision": 2,
            "artifact_path": "plans-goals/task.md",
        }

    monkeypatch.setattr(coding, "save_coding_plan", save)
    monkeypatch.setattr(coding, "append_coding_task_event", lambda *_args, **_kwargs: {})
    response = asyncio.run(
        coding.put_task_plan(
            task_id,
            coding.CodingPlanSaveRequest(
                status="approved",
                plan={
                    "goal": "Ship the plan workflow",
                    "summary": "Use the approved artifact.",
                    "steps": [
                        {
                            "id": "step-1",
                            "title": "Materialize the plan",
                            "tool": "search_code",
                        }
                    ],
                },
            ),
            _auth(),
        )
    )

    assert response["item"]["artifact_path"] == "plans-goals/task.md"
    assert captured["status"] == "approved"
    assert captured["user_id"] == "user-1"


def test_only_build_mode_allows_writer_output() -> None:
    assert mode_allows_writes("ask") is False
    assert mode_allows_writes("plan") is False
    assert mode_allows_writes("build") is True


def test_internal_repository_snapshot_errors_are_user_facing() -> None:
    message = user_facing_coding_error("github_repository_archive_not_found")
    assert "source snapshot" in message
    assert "first commit" in message
    assert "github_repository_archive_not_found" not in message


def test_read_only_synthesis_explicitly_forbids_diffs() -> None:
    context = CompiledContext(
        content="app/page.tsx: export default function Page() {}",
        included=[],
        dropped=[],
        characters=48,
        budget=2_000,
    )
    ask = synthesis_messages(
        task_type="analyze",
        goal="Explain the page",
        repository="aman/kontext",
        branch="main",
        compiled_context=context,
        interaction_mode="ask",
    )
    plan = synthesis_messages(
        task_type="implement",
        goal="Plan a change",
        repository="aman/kontext",
        branch="main",
        compiled_context=context,
        interaction_mode="plan",
    )

    assert "Do not emit a diff" in ask[-1]["content"]
    assert "Do not emit a diff" in plan[-1]["content"]
    assert "Include exactly one complete unified diff" not in plan[-1]["content"]
