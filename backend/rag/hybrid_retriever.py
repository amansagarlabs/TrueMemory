"""Session-scoped hybrid retrieval for the curated knowledge base.

The index is intentionally file-backed so it works in local development without
another service. Dense vectors are computed lazily, BM25 is deterministic, and
the optional cross-encoder is only loaded when configured.
"""

from __future__ import annotations

import json
import math
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from embeddings.embedder import embed_texts
from services.retrieval_scoring import bm25_scores, normalize_scores, tokenize


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    title: str
    text: str
    source: str
    metadata: dict[str, Any]


class HybridKnowledgeRetriever:
    def __init__(self, settings) -> None:
        self.settings = settings
        self._lock = threading.Lock()
        self._chunks: list[KnowledgeChunk] | None = None
        self._tokens: list[list[str]] = []
        self._idf: dict[str, float] = {}
        self._avgdl = 0.0
        self._vectors: np.ndarray | None = None
        self._reranker = None
        self._session_cache: OrderedDict[tuple[str, str], list[dict[str, Any]]] = OrderedDict()
        self._cache_limit = 128

    def reload(self) -> None:
        """Drop the in-process index after a knowledge-base write."""
        with self._lock:
            self._chunks = None
            self._tokens = []
            self._idf = {}
            self._avgdl = 0.0
            self._vectors = None
            self._reranker = None
            self._session_cache.clear()

    def warmup(self) -> dict[str, Any]:
        """Load the corpus and configured models before the first user query."""
        chunks = self._load_chunks()
        dense = False
        reranked = False
        if chunks:
            dense = bool(self._dense_scores("knowledge base warmup") and self._vectors is not None)
            if self.settings.cross_encoder_model.strip():
                reranked = bool(self._cross_encoder_scores("knowledge base warmup", [0]))
        return {"chunks": len(chunks), "dense": dense, "reranked": reranked}

    def search(
        self,
        question: str,
        *,
        session_key: str,
        top_k: int | None = None,
    ) -> dict[str, Any]:
        chunks = self._load_chunks()
        if not chunks or not question.strip():
            return {"chunks": [], "retrieval_ms": 0, "dense": False, "reranked": False}

        cache_key = (session_key, self._normalize_question(question))
        cached = self._session_cache.get(cache_key)
        if cached is not None:
            self._session_cache.move_to_end(cache_key)
            return {"chunks": cached, "retrieval_ms": 0, "dense": self._vectors is not None, "reranked": bool(self._reranker)}

        import time

        started = time.perf_counter()
        limit = max(1, top_k or self.settings.hybrid_top_k)
        bm25 = self._bm25_scores(question)
        dense = self._dense_scores(question)
        fused = self._fuse(bm25, dense)
        candidate_count = min(len(chunks), max(limit, self.settings.hybrid_candidate_k))
        candidates = sorted(range(len(chunks)), key=lambda i: fused[i], reverse=True)[:candidate_count]
        reranked = self._cross_encoder_scores(question, candidates)
        if reranked:
            ordered = sorted(candidates, key=lambda i: reranked[i], reverse=True)
        else:
            ordered = candidates

        results: list[dict[str, Any]] = []
        for rank, index in enumerate(ordered[:limit], start=1):
            chunk = chunks[index]
            results.append(
                {
                    "id": chunk.id,
                    "title": chunk.title,
                    "text": chunk.text,
                    "preview": chunk.text[:600],
                    "source": chunk.source,
                    "score": round(float(reranked.get(index, fused[index])), 5),
                    "bm25_score": round(float(bm25[index]), 5),
                    "dense_score": round(float(dense[index]), 5),
                    "rank": rank,
                    "metadata": chunk.metadata,
                }
            )

        self._session_cache[cache_key] = results
        self._session_cache.move_to_end(cache_key)
        while len(self._session_cache) > self._cache_limit:
            self._session_cache.popitem(last=False)
        return {
            "chunks": results,
            "retrieval_ms": round((time.perf_counter() - started) * 1000, 2),
            "dense": self._vectors is not None,
            "reranked": bool(reranked),
        }

    def _load_chunks(self) -> list[KnowledgeChunk]:
        if self._chunks is not None:
            return self._chunks
        with self._lock:
            if self._chunks is not None:
                return self._chunks
            path = Path(self.settings.curated_kb_path)
            if not path.exists():
                path = Path(__file__).resolve().parents[1] / "knowledge_base" / "curated.jsonl"
            rows: list[dict[str, Any]] = []
            if path.is_file():
                if path.suffix.lower() == ".jsonl":
                    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
                else:
                    payload = json.loads(path.read_text(encoding="utf-8"))
                    rows = payload if isinstance(payload, list) else payload.get("chunks", [])
            self._chunks = [
                KnowledgeChunk(
                    id=str(row.get("id") or f"kb-{index}"),
                    title=str(row.get("title") or "Curated source"),
                    text=str(row.get("text") or row.get("content") or "").strip(),
                    source=str(row.get("source") or row.get("url") or "curated knowledge base"),
                    metadata=dict(row.get("metadata") or {}),
                )
                for index, row in enumerate(rows)
                if str(row.get("text") or row.get("content") or "").strip()
            ]
            self._tokens = [self._tokenize(chunk.text) for chunk in self._chunks]
            document_frequency = Counter(token for tokens in self._tokens for token in set(tokens))
            count = len(self._chunks)
            self._idf = {token: math.log(1 + (count - frequency + 0.5) / (frequency + 0.5)) for token, frequency in document_frequency.items()}
            self._avgdl = sum(map(len, self._tokens)) / count if count else 0
            return self._chunks

    def _bm25_scores(self, question: str) -> list[float]:
        return bm25_scores([chunk.text for chunk in self._chunks or []], question)

    def _dense_scores(self, question: str) -> list[float]:
        chunks = self._chunks or []
        try:
            if self._vectors is None:
                with self._lock:
                    if self._vectors is None:
                        vectors = embed_texts([chunk.text for chunk in chunks], model_name=self.settings.embedding_model)["vectors"]
                        self._vectors = np.asarray(vectors, dtype=np.float32)
            query = np.asarray(embed_texts([question], model_name=self.settings.embedding_model)["vectors"][0], dtype=np.float32)
            denominator = np.linalg.norm(self._vectors, axis=1) * np.linalg.norm(query)
            values = np.divide(self._vectors @ query, denominator, out=np.zeros(len(chunks)), where=denominator != 0)
            return self._normalize(values.tolist())
        except Exception:
            return [0.0] * len(chunks)

    def _fuse(self, bm25: list[float], dense: list[float]) -> list[float]:
        dense_weight = float(self.settings.hybrid_dense_weight)
        bm25_weight = float(self.settings.hybrid_bm25_weight)
        total = dense_weight + bm25_weight or 1.0
        return [(dense_weight * d + bm25_weight * b) / total for d, b in zip(dense, bm25)]

    def _cross_encoder_scores(self, question: str, candidates: list[int]) -> dict[int, float]:
        model_name = self.settings.cross_encoder_model.strip()
        if not model_name or not candidates:
            return {}
        try:
            if self._reranker is None:
                with self._lock:
                    if self._reranker is None:
                        from sentence_transformers import CrossEncoder

                        self._reranker = CrossEncoder(model_name)
            pairs = [[question, (self._chunks or [])[index].text] for index in candidates]
            scores = self._reranker.predict(pairs).tolist()
            return dict(zip(candidates, self._normalize([float(score) for score in scores])))
        except Exception:
            return {}

    @staticmethod
    def _tokenize(value: str) -> list[str]:
        return tokenize(value)

    @staticmethod
    def _normalize_question(value: str) -> str:
        return " ".join(HybridKnowledgeRetriever._tokenize(value))

    @staticmethod
    def _normalize(values: list[float]) -> list[float]:
        return normalize_scores(values)
