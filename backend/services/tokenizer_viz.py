"""Step 5 — Tokenization visualization (tiktoken, GPT-style BPE)."""

from __future__ import annotations

import time

import tiktoken


def analyze_tokens(chunks: list[dict], *, model_encoding: str = "cl100k_base") -> dict:
    start = time.perf_counter()
    enc = tiktoken.get_encoding(model_encoding)

    per_chunk: list[dict] = []
    total_tokens = 0

    for ch in chunks[:20]:
        text = ch["text"]
        token_ids = enc.encode(text)
        total_tokens += len(token_ids)
        token_pieces = [enc.decode([tid]) for tid in token_ids[:40]]
        per_chunk.append(
            {
                "chunk_index": ch["chunk_index"],
                "token_count": len(token_ids),
                "preview_tokens": token_pieces,
            }
        )

    for ch in chunks[20:]:
        total_tokens += len(enc.encode(ch["text"]))

    sample_text = chunks[0]["text"][:120] if chunks else "I love artificial intelligence"
    sample_ids = enc.encode(sample_text)
    sample_tokens = [enc.decode([tid]) for tid in sample_ids]

    avg = total_tokens / len(chunks) if chunks else 0
    estimated_cost_usd = round((total_tokens / 1_000_000) * 0.15, 6)

    elapsed_ms = (time.perf_counter() - start) * 1000

    return {
        "encoding": model_encoding,
        "total_tokens": total_tokens,
        "avg_tokens_per_chunk": round(avg, 1),
        "sample_input": sample_text,
        "sample_tokens": sample_tokens,
        "chunks_analyzed": per_chunk,
        "estimated_cost_usd": estimated_cost_usd,
        "duration_ms": round(elapsed_ms, 2),
    }
