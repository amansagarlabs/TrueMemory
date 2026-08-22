"""L2 hybrid retrieval for authorized memory candidates.

The caller supplies already scope-filtered records. This layer only ranks those
records; it never broadens the authorization boundary. Lexical, semantic, and
exact-key evidence are gathered independently and fused with RRF.
"""

from __future__ import annotations

import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

import numpy as np

from embeddings.embedder import embed_texts
from services.retrieval_scoring import bm25_scores, reciprocal_rank_fusion, tokenize


_HISTORY_QUERY_RE = re.compile(r"\b(history|historical|previous|formerly|used to|before)\b", re.IGNORECASE)
_INACTIVE_STATUSES = {"superseded", "rejected", "archived", "deleted"}


def _as_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def _record_id(record: dict[str, Any], scope: str) -> str:
    return str(record.get("id") or f"profile:{scope}:{record.get('key') or record.get('memory_key') or ''}")


class MemoryHybridRetriever:
    def __init__(self, settings: Any):
        self.settings = settings
        self._lock = threading.RLock()
        self._vectors: dict[tuple[str, str], np.ndarray] = {}
        self._semantic_disabled_until = 0.0
        self._last_metrics: dict[str, Any] = {}

    def invalidate(self) -> None:
        with self._lock:
            self._vectors.clear()
            self._semantic_disabled_until = 0.0

    def metrics(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._last_metrics)

    def search(
        self,
        records: list[dict[str, Any]],
        *,
        query: str,
        scope: str,
        limit: int,
        as_of: str | datetime | None = None,
        include_history: bool = False,
    ) -> list[dict[str, Any]]:
        started = datetime.now(UTC)
        requested_at = _as_datetime(as_of) or datetime.now(UTC)
        history = include_history or bool(_HISTORY_QUERY_RE.search(query))
        filtered = self.filter_temporal(records, as_of=requested_at, include_history=history)
        filtered = self._deduplicate_records(filtered, include_history=history, scope=scope)
        if not filtered or not query.strip():
            self._set_metrics(started, candidate_count=len(filtered), errors=[])
            return []

        documents = [f"{item.get('key') or item.get('memory_key') or ''} {item.get('content') or ''}" for item in filtered]
        errors: list[str] = []
        timings: dict[str, float] = {}
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="memory-l2") as executor:
            lexical_future = executor.submit(self._timed, "lexical_ms", timings, bm25_scores, documents, query)
            exact_future = executor.submit(self._timed, "exact_ms", timings, self._exact_ranking, filtered, query, scope)
            semantic_future = executor.submit(self._timed, "semantic_ms", timings, self._semantic_scores, filtered, documents, query)
            try:
                lexical_scores = lexical_future.result()
            except Exception as exc:  # pragma: no cover - defensive executor boundary
                lexical_scores = [0.0] * len(filtered)
                errors.append(f"lexical:{type(exc).__name__}")
            try:
                exact_ids = exact_future.result()
            except Exception as exc:  # pragma: no cover - defensive executor boundary
                exact_ids = []
                errors.append(f"exact:{type(exc).__name__}")
            try:
                semantic_scores = semantic_future.result()
            except Exception as exc:  # semantic failure must not erase lexical results
                semantic_scores = [0.0] * len(filtered)
                errors.append(f"semantic:{type(exc).__name__}")

        ids = [_record_id(item, scope) for item in filtered]
        lexical_ids = [item_id for score, item_id in sorted(zip(lexical_scores, ids), reverse=True) if score > 0]
        semantic_ids = [item_id for score, item_id in sorted(zip(semantic_scores, ids), reverse=True) if score > 0]
        rankings = {"lexical": lexical_ids, "exact": exact_ids}
        if semantic_ids:
            rankings["semantic"] = semantic_ids
        fusion_started = time.perf_counter()
        fused, sources = reciprocal_rank_fusion(
            {name: values for name, values in rankings.items() if values},
            rrf_k=int(getattr(self.settings, "memory_l2_rrf_k", 60)),
        )
        timings["fusion_ms"] = round((time.perf_counter() - fusion_started) * 1000, 3)
        by_id = {item_id: item for item_id, item in zip(ids, filtered)}
        lexical_by_id = dict(zip(ids, lexical_scores))
        semantic_by_id = dict(zip(ids, semantic_scores))
        ordered_ids = sorted(
            fused,
            key=lambda item_id: (
                fused[item_id],
                float(by_id[item_id].get("confidence") or by_id[item_id].get("confidence_score") or 0.0),
                int(by_id[item_id].get("revision") or 0),
                str(by_id[item_id].get("updated_at") or ""),
                item_id,
            ),
            reverse=True,
        )
        results: list[dict[str, Any]] = []
        for rank, item_id in enumerate(ordered_ids[: max(1, min(limit, 100))], start=1):
            item = dict(by_id[item_id])
            item["id"] = item_id
            item["score"] = round(float(fused[item_id]), 6)
            item["lexical_score"] = round(float(lexical_by_id.get(item_id, 0.0)), 6)
            item["semantic_score"] = round(float(semantic_by_id.get(item_id, 0.0)), 6)
            item["retrieval_sources"] = sources.get(item_id, [])
            item["retrieval_tier"] = "L2_hybrid"
            item["rank"] = rank
            results.append(item)
        self._set_metrics(
            started,
            candidate_count=len(filtered),
            lexical_count=len(lexical_ids),
            semantic_count=len(semantic_ids),
            exact_count=len(exact_ids),
            reranked=False,
            **timings,
            errors=errors,
        )
        return results

    def filter_temporal(
        self,
        records: list[dict[str, Any]],
        *,
        as_of: str | datetime | None = None,
        include_history: bool = False,
    ) -> list[dict[str, Any]]:
        return self._temporal_filter(
            records,
            requested_at=_as_datetime(as_of) or datetime.now(UTC),
            include_history=include_history,
        )

    @staticmethod
    def _temporal_filter(
        records: list[dict[str, Any]],
        *,
        requested_at: datetime,
        include_history: bool,
    ) -> list[dict[str, Any]]:
        filtered: list[dict[str, Any]] = []
        for record in records:
            status = str(record.get("lifecycle_status") or record.get("status") or "").casefold()
            if not include_history and status in _INACTIVE_STATUSES:
                continue
            if not include_history:
                valid_from = _as_datetime(record.get("valid_from"))
                valid_until = _as_datetime(record.get("valid_until"))
                if valid_from and valid_from > requested_at:
                    continue
                if valid_until and valid_until <= requested_at:
                    continue
            filtered.append(record)
        return filtered

    @staticmethod
    def _deduplicate_records(
        records: list[dict[str, Any]],
        *,
        include_history: bool,
        scope: str,
    ) -> list[dict[str, Any]]:
        if include_history:
            by_id: dict[str, dict[str, Any]] = {}
            for record in records:
                by_id[_record_id(record, scope)] = record
            return list(by_id.values())
        selected: dict[str, dict[str, Any]] = {}
        for record in records:
            logical_key = str(record.get("key") or record.get("memory_key") or _record_id(record, scope))
            current = selected.get(logical_key)
            if current is None or (
                int(record.get("revision") or 0),
                _as_datetime(record.get("updated_at")) or datetime.min.replace(tzinfo=UTC),
            ) > (
                int(current.get("revision") or 0),
                _as_datetime(current.get("updated_at")) or datetime.min.replace(tzinfo=UTC),
            ):
                selected[logical_key] = record
        return list(selected.values())

    @staticmethod
    def _exact_ranking(records: list[dict[str, Any]], query: str, scope: str) -> list[str]:
        query_tokens = set(tokenize(query))
        if not query_tokens:
            return []
        ranked: list[tuple[int, str]] = []
        for index, record in enumerate(records):
            key_tokens = set(tokenize(str(record.get("key") or record.get("memory_key") or "")))
            if query_tokens <= key_tokens:
                ranked.append((index, ""))
        return [_record_id(records[index], scope) for index, _ in ranked]

    def _semantic_scores(self, records: list[dict[str, Any]], documents: list[str], query: str) -> list[float]:
        if not bool(getattr(self.settings, "memory_l2_semantic_enabled", True)):
            return [0.0] * len(records)
        with self._lock:
            if time.monotonic() < self._semantic_disabled_until:
                return [0.0] * len(records)
        model_name = str(getattr(self.settings, "embedding_model", "all-MiniLM-L6-v2"))
        fingerprint = sha256("\n".join(
            f"{item.get('id') or item.get('key') or item.get('memory_key')}|{item.get('revision', 0)}|{item.get('content', '')}"
            for item in records
        ).encode("utf-8")).hexdigest()
        cache_key = (fingerprint, model_name)
        with self._lock:
            vectors = self._vectors.get(cache_key)
        try:
            if vectors is None:
                vectors = np.asarray(embed_texts(documents, model_name=model_name)["vectors"], dtype=np.float32)
                with self._lock:
                    self._vectors[cache_key] = vectors
                    if len(self._vectors) > 16:
                        self._vectors.pop(next(iter(self._vectors)))
            query_vector = np.asarray(embed_texts([query], model_name=model_name)["vectors"][0], dtype=np.float32)
        except Exception:
            with self._lock:
                self._semantic_disabled_until = time.monotonic() + float(getattr(self.settings, "memory_l2_embedding_retry_seconds", 30.0))
            raise
        denominator = np.linalg.norm(vectors, axis=1) * np.linalg.norm(query_vector)
        similarities = np.divide(vectors @ query_vector, denominator, out=np.zeros(len(records)), where=denominator != 0)
        low, high = float(np.min(similarities)), float(np.max(similarities))
        if high <= low:
            return [1.0 if high > 0 else 0.0 for _ in similarities]
        return [float((value - low) / (high - low)) for value in similarities]

    def _set_metrics(self, started: datetime, **values: Any) -> None:
        elapsed = (datetime.now(UTC) - started).total_seconds() * 1000
        with self._lock:
            self._last_metrics = {"latency_ms": round(elapsed, 3), **values}

    @staticmethod
    def _timed(name: str, timings: dict[str, float], function, *args):
        started = time.perf_counter()
        try:
            return function(*args)
        finally:
            timings[name] = round((time.perf_counter() - started) * 1000, 3)


_retrievers: dict[str, MemoryHybridRetriever] = {}
_retrievers_lock = threading.Lock()


def get_memory_hybrid_retriever(settings: Any) -> MemoryHybridRetriever:
    key = str(getattr(settings, "database_url", "") or getattr(settings, "memory_db_path", ""))
    with _retrievers_lock:
        if key not in _retrievers:
            _retrievers[key] = MemoryHybridRetriever(settings)
        return _retrievers[key]
