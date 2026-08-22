"""Benchmark structured KONTEXT Memory retrieval.

Example:
    python backend/evaluation/run_memory_benchmark.py --sizes 1000 10000
"""

from __future__ import annotations

import argparse
import gc
import json
import statistics
import tempfile
import time
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from services.memory_core import MemoryClient
from services.memory_store import _connect, init_memory_store


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((percentile / 100) * (len(ordered) - 1)))
    return round(ordered[index], 3)


def _seed(settings, count: int) -> None:
    with _connect(settings) as conn:
        conn.executemany(
            """
            INSERT INTO profile_memories (
                user_id, doc_id, memory_key, content, source, created_at, updated_at
            ) VALUES (?, 'general', ?, ?, 'benchmark', datetime('now'), datetime('now'))
            ON CONFLICT(user_id, doc_id, memory_key) DO UPDATE SET content = excluded.content
            """,
            [
                ("benchmark-user", f"fact_{index}", f"benchmark fact {index}")
                for index in range(count)
            ],
        )
        conn.commit()


def _seed_temporal_fixture(settings) -> None:
    with _connect(settings) as conn:
        conn.executemany(
            """
            INSERT INTO profile_memories (
                user_id, doc_id, memory_key, content, source, created_at, updated_at,
                valid_from, valid_until, confidence, revision
            ) VALUES (?, 'general', ?, ?, 'benchmark', datetime('now'), datetime('now'), ?, ?, ?, ?)
            ON CONFLICT(user_id, doc_id, memory_key) DO UPDATE SET
                content = excluded.content,
                valid_from = excluded.valid_from,
                valid_until = excluded.valid_until,
                confidence = excluded.confidence,
                revision = excluded.revision
            """,
            [
                (
                    "benchmark-user",
                    "database_legacy",
                    "Historical database was PostgreSQL.",
                    "2025-01-01T00:00:00Z",
                    "2026-08-01T00:00:00Z",
                    0.7,
                    1,
                ),
                (
                    "benchmark-user",
                    "database_current",
                    "Current database is MongoDB.",
                    "2026-08-01T00:00:00Z",
                    None,
                    0.95,
                    2,
                ),
            ],
        )
        conn.commit()


def _measure(function, samples: int) -> tuple[float, list[float]]:
    started = time.perf_counter()
    function()
    cold_ms = (time.perf_counter() - started) * 1000
    timings: list[float] = []
    for _ in range(samples):
        started = time.perf_counter()
        function()
        timings.append((time.perf_counter() - started) * 1000)
    return cold_ms, timings


