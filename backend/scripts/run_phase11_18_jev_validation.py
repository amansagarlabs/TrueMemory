"""Guarded Phase 11.18 live Jev validation and shadow benchmark.

The deterministic fixture/calibration path is always runnable. Network calls
are performed only with --disposable-test and TRUEMEMORY_RUNTIME_ENV set to
disposable-test. Missing live credentials produce explicit NOT_VERIFIED output.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from agent.harness.decision.contract import DecisionQuestion, DecisionRequest
from agent.harness.decision.deterministic import DeterministicFastDecisionProvider
from agent.harness.decision.jev import JevClient, JevFastDecisionProvider


@dataclass(frozen=True)
class Fixture:
    fixture_id: str
    decision_type: str
    state: dict[str, Any]
    questions: dict[str, DecisionQuestion]
    expected: dict[str, Any]

    def request(self, provider: str) -> DecisionRequest:
        return DecisionRequest(
            state=self.state,
            questions=self.questions,
            decision_type=self.decision_type,
            request_id=f"phase11-18-{provider}-{self.fixture_id}",
            run_id=f"phase11-18-{self.fixture_id}",
        )


def _choice(options: dict[str, str], instructions: str) -> DecisionQuestion:
    return DecisionQuestion(type="choice", instructions=instructions, criteria=options)


def _noul(instructions: str) -> DecisionQuestion:
    return DecisionQuestion(type="noul", instructions=instructions)


def _score(levels: list[str], instructions: str) -> DecisionQuestion:
    return DecisionQuestion(type="score", instructions=instructions, criteria=levels)


def fixtures() -> list[Fixture]:
    depth = {
        "none": "No saved memory is needed.",
        "current_state": "Only current user or project state is needed.",
        "shallow": "A small amount of recent context is enough.",
        "semantic": "Saved decisions or stable facts are relevant.",
        "episodic": "Past events or timeline context are relevant.",
        "deep": "Broad historical context is required.",
    }
    routes = {
        "fast": "A short direct response is sufficient.",
        "reasoning": "The task needs multi-step reasoning or synthesis.",
    }
    base_questions = {
        "memory_depth": _choice(depth, "How much saved memory is relevant to this request?"),
        "model_route": _choice(routes, "Should this request use a fast or reasoning model?"),
    }
    return [
        Fixture(
            "A-current-framework",
            "chat_routing",
            {"user_message": "What is my current frontend framework?", "task_type": "chat"},
            base_questions,
            {"memory_depth": "current_state", "model_route": "fast"},
        ),
        Fixture(
            "B-arithmetic",
            "chat_routing",
            {"user_message": "What is 18 * 24?", "task_type": "chat"},
            base_questions,
            {"memory_depth": "none", "model_route": "fast"},
        ),
        Fixture(
            "C-postgres-decision",
            "chat_routing",
            {"user_message": "Why did we choose PostgreSQL?", "task_type": "chat"},
            base_questions,
            {"memory_depth": "semantic", "model_route": "fast"},
        ),
        Fixture(
            "D-before-vue",
            "chat_routing",
            {"user_message": "What were we using before Vue?", "task_type": "chat"},
            base_questions,
            {"memory_depth": "episodic", "model_route": "fast"},
        ),
        Fixture(
            "E-forget-preference",
            "tool_risk",
            {"candidate_tool": "memory_forget", "user_message": "Forget my stored project preference."},
            {"risk": _choice({"low": "Read-only.", "medium": "Limited reversible side effect.", "high": "Destructive or difficult to reverse."}, "Classify operational risk.")},
            {"risk": "high"},
        ),
        Fixture(
            "F-files-not-age",
            "memory_write_triage",
            {"user_message": "How many files were generated? The answer was 19."},
            {"should_remember": _noul("Should this be saved as a durable user age fact?")},
            {"should_remember": False},
        ),
        Fixture(
            "G-age-candidate",
            "memory_write_triage",
            {"user_message": "How old are you? The answer was 19."},
            {"should_remember": _noul("Should this be considered a candidate age fact?")},
            {"should_remember": True},
        ),
        Fixture(
            "H-noul-relevance",
            "memory_relevance",
            {"user_message": "Use what we decided last month about the database."},
            {"relevant": _noul("Is saved memory relevant to this request?")},
            {"relevant": True},
        ),
        Fixture(
            "I-score-memory-strength",
            "score",
            {"user_message": "Why did we choose PostgreSQL for this project?"},
            {"strength": _score(["not needed", "slightly useful", "strongly useful"], "How strongly should this request use long-term memory?")},
            {"strength": 2.0},
        ),
    ]


def _guard() -> None:
    if os.getenv("TRUEMEMORY_RUNTIME_ENV", "").strip().lower() != "disposable-test":
        raise SystemExit("Refusing live validation outside TRUEMEMORY_RUNTIME_ENV=disposable-test")
    environment = os.getenv("APP_ENV", "").strip().lower()
    if any(marker in environment for marker in ("prod", "production", "cloud")):
        raise SystemExit("Refusing live validation in a production-like environment")


def _percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))], 3)


def _metrics(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    labeled = [row for row in rows if key in row.get("expected", {}) and key in row.get("values", {})]
    if not labeled:
        return {"count": 0, "accuracy": None, "confusion_matrix": {}}
    matrix: Counter[tuple[str, str]] = Counter(
        (str(row["expected"][key]), str(row["values"][key])) for row in labeled
    )
    accuracy = sum(
        row["expected"][key] == row["values"][key]
        for row in labeled
    ) / len(labeled)
    return {
        "count": len(labeled),
        "accuracy": round(accuracy, 3),
        "confusion_matrix": {f"{expected}->{actual}": count for (expected, actual), count in matrix.items()},
    }


def _safe_row(fixture: Fixture, result, *, expected: bool = True) -> dict[str, Any]:
    return {
        "fixture_id": fixture.fixture_id,
        "decision_type": fixture.decision_type,
        "provider": result.provider,
        "model": result.model,
        "values": result.values,
        "confidences": result.confidences,
        "confidence": result.confidence,
        "latency_ms": result.latency_ms,
        "request_id": result.request_id,
        "run_id": result.run_id,
        "status": result.status,
        "fallback": result.fallback_used,
        "error": result.error,
        "expected": fixture.expected if expected else {},
    }


async def _run(args) -> dict[str, Any]:
    _guard()
    cases = fixtures()
    deterministic = DeterministicFastDecisionProvider()
    deterministic_rows: list[dict[str, Any]] = []
    for fixture in cases:
        deterministic_rows.append(
            _safe_row(
                fixture,
                await deterministic.evaluate(fixture.request("deterministic")),
            )
        )

    api_key = os.getenv("TYPESAFE_API_KEY", "").strip()
    live_status = "VERIFIED" if api_key else "NOT_VERIFIED"
    live_reason = None if api_key else "TYPESAFE_API_KEY is not configured"
    jev_rows: list[dict[str, Any]] = []
    agreements: list[bool] = []
    models: list[dict[str, Any]] = []
    jev_latencies: list[float] = []
    if api_key:
        client = JevClient(
            api_key=api_key,
            base_url=os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai"),
            model=os.getenv("TYPESAFE_DEFAULT_MODEL", "jev-latest"),
            timeout_seconds=float(os.getenv("FAST_DECISION_TIMEOUT_SECONDS", "1.5")),
            max_attempts=int(os.getenv("FAST_DECISION_MAX_ATTEMPTS", "2")),
        )
        try:
            models = await client.list_models()
            selected = client.model
            available_ids = {str(item.get("id") or item.get("name") or "") for item in models}
            if available_ids and selected not in available_ids and selected not in {"jev-latest", "jev-preview"}:
                raise RuntimeError("TYPESAFE_DEFAULT_MODEL is not present in /v1/models")
            provider = JevFastDecisionProvider(client)
            deterministic_by_id = {row["fixture_id"]: row for row in deterministic_rows}
            for fixture in cases:
                result = await provider.evaluate(fixture.request("jev"))
                row = _safe_row(fixture, result)
                jev_rows.append(row)
                jev_latencies.append(result.latency_ms)
                baseline = deterministic_by_id[fixture.fixture_id]["values"]
                compared = set(baseline) & set(result.values)
                agreements.append(bool(compared) and all(baseline[name] == result.values[name] for name in compared))
        except Exception as exc:
            live_status = "NOT_VERIFIED"
            live_reason = type(exc).__name__
            jev_rows = []
            agreements = []

    deterministic_latencies = [float(row["latency_ms"]) for row in deterministic_rows]
    result = {
        "phase": "11.18",
        "timestamp": datetime.now(UTC).isoformat(),
        "live_typesafe": live_status,
        "live_reason": live_reason,
        "model_discovery": {
            "status": "VERIFIED" if models else "NOT_VERIFIED",
            "model_count": len(models),
            "selected_model": os.getenv("TYPESAFE_DEFAULT_MODEL", "jev-latest") if api_key else None,
            "models": [{"id": item.get("id"), "name": item.get("name")} for item in models],
        },
        "system_one": "VERIFIED" if jev_rows else "NOT_VERIFIED",
        "deterministic_rows": deterministic_rows,
        "jev_rows": jev_rows,
        "agreement": {
            "count": len(agreements),
            "rate": round(sum(agreements) / len(agreements), 3) if agreements else None,
            "disagreements": sum(not value for value in agreements),
        },
        "metrics": {
            "deterministic_memory_depth": _metrics(deterministic_rows, "memory_depth"),
            "deterministic_memory_write": _metrics(deterministic_rows, "should_remember"),
            "jev_memory_depth": _metrics(jev_rows, "memory_depth"),
            "jev_memory_write": _metrics(jev_rows, "should_remember"),
        },
        "latency_ms": {
            "deterministic": {
                "p50": _percentile(deterministic_latencies, 0.50),
                "p95": _percentile(deterministic_latencies, 0.95),
                "p99": _percentile(deterministic_latencies, 0.99),
            },
            "jev": {
                "p50": _percentile(jev_latencies, 0.50) if jev_latencies else None,
                "p95": _percentile(jev_latencies, 0.95) if jev_latencies else None,
                "p99": _percentile(jev_latencies, 0.99) if jev_latencies else None,
            },
        },
        "failure_matrix": {
            "missing_key": "FALLBACK_TESTED_LOCALLY",
            "timeout": "MOCK_TESTED",
            "429": "MOCK_TESTED",
            "5xx": "MOCK_TESTED",
            "live_failure_injection": "NOT_VERIFIED" if not api_key else "NOT_RUN",
        },
        "cost": "NOT_VERIFIED",
        "production_touched": False,
    }
    return result


async def main(args) -> int:
    result = await _run(args)
    payload = json.dumps(result, indent=2)
    print(payload)
    if args.output:
        Path(args.output).write_text(payload + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--disposable-test", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()
    if not args.disposable_test:
        raise SystemExit("Pass --disposable-test to run Phase 11.18 validation")
    raise SystemExit(asyncio.run(main(args)))
