"""Deterministic capability ranking for the unified KONTEXT request pipeline."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .models import QueryMode, RouteDecision


@dataclass(frozen=True)
class Capability:
    id: str
    label: str
    reason: str
    confidence: float
    dependencies: tuple[str, ...] = ()
    estimated_latency_ms: int = 0
    estimated_tokens: int = 0

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "reason": self.reason,
            "confidence": self.confidence,
            "dependencies": list(self.dependencies),
            "estimated_latency_ms": self.estimated_latency_ms,
            "estimated_tokens": self.estimated_tokens,
        }


_PDF_RE = re.compile(r"\b(pdf|document|contract|resume|spreadsheet|ocr|extract)\b", re.I)
_CODE_RE = re.compile(r"\b(code|repo|repository|react|typescript|javascript|debug|refactor|test|api)\b", re.I)
_MEMORY_RE = re.compile(r"\b(remember|memory|earlier|previous|my preferences?|workspace)\b", re.I)
_CONNECTOR_RE = re.compile(r"\b(slack|notion|drive|github|jira|linear|figma|gmail|calendar)\b", re.I)


def rank_capabilities(
    question: str,
    decision: RouteDecision,
    *,
    has_document: bool = False,
    has_memory: bool = False,
    context_mentions: list[dict] | None = None,
) -> list[dict]:
    """Return the minimum useful capability set, ranked by confidence.

    This layer is intentionally explainable and side-effect free. Execution
    remains owned by the existing route/tool pipeline.
    """
    text = question.strip()
    capabilities: list[Capability] = [
        Capability("chat", "General assistant", "Every request needs a response composer.", .99, estimated_tokens=900),
    ]
    if decision.mode in {QueryMode.SEARCH, QueryMode.AGENT, QueryMode.SCRAPE, QueryMode.CRAWL, QueryMode.MAP}:
        capabilities.extend([
            Capability("web-search", "Web search", "Current or externally verifiable evidence is required.", .98, ("chat",), 1800, 1200),
            Capability("source-ranking", "Source ranking", "Retrieved evidence should be prioritized before synthesis.", .88, ("web-search",), 350, 250),
        ])
    if decision.needs_citations:
        capabilities.append(Capability("citations", "Citation builder", "The answer should link claims to inspectable evidence.", .9, ("source-ranking",), 250, 300))
    if has_document or _PDF_RE.search(text):
        capabilities.extend([
            Capability("document-analysis", "Document analysis", "The request references document content or extraction.", .94, ("chat",), 900, 900),
            Capability("artifacts", "Artifact manager", "Uploaded or workspace files provide the primary context.", .86, ("document-analysis",), 250, 200),
        ])
    if has_memory or _MEMORY_RE.search(text):
        capabilities.append(Capability("memory", "Memory retrieval", "Conversation or workspace context may affect the answer.", .9, ("chat",), 300, 250))
    if _CODE_RE.search(text):
        capabilities.append(Capability("repository-analysis", "Repository analysis", "The request contains software or codebase signals.", .83, ("workspace",), 1200, 900))
    if _CONNECTOR_RE.search(text) or any(str(item.get("kind")) in {"connector", "connectors"} for item in context_mentions or []):
        capabilities.append(Capability("connectors", "Connected sources", "A connected system is explicitly relevant to the request.", .87, ("workspace",), 700, 500))
    if has_document or has_memory or context_mentions:
        capabilities.append(Capability("workspace", "Workspace context", "Local project and conversation context can ground the response.", .82, ("chat",), 250, 200))

    unique = {item.id: item for item in capabilities}
    return [item.as_dict() for item in sorted(unique.values(), key=lambda item: (-item.confidence, item.id))]
