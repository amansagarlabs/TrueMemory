"""Step 4 — Split text into overlapping chunks with page numbers."""

from __future__ import annotations

import time


def _page_for_offset(offset: int, spans: list[tuple[int, int, int]]) -> int:
    for start, end, page in spans:
        if start <= offset < end:
            return page
    return spans[-1][2] if spans else 1


def chunk_pages(
    pages: list[dict],
    *,
    chunk_size: int,
    chunk_overlap: int,
    max_chunks: int = 0,
) -> dict:
    """Chunk multi-page PDF text; each chunk gets the page where it starts."""
    start = time.perf_counter()
    parts: list[str] = []
    spans: list[tuple[int, int, int]] = []
    cursor = 0

    for p in pages:
        text = (p.get("text") or "").strip()
        if not text:
            continue
        part_start = cursor
        parts.append(text)
        cursor += len(text) + 2
        spans.append((part_start, cursor, int(p.get("page", 1))))

    full_text = "\n\n".join(parts)
    return chunk_text(
        full_text,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        max_chunks=max_chunks,
        page_spans=spans,
    )


def chunk_text(
    text: str,
    *,
    chunk_size: int,
    chunk_overlap: int,
    max_chunks: int = 0,
    page_spans: list[tuple[int, int, int]] | None = None,
) -> dict:
    start = time.perf_counter()
    text = text.strip()
    if not text:
        return {
            "chunk_count": 0,
            "chunks": [],
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
            "duration_ms": 0,
            "truncated": False,
        }

    chunks: list[dict] = []
    start_idx = 0
    index = 0
    truncated = False

    while start_idx < len(text):
        end_idx = min(start_idx + chunk_size, len(text))
        piece = text[start_idx:end_idx].strip()
        if piece:
            page = (
                _page_for_offset(start_idx, page_spans)
                if page_spans
                else 0
            )
            chunks.append(
                {
                    "chunk_index": index,
                    "text": piece,
                    "page": page,
                    "char_count": len(piece),
                    "preview": piece[:200] + ("…" if len(piece) > 200 else ""),
                }
            )
            index += 1
        if end_idx >= len(text):
            break
        start_idx = end_idx - chunk_overlap
        if start_idx < 0:
            start_idx = 0
        if max_chunks > 0 and len(chunks) >= max_chunks:
            truncated = True
            break

    truncated = truncated if max_chunks > 0 else False
    elapsed_ms = (time.perf_counter() - start) * 1000

    return {
        "chunk_count": len(chunks),
        "chunks": chunks,
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
        "duration_ms": round(elapsed_ms, 2),
        "truncated": truncated,
    }
