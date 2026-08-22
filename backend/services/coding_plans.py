"""Durable user-facing plans and their isolated-workspace artifact."""

from __future__ import annotations

import json
from typing import Any

from services.postgres_store import _connect, postgres_enabled

PLAN_ARTIFACT_PATH = "plans-goals/task.md"


def _ensure_table(settings: Any) -> None:
    if not postgres_enabled(settings):
        raise RuntimeError("postgres_required_for_coding_plans")
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS coding_task_plans (
                    task_id UUID PRIMARY KEY REFERENCES coding_tasks(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan JSONB NOT NULL,
                    markdown TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'approved')),
                    revision INTEGER NOT NULL DEFAULT 1,
                    approved_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_coding_task_plans_user
                    ON coding_task_plans(user_id, updated_at DESC);
                """
            )
        conn.commit()


def normalize_coding_plan(plan: dict[str, Any]) -> dict[str, Any]:
    raw_steps = plan.get("steps")
    if not isinstance(raw_steps, list) or not raw_steps:
        raise ValueError("A coding plan requires at least one step.")
    steps: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_steps[:12], start=1):
        if not isinstance(raw, dict):
            continue
        title = str(raw.get("title") or "").strip()[:200]
        if not title:
            continue
        files = raw.get("files") if isinstance(raw.get("files"), list) else []
        dependencies = (
            raw.get("dependencies")
            if isinstance(raw.get("dependencies"), list)
            else []
        )
        steps.append(
            {
                "id": str(raw.get("id") or f"step-{index}")[:120],
                "title": title,
                "tool": str(raw.get("tool") or "search_code")[:80],
                "reason": str(raw.get("reason") or "").strip()[:1_000],
                "description": str(raw.get("description") or "").strip()[:2_000],
                "files": [str(item).strip()[:500] for item in files[:30] if str(item).strip()],
                "dependencies": [
                    str(item).strip()[:120]
                    for item in dependencies[:20]
                    if str(item).strip()
                ],
                "validation": str(raw.get("validation") or "").strip()[:1_000],
                "status": str(raw.get("status") or "pending")[:40],
                "attempt": int(raw.get("attempt") or 0),
                "max_attempts": max(1, min(int(raw.get("max_attempts") or 2), 5)),
            }
        )
    if not steps:
        raise ValueError("A coding plan requires a valid step.")

    def string_list(key: str, limit: int = 20) -> list[str]:
        value = plan.get(key)
        if not isinstance(value, list):
            return []
        return [str(item).strip()[:1_000] for item in value[:limit] if str(item).strip()]

    raw_options = plan.get("options")
    options: list[dict[str, Any]] = []
    if isinstance(raw_options, list):
        for index, raw_option in enumerate(raw_options[:2], start=1):
            if not isinstance(raw_option, dict):
                continue
            description = str(raw_option.get("description") or "").strip()[:2_000]
            if not description:
                continue
            options.append(
                {
                    "id": str(raw_option.get("id") or f"option-{index}").strip()[:80],
                    "title": str(raw_option.get("title") or f"Approach {index}").strip()[:160],
                    "description": description,
                    "tradeoff": str(raw_option.get("tradeoff") or "").strip()[:1_000],
                    "recommended": bool(raw_option.get("recommended")),
                }
            )
    selected_option_id = str(plan.get("selectedOptionId") or "").strip()[:80]
    valid_option_ids = {option["id"] for option in options}
    if selected_option_id not in valid_option_ids and selected_option_id != "custom":
        selected_option_id = next(
            (option["id"] for option in options if option["recommended"]),
            options[0]["id"] if options else "",
        )

    return {
        "version": 1,
        "goal": str(plan.get("goal") or "").strip()[:4_000],
        "summary": str(plan.get("summary") or "").strip()[:2_000],
        "approach": str(plan.get("approach") or "").strip()[:4_000],
        "options": options,
        "selectedOptionId": selected_option_id,
        "customApproach": str(plan.get("customApproach") or "").strip()[:4_000],
        "acceptanceCriteria": string_list("acceptanceCriteria"),
        "constraints": string_list("constraints"),
        "outOfScope": string_list("outOfScope"),
        "risks": string_list("risks"),
        "steps": steps,
    }


def render_coding_plan_markdown(plan: dict[str, Any]) -> str:
    normalized = normalize_coding_plan(plan)
    lines = [
        "# Current Kontext Goal",
        "",
        "> This file is generated from the user-approved Plan. Agents must read it before making changes.",
        "",
        "## Objective",
        "",
        normalized["goal"] or normalized["summary"] or "Complete the approved coding task.",
        "",
        "## Selected Approach",
        "",
        normalized["approach"] or normalized["summary"] or "Follow the approved steps below.",
    ]

    def add_list(title: str, values: list[str]) -> None:
        if not values:
            return
        lines.extend(["", f"## {title}", ""])
        lines.extend(f"- {value}" for value in values)

    add_list("Done Looks Like", normalized["acceptanceCriteria"])
    add_list("Constraints", normalized["constraints"])
    add_list("Out of Scope", normalized["outOfScope"])
    add_list("Risks", normalized["risks"])
    lines.extend(["", "## Build Steps", ""])
    for index, step in enumerate(normalized["steps"], start=1):
        lines.append(f"### {index}. {step['title']}")
        if step["description"] or step["reason"]:
            lines.extend(["", step["description"] or step["reason"]])
        if step["files"]:
            lines.extend(["", "**Likely files**", ""])
            lines.extend(f"- `{path}`" for path in step["files"])
        if step["dependencies"]:
            lines.extend(["", f"**Depends on:** {', '.join(step['dependencies'])}"])
        if step["validation"]:
            lines.extend(["", f"**Validation:** {step['validation']}"])
        lines.append("")
    lines.extend(
        [
            "## Agent Rules",
            "",
            "- Keep work inside the approved objective and constraints.",
            "- Use one isolated writer; specialists remain read-only.",
            "- Validate each completed step before marking the task ready for review.",
            "- Request approval before local apply, network access, commits, pull requests, or previews.",
            "",
        ]
    )
    return "\n".join(lines)


def save_coding_plan(
    settings: Any,
    *,
    user_id: str,
    task_id: str,
    plan: dict[str, Any],
    status: str = "draft",
) -> dict[str, Any]:
    if status not in {"draft", "approved"}:
        raise ValueError("Invalid coding plan status.")
    _ensure_table(settings)
    normalized = normalize_coding_plan(plan)
    markdown = render_coding_plan_markdown(normalized)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO coding_task_plans (
                    task_id, user_id, plan, markdown, status, approved_at
                )
                SELECT tasks.id, tasks.user_id, %s::jsonb, %s, %s,
                       CASE WHEN %s = 'approved' THEN NOW() ELSE NULL END
                FROM coding_tasks AS tasks
                WHERE tasks.id = %s AND tasks.user_id = %s
                ON CONFLICT (task_id) DO UPDATE SET
                    plan = EXCLUDED.plan,
                    markdown = EXCLUDED.markdown,
                    status = EXCLUDED.status,
                    revision = coding_task_plans.revision + 1,
                    approved_at = CASE
                        WHEN EXCLUDED.status = 'approved' THEN NOW()
                        ELSE coding_task_plans.approved_at
                    END,
                    updated_at = NOW()
                RETURNING task_id::text, plan, markdown, status, revision,
                          approved_at, created_at, updated_at
                """,
                (json.dumps(normalized), markdown, status, status, task_id, user_id),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Coding task was not found.")
            conn.commit()
            return {**dict(row), "artifact_path": PLAN_ARTIFACT_PATH}


def get_coding_plan(
    settings: Any,
    *,
    user_id: str,
    task_id: str,
) -> dict[str, Any] | None:
    _ensure_table(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT task_id::text, plan, markdown, status, revision,
                       approved_at, created_at, updated_at
                FROM coding_task_plans
                WHERE task_id = %s AND user_id = %s
                """,
                (task_id, user_id),
            )
            row = cur.fetchone()
    return {**dict(row), "artifact_path": PLAN_ARTIFACT_PATH} if row else None