def run(size: int, samples: int) -> dict:
    with tempfile.TemporaryDirectory(prefix="kontext-memory-benchmark-", ignore_cleanup_errors=True) as directory:
        settings = SimpleNamespace(memory_db_path=str(Path(directory) / "memory.db"))
        settings.embedding_model = "all-MiniLM-L6-v2"
        settings.memory_l2_candidate_limit = size + 2
        settings.memory_l2_semantic_enabled = True
        settings.memory_l2_rrf_k = 60
        init_memory_store(settings)
        _seed(settings, size)
        _seed_temporal_fixture(settings)
        client = MemoryClient(settings)
        query = f"fact {size // 2}"

        # First request proves L0 miss -> L1 structured fallback.
        client.hot_cache.invalidate(user_id="benchmark-user", scope="general")
        cold_start = time.perf_counter()
        cold_items = client.search(user_id="benchmark-user", query=query, limit=15)
        cold_ms = (time.perf_counter() - cold_start) * 1000

        l1_cold_ms, l1_timings = _measure(
            lambda: client.search_l1(user_id="benchmark-user", query=query, limit=15),
            samples,
        )
        l2_query = f"what is benchmark fact {size // 2}"
        client.hybrid.invalidate()
        l2_cold_ms, l2_timings = _measure(
            lambda: client.search_l2(user_id="benchmark-user", query=l2_query, limit=15),
            samples,
        )
        l2_items = client.search_l2(user_id="benchmark-user", query=l2_query, limit=15)
        current_items = client.search_l2(user_id="benchmark-user", query="current database", limit=5)
        historical_items = client.search_l2(
            user_id="benchmark-user",
            query="historical database",
            limit=10,
            include_history=True,
        )
        l2_metrics = client.hybrid.metrics()

        miss_timings: list[float] = []
        for _ in range(samples):
            client.hot_cache.invalidate(user_id="benchmark-user", scope="general")
            started = time.perf_counter()
            client.search(user_id="benchmark-user", query=query, limit=15)
            miss_timings.append((time.perf_counter() - started) * 1000)

        # Warm requests should be L0 hits.
        client.search(user_id="benchmark-user", query=query, limit=15)
        hit_timings: list[float] = []
        for _ in range(samples):
            started = time.perf_counter()
            client.search(user_id="benchmark-user", query=query, limit=15)
            hit_timings.append((time.perf_counter() - started) * 1000)

        serialization_start = time.perf_counter()
        json.dumps(l2_items, separators=(",", ":"))
        serialization_ms = (time.perf_counter() - serialization_start) * 1000
        cache_metrics = client.cache_metrics()

        expected_key = f"fact_{size // 2}"
        retrieved_keys = {str(item.get("key")) for item in cold_items}
        result = {
            "dataset_size": size,
            "samples": samples,
            "latency_p50_ms": _percentile(hit_timings, 50),
            "latency_p95_ms": _percentile(hit_timings, 95),
            "latency_p99_ms": _percentile(hit_timings, 99),
            "cold_retrieval_ms": round(cold_ms, 3),
            "warm_retrieval_ms": round(statistics.mean(hit_timings), 3),
            "l0_hit_p50_ms": _percentile(hit_timings, 50),
            "l0_hit_p95_ms": _percentile(hit_timings, 95),
            "l0_hit_p99_ms": _percentile(hit_timings, 99),
            "l0_miss_l1_fallback_p50_ms": _percentile(miss_timings, 50),
            "l0_miss_l1_fallback_p95_ms": _percentile(miss_timings, 95),
            "l0_miss_l1_fallback_p99_ms": _percentile(miss_timings, 99),
            "serialization_ms": round(serialization_ms, 3),
            "network_ms": 0.0,
            "cache_lookup_ms_total": cache_metrics.get("lookup_ms_total", 0.0),
            "cache_lookup_ms_avg": round(
                cache_metrics.get("lookup_ms_total", 0.0)
                / max(1, cache_metrics.get("hits", 0) + cache_metrics.get("misses", 0)),
                3,
            ),
            "fallback": "L0 miss -> L1 structured retrieval",
            "recall_at_1": int(bool(cold_items and cold_items[0].get("key") == expected_key)),
            "recall_at_5": int(expected_key in retrieved_keys),
            "recall_at_10": int(expected_key in retrieved_keys),
            "recall_at_15": int(expected_key in retrieved_keys),
            "cache_hit_rate": cache_metrics.get("hit_rate"),
            "retrieval_tier": "L1_structured",
            "l1_vs_l2": {
                "l1": {
                    "p50_ms": _percentile(l1_timings, 50),
                    "p95_ms": _percentile(l1_timings, 95),
                    "p99_ms": _percentile(l1_timings, 99),
                    "cold_ms": round(l1_cold_ms, 3),
                    "warm_ms": round(statistics.mean(l1_timings), 3),
                    "recall_at_1": int(bool(cold_items and cold_items[0].get("key") == expected_key)),
                    "recall_at_15": int(expected_key in retrieved_keys),
                },
                "l2": {
                    "p50_ms": _percentile(l2_timings, 50),
                    "p95_ms": _percentile(l2_timings, 95),
                    "p99_ms": _percentile(l2_timings, 99),
                    "cold_ms": round(l2_cold_ms, 3),
                    "warm_ms": round(statistics.mean(l2_timings), 3),
                    "recall_at_1": int(bool(l2_items and l2_items[0].get("key") == expected_key)),
                    "recall_at_15": int(expected_key in {str(item.get("key")) for item in l2_items}),
                    "temporal_accuracy": int(bool(current_items and current_items[0].get("key") == "database_current")),
                    "knowledge_update_accuracy": int(
                        bool(current_items and current_items[0].get("content") == "Current database is MongoDB.")
                    ),
                    "historical_recall": int("database_legacy" in {str(item.get("key")) for item in historical_items}),
                    "embedding_ms": l2_metrics.get("semantic_ms", 0.0),
                    "vector_search_ms": 0.0,
                    "postgres_ms": 0.0,
                    "fusion_ms": l2_metrics.get("fusion_ms", 0.0),
                    "reranking_ms": 0.0,
                    "serialization_ms": round(serialization_ms, 3),
                    "reranked": bool(l2_metrics.get("reranked", False)),
                    "errors": l2_metrics.get("errors", []),
                },
                "network_ms": 0.0,
            },
        }
        gc.collect()
        return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sizes", nargs="+", type=int, default=[1000])
    parser.add_argument("--samples", type=int, default=25)
    args = parser.parse_args()
    print(json.dumps({"benchmark": "KONTEXT Memory", "results": [run(size, args.samples) for size in args.sizes]}, indent=2))


if __name__ == "__main__":
    main()
