from __future__ import annotations

import re
from dataclasses import dataclass


_VISUAL_TERMS = re.compile(
    r"\b(show|image|picture|photo|visual|look like|inspiration|inspirations|"
    r"design ideas|examples|diagram|illustration|map|product|model|eiffel tower|"
    r"rose|roses|office interior|dashboard)\b",
    re.IGNORECASE,
)
_TEXT_ONLY_TERMS = re.compile(
    r"\b(summar(?:y|ize|ise)|pdf|document|file|debug|error|exception|"
    r"code|coding|sql|query|typescript|javascript|docker|api|documentation|"
    r"recursion|math|calculate|calculation|resume|jwt|authentication|security)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ImageIntent:
    needs_images: bool
    confidence: float
    reason: str


def classify_image_intent(question: str) -> ImageIntent:
    normalized = " ".join(question.split())
    if not normalized:
        return ImageIntent(False, 1.0, "There is no visual request.")
    if _TEXT_ONLY_TERMS.search(normalized) and not _VISUAL_TERMS.search(normalized):
        return ImageIntent(False, 0.98, "The request is text-only.")
    if _VISUAL_TERMS.search(normalized):
        return ImageIntent(True, 0.9, "The user asked for visual information or references.")
    return ImageIntent(False, 0.85, "Images are not clearly useful for this request.")


def should_include_source_images(question: str, *, threshold: float = 0.75) -> bool:
    decision = classify_image_intent(question)
    return decision.needs_images and decision.confidence >= threshold
