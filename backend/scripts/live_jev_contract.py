"""Guarded optional live Jev contract check.

This script never runs against production unless the caller explicitly marks a
disposable environment. Missing credentials are a successful NOT_VERIFIED
result, not a reason to fail the normal test suite.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime

from agent.harness.decision.contract import DecisionQuestion, DecisionRequest
from agent.harness.decision.jev import JevClient, JevFastDecisionProvider


def _guard() -> None:
    if os.getenv("TRUEMEMORY_RUNTIME_ENV", "").strip().lower() != "disposable-test":
        raise SystemExit("Refusing live Jev checks outside TRUEMEMORY_RUNTIME_ENV=disposable-test")
    if any(
        marker in os.getenv("APP_ENV", "").strip().lower()
        for marker in ("prod", "production", "cloud")
    ):
        raise SystemExit("Refusing live Jev checks in a production-like environment")


async def main(output: str | None) -> int:
    _guard()
    api_key = os.getenv("TYPESAFE_API_KEY", "").strip()
    result: dict[str, object] = {
        "timestamp": datetime.now(UTC).isoformat(),
        "live_jev": "NOT_VERIFIED",
        "reason": "TYPESAFE_API_KEY is not configured",
    }
    if api_key:
        client = JevClient(
            api_key=api_key,
            base_url=os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai"),
            model=os.getenv("TYPESAFE_DEFAULT_MODEL", "jev-latest"),
            timeout_seconds=float(os.getenv("FAST_DECISION_TIMEOUT_SECONDS", "1.5")),
            max_attempts=int(os.getenv("FAST_DECISION_MAX_ATTEMPTS", "2")),
        )
        request = DecisionRequest(
            state={"message": "A disposable contract check for structured routing."},
            decision_type="live_contract",
            request_id="truememory-phase11-17-live",
            run_id="truememory-phase11-17-live",
            questions={
                "route": DecisionQuestion(
                    type="choice",
                    instructions="Choose the best route for this message.",
                    criteria={"general": "General assistance.", "support": "Support assistance."},
                ),
                "risk": DecisionQuestion(
                    type="score",
                    instructions="Score the operational risk of this disposable check.",
                    criteria=["low", "medium", "high"],
                ),
                "is_disposable": DecisionQuestion(
                    type="noul",
                    instructions="Is this explicitly a disposable test state?",
                ),
            },
        )
        try:
            models = await client.list_models()
            evaluation = await JevFastDecisionProvider(client).evaluate(request)
            result.update(
                {
                    "live_jev": "VERIFIED",
                    "reason": None,
                    "model": evaluation.model,
                    "model_count": len(models),
                    "values": evaluation.values,
                    "latency_ms": evaluation.latency_ms,
                }
            )
        except Exception as exc:
            result.update({"live_jev": "NOT_VERIFIED", "reason": type(exc).__name__})

    payload = json.dumps(result, indent=2)
    print(payload)
    if output:
        with open(output, "w", encoding="utf-8") as handle:
            handle.write(payload + "\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--disposable-test", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()
    if not args.disposable_test:
        raise SystemExit("Pass --disposable-test to run the guarded check")
    raise SystemExit(asyncio.run(main(args.output)))
