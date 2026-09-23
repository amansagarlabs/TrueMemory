"""Measure the local deterministic fast-decision baseline.

Jev is only measured when explicitly requested with a disposable environment
and a server-side key. Otherwise the output records Jev as NOT_VERIFIED.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import time
from datetime import UTC, datetime

from agent.harness.decision.contract import DecisionQuestion, DecisionRequest
from agent.harness.decision.deterministic import DeterministicFastDecisionProvider
from agent.harness.decision.jev import JevClient, JevFastDecisionProvider


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return round(ordered[index], 3)


def request() -> DecisionRequest:
    return DecisionRequest(
        state={"user_message": "What did we decide last month about the database?"},
        decision_type="memory_relevance",
        request_id="truememory-phase11-17-benchmark",
        run_id="truememory-phase11-17-benchmark",
        questions={
            "memory_depth": DecisionQuestion(
                type="choice",
                instructions="Choose memory depth.",
                criteria={"none": "none", "episodic": "past events", "deep": "broad history"},
            )
        },
    )


async def measure(provider, count: int) -> dict[str, float | int]:
    samples: list[float] = []
    for _ in range(count):
        started = time.perf_counter()
        await provider.evaluate(request())
        samples.append((time.perf_counter() - started) * 1000)
    return {
        "count": count,
        "p50_ms": percentile(samples, 0.50),
        "p95_ms": percentile(samples, 0.95),
        "p99_ms": percentile(samples, 0.99),
        "mean_ms": round(statistics.mean(samples), 3),
    }


async def main(output: str | None, count: int) -> int:
    result: dict[str, object] = {
        "timestamp": datetime.now(UTC).isoformat(),
        "deterministic": await measure(DeterministicFastDecisionProvider(), count),
        "jev": {"status": "NOT_VERIFIED", "reason": "No disposable live Jev run requested"},
    }
    if (
        os.getenv("FAST_DECISION_BENCHMARK_LIVE", "false").lower() == "true"
        and os.getenv("TRUEMEMORY_RUNTIME_ENV", "").lower() == "disposable-test"
        and os.getenv("TYPESAFE_API_KEY", "").strip()
    ):
        client = JevClient(
            api_key=os.environ["TYPESAFE_API_KEY"],
            base_url=os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai"),
            model=os.getenv("TYPESAFE_DEFAULT_MODEL", "jev-latest"),
        )
        result["jev"] = await measure(JevFastDecisionProvider(client), count)
    payload = json.dumps(result, indent=2)
    print(payload)
    if output:
        with open(output, "w", encoding="utf-8") as handle:
            handle.write(payload + "\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--output")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.output, max(1, min(args.count, 10_000)))))
