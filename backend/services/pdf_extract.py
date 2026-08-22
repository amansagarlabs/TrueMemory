"""Step 3 — Extract text from PDF pages using PyMuPDF."""

from __future__ import annotations

import time
from pathlib import Path

from services.pdf_pages import extract_pages


def extract_pdf_text(pdf_path: Path) -> dict:
    start = time.perf_counter()
    pages = extract_pages(pdf_path)
    total_chars = sum(p["char_count"] for p in pages)

    elapsed_ms = (time.perf_counter() - start) * 1000
    return {
        "page_count": len(pages),
        "total_chars": total_chars,
        "pages": pages,
        "duration_ms": round(elapsed_ms, 2),
    }
