"""Structured @mention resolution, graph expansion, and context optimization."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from hashlib import sha256
from typing import Iterable

SUPPORTED_CONTEXT_KINDS = frozenset(
    {
        "memory", "workspace", "project", "agent", "file", "connector", "web",
        "skill", "mcp_server", "github_repository", "github_file",
        "github_issue", "github_pull_request", "document", "api", "database",
        # Backward-compatible composer values.
        "skills", "connectors",
    }
)
_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_.:/-]+", re.IGNORECASE)


@dataclass(frozen=True)
class ContextNode:
    id: str
    kind: str
    label: str
    content: str
    source_id: str
    score: float = 0.0
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ContextEdge:
    source: str
    target: str
    relation: str


@dataclass(frozen=True)
class ContextGraph:
    nodes: tuple[ContextNode, ...]
    edges: tuple[ContextEdge, ...]
    optimized_text: str
    original_characters: int

    def preview(self) -> dict:
        return {
            "nodes": [
                {
                    "id": node.id,
                    "kind": node.kind,
                    "label": node.label,
                    "score": round(node.score, 4),
                    "preview": node.content[:240],
                    "metadata": node.metadata,
                }
                for node in self.nodes
            ],
            "edges": [
                {"source": edge.source, "target": edge.target, "relation": edge.relation}
                for edge in self.edges
            ],
            "optimized_characters": len(self.optimized_text),
            "original_characters": self.original_characters,
        }


def normalize_kind(kind: str) -> str:
    return {
        "skills": "skill",
        "connectors": "connector",
        "artifacts": "document",
        "documents": "document",
        "files": "file",
        "agents": "agent",
        "projects": "project",
        "workspaces": "workspace",
        "databases": "database",
        "apis": "api",
    }.get(kind, kind)


def _terms(value: str) -> set[str]:
    return {token.lower() for token in _TOKEN_RE.findall(value)}


def _compress(text: str, query_terms: set[str], limit: int) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    if len(clean) <= limit:
        return clean
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    ranked = sorted(
        enumerate(sentences),
        key=lambda item: (-len(_terms(item[1]) & query_terms), item[0]),
    )
    selected: list[tuple[int, str]] = []
    used = 0
    for index, sentence in ranked:
        remaining = limit - used
        if remaining <= 1:
            break
        excerpt = sentence[:remaining]
        selected.append((index, excerpt))
        used += len(excerpt) + 1
    return " ".join(sentence for _, sentence in sorted(selected)).strip()


def build_context_graph(
    question: str,
    mentions: Iterable[dict[str, str]],
    candidates: Iterable[ContextNode],
    *,
    max_characters: int = 16_000,
) -> ContextGraph:
    """Rank, deduplicate, compress, and budget nodes associated with mentions."""
    mention_list = [
        {**mention, "kind": normalize_kind(str(mention.get("kind") or ""))}
        for mention in mentions
        if normalize_kind(str(mention.get("kind") or "")) in SUPPORTED_CONTEXT_KINDS
    ]
    selected = {
        (mention["kind"], str(mention.get("id") or ""))
        for mention in mention_list
    }
    query_terms = _terms(question)
    deduped: dict[str, ContextNode] = {}
    original_characters = 0
    for candidate in candidates:
        kind = normalize_kind(candidate.kind)
        root_kind = normalize_kind(candidate.metadata.get("root_kind", kind))
        if (root_kind, candidate.source_id) not in selected:
            continue
        content = candidate.content.strip()
        if not content:
            continue
        original_characters += len(content)
        overlap = len(query_terms & _terms(f"{candidate.label} {content}"))
        score = candidate.score + overlap / max(1, len(query_terms))
        fingerprint = sha256(re.sub(r"\s+", " ", content).lower().encode()).hexdigest()
        node = ContextNode(
            id=candidate.id,
            kind=kind,
            label=candidate.label,
            content=content,
            source_id=candidate.source_id,
            score=score,
            metadata=candidate.metadata,
        )
        if fingerprint not in deduped or score > deduped[fingerprint].score:
            deduped[fingerprint] = node

    ranked = sorted(deduped.values(), key=lambda node: (-node.score, node.kind, node.id))
    output: list[ContextNode] = []
    blocks: list[str] = []
    remaining = max_characters
    for node in ranked:
        header = f"[{node.kind}: {node.label}]\n"
        if remaining <= len(header) + 40:
            break
        body = _compress(node.content, query_terms, min(2400, remaining - len(header)))
        block = header + body
        blocks.append(block)
        output.append(ContextNode(**{**node.__dict__, "content": body}))
        remaining -= len(block) + 2

    mention_edges = tuple(
        ContextEdge(
            source=f"mention:{kind}:{resource_id}",
            target=node.id,
            relation="resolves_to",
        )
        for kind, resource_id in selected
        for node in output
        if normalize_kind(node.metadata.get("root_kind", node.kind)) == kind
        and node.source_id == resource_id
    )
    relationship_edges = tuple(
        ContextEdge(
            source=node.metadata["parent_id"],
            target=node.id,
            relation=node.metadata.get("relation", "contains"),
        )
        for node in output
        if node.metadata.get("parent_id")
    ) + tuple(
        ContextEdge(
            source=node.id,
            target=node.metadata["linked_artifact_id"],
            relation="references_artifact",
        )
        for node in output
        if node.metadata.get("linked_artifact_id")
    )
    return ContextGraph(
        nodes=tuple(output),
        edges=tuple(dict.fromkeys((*mention_edges, *relationship_edges))),
        optimized_text="\n\n".join(blocks),
        original_characters=original_characters,
    )
