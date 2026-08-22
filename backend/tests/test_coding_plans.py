from services.coding_plans import (
    PLAN_ARTIFACT_PATH,
    normalize_coding_plan,
    render_coding_plan_markdown,
)


def _plan() -> dict:
    return {
        "goal": "Add repository-aware task restoration",
        "summary": "Restore tasks without opening the editor.",
        "approach": "Separate task restoration from file selection.",
        "options": [
            {
                "id": "agent-first",
                "title": "Agent-first restoration",
                "description": "Separate task restoration from file selection.",
                "tradeoff": "Preserves the centered Agent surface.",
                "recommended": True,
            },
            {
                "id": "editor-first",
                "title": "Editor-first restoration",
                "description": "Restore the last file together with the task.",
                "tradeoff": "Faster file access but opens Monaco automatically.",
                "recommended": False,
            },
        ],
        "selectedOptionId": "agent-first",
        "acceptanceCriteria": ["A recent task opens on the Agent surface."],
        "constraints": ["Do not select a file automatically."],
        "outOfScope": ["Redesigning Monaco."],
        "risks": ["Legacy routes may still contain a file path."],
        "steps": [
            {
                "id": "restore-task",
                "title": "Restore the durable task",
                "tool": "search_code",
                "reason": "Load the task before choosing a surface.",
                "description": "Resolve the task and repository state independently.",
                "files": ["app/coding/page.tsx"],
                "dependencies": [],
                "validation": "Open /coding?task=<id> and verify Agent remains active.",
                "status": "pending",
                "attempt": 0,
                "max_attempts": 2,
            }
        ],
    }


def test_plan_artifact_has_a_stable_workspace_path() -> None:
    assert PLAN_ARTIFACT_PATH == "plans-goals/task.md"


def test_plan_markdown_contains_binding_scope_and_validation() -> None:
    markdown = render_coding_plan_markdown(_plan())

    assert "# Current Kontext Goal" in markdown
    assert "## Done Looks Like" in markdown
    assert "## Selected Approach" in markdown
    assert "`app/coding/page.tsx`" in markdown
    assert "Open /coding?task=<id>" in markdown
    assert "one isolated writer" in markdown


def test_plan_normalization_bounds_untrusted_fields() -> None:
    plan = _plan()
    plan["steps"][0]["files"] = [f"file-{index}.ts" for index in range(100)]
    normalized = normalize_coding_plan(plan)

    assert len(normalized["steps"]) == 1
    assert len(normalized["steps"][0]["files"]) == 30
    assert normalized["steps"][0]["title"] == "Restore the durable task"
    assert len(normalized["options"]) == 2
    assert normalized["selectedOptionId"] == "agent-first"


def test_custom_approach_is_preserved_as_the_build_contract() -> None:
    plan = _plan()
    plan["selectedOptionId"] = "custom"
    plan["customApproach"] = "Keep the task agent-only and expose code on demand."
    plan["approach"] = plan["customApproach"]

    normalized = normalize_coding_plan(plan)
    markdown = render_coding_plan_markdown(plan)

    assert normalized["selectedOptionId"] == "custom"
    assert normalized["customApproach"] == plan["customApproach"]
    assert plan["customApproach"] in markdown
