"""Clean PDF extraction artifacts before chunking / display."""

from __future__ import annotations

import re


def normalize_pdf_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[\u2000-\u200f\u2028\u2029\ufeff]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
