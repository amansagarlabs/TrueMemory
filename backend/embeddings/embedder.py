"""Step 6 — Dense embeddings via sentence-transformers."""

from __future__ import annotations

import time
from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer


@lru_cache(maxsize=1)
def _load_model(model_name: str) -> SentenceTransformer:
    return SentenceTransformer(model_name)


def embed_query(text: str, *, model_name: str) -> list[float]:
    model = _load_model(model_name)
    vector = model.encode([text], show_progress_bar=False, convert_to_numpy=True)[0]
    return vector.tolist()


def embed_texts(texts: list[str], *, model_name: str) -> dict:
    start = time.perf_counter()
    if not texts:
        return {
            "model": model_name,
            "dimension": 0,
            "count": 0,
            "sample_vector_head": [],
            "duration_ms": 0,
        }

    model = _load_model(model_name)
    vectors = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    dim = int(vectors.shape[1])
    sample = vectors[0][:8].tolist()

    elapsed_ms = (time.perf_counter() - start) * 1000
    return {
        "model": model_name,
        "dimension": dim,
        "count": len(texts),
        "sample_vector_head": [round(v, 5) for v in sample],
        "vectors": vectors,
        "duration_ms": round(elapsed_ms, 2),
    }
