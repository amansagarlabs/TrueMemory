"""
Orchestrates pipeline steps 3–7 and yields SSE events for the visualization UI.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncGenerator
from pathlib import Path

from app.config import Settings
from embeddings.embedder import embed_texts
from services.chunking import chunk_pages
from services.document_store import find_artifact_for_doc
from services.artifact_extract import extract_artifact_pages, extract_artifact_text
from services.tokenizer_viz import analyze_tokens
from vector_db.milvus_store import insert_chunks


async def run_pipeline_visualization(
    doc_id: str, settings: Settings
) -> AsyncGenerator[str, None]:
    pipeline_start = time.perf_counter()
    metrics: dict[str, float] = {}

    try:
        artifact_path, filename = find_artifact_for_doc(doc_id, settings.uploads_dir)
    except FileNotFoundError as exc:
        yield _event("error", {"message": str(exc)})
        return

    yield _event("step", {"id": "upload", "status": "done", "label": "Artifact Uploaded"})

    # --- Extract ---
    yield _event("step", {"id": "extract", "status": "running", "label": "Text Extracted"})
    extract_data = extract_artifact_text(artifact_path)
    metrics["extraction_ms"] = extract_data["duration_ms"]
    yield _event(
        "step",
        {
            "id": "extract",
            "status": "done",
            "label": "Text Extracted",
            "duration_ms": extract_data["duration_ms"],
            "data": extract_data,
        },
    )

    page_list = extract_artifact_pages(artifact_path)

    # --- Chunk ---
    yield _event("step", {"id": "chunk", "status": "running", "label": "Chunking Complete"})
    max_chunks = settings.pipeline_max_chunks
    chunk_data = chunk_pages(
        page_list,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        max_chunks=max_chunks,
    )
    chunks = chunk_data["chunks"]
    if not chunks:
        yield _event("error", {"message": "No indexable text was found in this artifact."})
        return
    metrics["chunking_ms"] = chunk_data["duration_ms"]
    yield _event(
        "step",
        {
            "id": "chunk",
            "status": "done",
            "label": "Chunking Complete",
            "duration_ms": chunk_data["duration_ms"],
            "data": {
                **chunk_data,
                "chunks": chunks[:8],
            },
        },
    )

    # --- Tokenize ---
    yield _event(
        "step", {"id": "tokenize", "status": "running", "label": "Tokenization Complete"}
    )
    token_data = analyze_tokens(chunks)
    metrics["tokenization_ms"] = token_data["duration_ms"]
    yield _event(
        "step",
        {
            "id": "tokenize",
            "status": "done",
            "label": "Tokenization Complete",
            "duration_ms": token_data["duration_ms"],
            "data": token_data,
        },
    )

    # --- Embed ---
    yield _event(
        "step", {"id": "embed", "status": "running", "label": "Embeddings Generated"}
    )
    texts = [c["text"] for c in chunks]
    embed_data = embed_texts(texts, model_name=settings.embedding_model)
    vectors = embed_data.pop("vectors")
    metrics["embedding_ms"] = embed_data["duration_ms"]
    yield _event(
        "step",
        {
            "id": "embed",
            "status": "done",
            "label": "Embeddings Generated",
            "duration_ms": embed_data["duration_ms"],
            "data": embed_data,
        },
    )

    # --- Milvus ---
    yield _event("step", {"id": "milvus", "status": "running", "label": "Stored in Milvus"})
    try:
        milvus_data = insert_chunks(
            settings,
            doc_id=doc_id,
            filename=filename,
            chunks=chunks,
            vectors=vectors,
        )
    except Exception as exc:
        yield _event(
            "step",
            {
                "id": "milvus",
                "status": "error",
                "label": "Stored in Milvus",
                "data": {"message": str(exc)},
            },
        )
        return

    metrics["milvus_ms"] = milvus_data["duration_ms"]
    yield _event(
        "step",
        {
            "id": "milvus",
            "status": "done",
            "label": "Stored in Milvus",
            "duration_ms": milvus_data["duration_ms"],
            "data": milvus_data,
        },
    )

    total_ms = round((time.perf_counter() - pipeline_start) * 1000, 2)
    metrics["total_ms"] = total_ms

    yield _event(
        "step",
        {
            "id": "ready",
            "status": "done",
            "label": "Retrieval Ready",
            "data": {"message": "Pipeline complete — you can query this document in chat (Step 8+)."},
        },
    )
    yield _event("complete", {"metrics": metrics, "doc_id": doc_id})


def _event(event_type: str, payload: dict) -> str:
    body = {"type": event_type, **payload}
    return f"data: {json.dumps(body)}\n\n"
