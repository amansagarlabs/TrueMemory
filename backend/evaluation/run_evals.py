from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from query.models import QueryMode  # noqa: E402
from query.router import decide_route  # noqa: E402
from evaluation.continuous_improvement import routing_metrics  # noqa: E402


DATASET_PATH = Path(__file__).with_name("benchmark.json")


@dataclass(frozen=True)
class AssertionResult:
    field: str
    expected: Any
    actual: Any
    passed: bool


def _load_cases(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError("Evaluation dataset must be a non-empty JSON array")
    return payload


def _assert_case(case: dict[str, Any]) -> dict[str, Any]:
    expected = case["expected"]
    decision = decide_route(
        case["question"],
        requested_mode=case.get("requested_mode", QueryMode.AUTO),
        doc_id=case.get("doc_id"),
    )
    actual = decision.model_dump(mode="json")
    assertions: list[AssertionResult] = []
    for field, expected_value in expected.items():
        actual_value = actual.get(field)
        assertions.append(
            AssertionResult(
                field=field,
                expected=expected_value,
                actual=actual_value,
                passed=actual_value == expected_value,
            )
        )

    passed = all(item.passed for item in assertions)
    report = {
        "id": case["id"],
        "question": case["question"],
        "critical": bool(case.get("critical", False)),
        "passed": passed,
        "route": actual,
        "assertions": [item.__dict__ for item in assertions],
    }
    return report


def run(dataset_path: Path = DATASET_PATH) -> dict[str, Any]:
    cases = _load_cases(dataset_path)
    results = [_assert_case(case) for case in cases]
    passed = sum(1 for result in results if result["passed"])
    critical_failures = [
        result["id"] for result in results if result["critical"] and not result["passed"]
    ]
    total_assertions = sum(len(result["assertions"]) for result in results)
    passed_assertions = sum(
        sum(1 for assertion in result["assertions"] if assertion["passed"])
        for result in results
    )
    report = {
        "schema_version": "1.0",
        "suite": "kontext-routing-core",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(dataset_path.relative_to(ROOT)),
        "cases": len(results),
        "passed_cases": passed,
        "failed_cases": len(results) - passed,
        "assertions": total_assertions,
        "passed_assertions": passed_assertions,
        "score": round(passed_assertions / total_assertions, 4) if total_assertions else 0,
        "critical_failures": critical_failures,
        "gate": "pass" if not critical_failures and passed == len(results) else "fail",
        "results": results,
    }
    report["metrics"] = routing_metrics(report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Kontext's deterministic routing evaluation")
    parser.add_argument("--dataset", type=Path, default=DATASET_PATH)
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()
    report = run(args.dataset.resolve())
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    print(rendered)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(rendered + "\n", encoding="utf-8")
    return 0 if report["gate"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
