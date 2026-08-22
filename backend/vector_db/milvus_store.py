"""Step 7 — Insert chunk vectors into Zilliz / Milvus."""

from __future__ import annotations

import time

import numpy as np

from app.config import Settings
from vector_db.milvus_client import get_milvus_client


def delete_doc_chunks(settings: Settings, doc_id: str) -> None:
    client = get_milvus_client(settings)
    collection = settings.milvus_collection
    client.delete(collection_name=collection, filter=f'doc_id == "{doc_id}"')


def insert_chunks(
    settings: Settings,
    *,
    doc_id: str,
    filename: str,
    chunks: list[dict],
    vectors: np.ndarray,
) -> dict:
    start = time.perf_counter()
    client = get_milvus_client(settings)
    collection = settings.milvus_collection

    delete_doc_chunks(settings, doc_id)

    rows = []
    for i, ch in enumerate(chunks):
        rows.append(
            {
                "vector": vectors[i].tolist(),
                "text": ch["text"][:8192],
                "doc_id": doc_id[:64],
                "filename": filename[:512],
                "page": int(ch.get("page", 0)),
                "chunk_index": int(ch["chunk_index"]),
            }
        )

    batch = 50
    for offset in range(0, len(rows), batch):
        client.insert(collection_name=collection, data=rows[offset : offset + batch])

    elapsed_ms = (time.perf_counter() - start) * 1000
    return {
        "collection": collection,
        "inserted_count": len(rows),
        "duration_ms": round(elapsed_ms, 2),
    }
