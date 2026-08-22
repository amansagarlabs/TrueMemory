"""
Step 8 — Semantic retrieval from Zilliz / Milvus.

LEARNING: RAG retrieval = embed the question → nearest-neighbor search in vector DB.
"""

from __future__ import annotations

import time

from app.config import Settings
from embeddings.embedder import embed_query
from vector_db.milvus_client import get_milvus_client


def retrieve_chunks(
    settings: Settings,
    *,
    doc_id: str,
    question: str,
) -> dict:
    start = time.perf_counter()

    query_vector = embed_query(question, model_name=settings.embedding_model)
    client = get_milvus_client(settings)
    collection = settings.milvus_collection

    results = client.search(
        collection_name=collection,
        data=[query_vector],
        filter=f'doc_id == "{doc_id}"',
        limit=settings.top_k_chunks,
        output_fields=["text", "doc_id", "filename", "page", "chunk_index"],
    )

    hits = results[0] if results else []
    chunks: list[dict] = []

    for hit in hits:
        entity = hit.get("entity", {})
        distance = hit.get("distance")
        # COSINE distance in Milvus: lower = more similar (for normalized vectors)
        similarity = round(1 - float(distance), 4) if distance is not None else None
        text = entity.get("text", "")
        chunks.append(
            {
                "doc_id": entity.get("doc_id") or doc_id,
                "filename": entity.get("filename"),
                "chunk_index": entity.get("chunk_index"),
                "page": entity.get("page"),
                "text": text,
                "preview": text[:240] + ("…" if len(text) > 240 else ""),
                "similarity": similarity,
                "distance": round(float(distance), 4) if distance is not None else None,
            }
        )

    elapsed_ms = (time.perf_counter() - start) * 1000

    if not chunks:
        raise ValueError(
            "No chunks found for this document. Run “Visualize full pipeline” first."
        )

    chunks.sort(
        key=lambda c: (c["similarity"] is not None, c.get("similarity") or 0),
        reverse=True,
    )

    return {
        "doc_id": doc_id,
        "question": question,
        "top_k": settings.top_k_chunks,
        "chunks": chunks,
        "retrieval_ms": round(elapsed_ms, 2),
    }
