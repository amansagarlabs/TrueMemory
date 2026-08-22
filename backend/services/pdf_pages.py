"""Page-level PDF text for chunk → page mapping."""

from __future__ import annotations

from pathlib import Path

import fitz

from services.text_normalize import normalize_pdf_text


def extract_pages(pdf_path: Path) -> list[dict]:
    pages: list[dict] = []
    with fitz.open(pdf_path) as doc:
        for i, page in enumerate(doc):
            text = normalize_pdf_text(page.get_text())
            pages.append(
                {
                    "page": i + 1,
                    "text": text,
                    "char_count": len(text),
                    "preview": text[:280] + ("…" if len(text) > 280 else ""),
                }
            )
    return pages


def pages_to_full_text(pages: list[dict]) -> str:
    return "\n\n".join(p["text"] for p in pages if p.get("text"))
