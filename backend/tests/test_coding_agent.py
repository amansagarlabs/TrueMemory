import asyncio

from services.coding_agent import (
    AgentPhase,
    AgentTool,
    ContextCandidate,
    ToolResult,
    build_agent_plan,
    compile_priority_context,
    execute_agent_plan,
    fallback_agent_plan,
    parse_agent_plan,
)
from services import coding_agent


def test_synthesis_retries_with_non_stream_completion_when_stream_is_empty(
    monkeypatch,
) -> None:
    async def empty_stream(**_kwargs):
        if False:
            yield ""

    async def complete(**_kwargs):
        return "Fallback implementation response"

    monkeypatch.setattr(coding_agent, "stream_chat_completion", empty_stream)
    monkeypatch.setattr(coding_agent, "complete_chat_completion", complete)

    async def collect() -> list[str]:
        return [
            token
            async for token in coding_agent.stream_agent_synthesis(
                api_key="test-key",
                model="test-model",
                messages=[{"role": "user", "content": "Build it"}],
                max_tokens=100,
            )
        ]

    assert asyncio.run(collect()) == ["Fallback implementation response"]


def test_priority_context_is_bounded_and_reports_provenance() -> None:
    compiled = compile_priority_context(
        [
            ContextCandidate(
                kind="goal",
                label="Task",
                content="Fix authentication",
                priority=100,
                required=True,
            ),
            ContextCandidate(
                kind="code",
                label="auth.py",
                content="important " * 120,
                priority=90,
            ),
            ContextCandidate(
                kind="memory",
                label="old note",
                content="low priority " * 300,
                priority=5,
            ),
        ],
        max_chars=2_000,
    )

    assert compiled.characters <= compiled.budget
    assert [item["label"] for item in compiled.included][:2] == [
        "Task",
        "auth.py",
    ]
    assert [item["label"] for item in compiled.dropped] == ["old note"]
    assert "Fix authentication" in compiled.content


def test_planner_rejects_unknown_tools_and_inserts_repository_search() -> None:
    plan = parse_agent_plan(
        """
        {
          "summary": "Inspect and change the repository",
          "steps": [
            {
              "title": "Delete everything",
              "tool": "run_command",
              "arguments": {"command": "rm -rf ."},
              "reason": "unsafe"
            },
            {
              "title": "Inspect changes",
              "tool": "inspect_changes",
              "arguments": {},
              "reason": "Check existing work"
            }
          ]
        }
        """,
        goal="Fix the login flow",
    )

    assert [step.tool for step in plan.steps] == [
        AgentTool.SEARCH_CODE,
        AgentTool.INSPECT_CHANGES,
    ]
    assert all("command" not in step.arguments for step in plan.steps)


def test_planner_exposes_two_approaches_and_preserves_selection() -> None:
    plan = parse_agent_plan(
        """
        {
          "summary": "Build the todo flow",
          "approach": "Use the existing app router structure.",
          "options": [
            {
              "id": "app-router",
              "title": "App Router",
              "description": "Use the existing app router structure.",
              "tradeoff": "Matches repository conventions.",
              "recommended": true
            },
            {
              "id": "minimal-page",
              "title": "Minimal page",
              "description": "Keep all behavior in one route.",
              "tradeoff": "Smaller change with less separation.",
              "recommended": false
            }
          ],
          "selectedOptionId": "app-router",
          "steps": [
            {
              "title": "Locate the page",
              "tool": "search_code",
              "arguments": {"query": "app page"},
              "reason": "Ground the plan"
            }
          ]
        }
        """,
        goal="Build a todo app",
    )

    assert len(plan.options) == 2
    assert plan.options[0]["recommended"] is True
    assert plan.selected_option_id == "app-router"
    assert plan.public_dict()["selectedOptionId"] == "app-router"


def test_implementation_plan_cannot_request_tests_before_patch(monkeypatch) -> None:
    async def complete(**_kwargs):
        return """
        {
          "summary": "Inspect, edit, then test",
          "steps": [
            {
              "title": "Find the feature",
              "tool": "search_code",
              "arguments": {"query": "todo"},
              "reason": "Locate the implementation"
            },
            {
              "title": "Run tests",
              "tool": "request_tests",
              "arguments": {"command": "npm test"},
              "reason": "Validate the patch"
            }
          ]
        }
        """

    monkeypatch.setattr(coding_agent, "complete_chat_completion", complete)
    plan, used_fallback = asyncio.run(
        build_agent_plan(
            api_key="test",
            model="test",
            goal="Build a todo app",
            task_type="implement",
            repository_map="package.json\napp/page.tsx",
            test_command="npm test",
        )
    )

    assert used_fallback is False
    assert [step.tool for step in plan.steps] == [AgentTool.SEARCH_CODE]


def test_executor_retries_transient_read_only_tool_failure() -> None:
    plan = fallback_agent_plan(goal="Find the login handler", task_type="explain")
    attempts = 0
    events = []

    async def search(arguments):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("temporary index read failure")
        return ToolResult(
            step_id="step-search",
            tool=AgentTool.SEARCH_CODE,
            content="auth/login.py",
            metadata={"matches": 1, "query": arguments["query"]},
        )

    results = asyncio.run(
        execute_agent_plan(
            plan,
            handlers={AgentTool.SEARCH_CODE: search},
            on_event=lambda event_type, phase, message, metadata: events.append(
                (event_type, phase, message, metadata)
            ),
        )
    )

    assert attempts == 2
    assert results[0].content == "auth/login.py"
    assert [event[0] for event in events] == [
        "agent.step.started",
        "agent.step.retrying",
        "agent.step.started",
        "agent.step.completed",
    ]
    assert all(event[1] is AgentPhase.EXECUTING for event in events)
