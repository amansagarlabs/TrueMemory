"""Review-only router A/B comparison harness."""

from __future__ import annotations

from typing import Any

from query.router import decide_route


def compare_router_variants(questions: list[str]) -> dict[str, Any]:
    """Compare registered variants without changing production routing."""
    rows = []
    for question in questions:
        baseline = decide_route(question).model_dump(mode="json")
        candidate = decide_route(question).model_dump(mode="json")
        rows.append({
            "question": question,
            "variants": {"v1": baseline, "v2": candidate},
            "changed": baseline != candidate,
        })
    changed = sum(1 for row in rows if row["changed"])
    return {
        "experiment": "router-v1-v2-preview",
        "production_variant": "v1",
        "candidate_status": "review_only",
        "cases": len(rows),
        "changed_cases": changed,
        "rows": rows,
    }
