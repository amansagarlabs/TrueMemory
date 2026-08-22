"""Project-scoped context graph retrieval."""

from __future__ import annotations

import asyncio
from typing import Any, Iterable

from rag.retriever import retrieve_chunks
from services.context_engine import ContextNode, normalize_kind
from services.postgres_store import list_project_context_records


def ensure_project_mention(
    mentions: Iterable[dict[str, str]],
    *,
    project_id: str,
    project_label: str,
) -> list[dict[str, str]]:
    """Add active-project context without duplicating an explicit mention."""
    result = [dict(mention) for mention in mentions]
    if any(
        normalize_kind(str(mention.get("kind") or "")) == "project"
        and str(mention.get("id") or "") == project_id
        for mention in result
    ):
        return result
    return [
        *result,
        {
            "kind": "project",
            "id": project_id,
            "label": project_label or "Active project",
        },
    ]


def project_records_to_nodes(
    records: Iterable[dict[str, Any]],
    *,
    project_id: str,
) -> list[ContextNode]:
    return [
        ContextNode(
            id=str(record["id"]),
            kind=str(record["kind"]),
            label=str(record["label"]),
            content=str(record["content"]),
            source_id=project_id,
            score=float(record.get("score") or 0.0),
            metadata={
                "root_kind": "project",
                **{
                    str(key): str(value)
                    for key, value in dict(record.get("metadata") or {}).items()
                },
            },
        )
        for record in records
    ]


async def retrieve_project_context_nodes(
    settings,
    *,
    project_id: str,
    user_id: str,
    question: str,
    limit: int = 16,
    max_artifacts: int = 4,
    chunks_per_artifact: int = 3,
) -> list[ContextNode]:
    """Resolve project metadata and relevant indexed artifact chunks."""
    records = await asyncio.to_thread(
        list_project_context_records,
        settings,
        project_id=project_id,
        user_id=user_id,
        limit=limit,
    )
    nodes = project_records_to_nodes(records, project_id=project_id)
    query = question.strip()
    if not query or max_artifacts <= 0 or chunks_per_artifact <= 0:
        return nodes

    artifacts = [
        record
        for record in records
        if str((record.get("metadata") or {}).get("resource_type") or "") == "artifact"
    ][:max_artifacts]

    async def retrieve_artifact(record: dict[str, Any]) -> list[ContextNode]:
        artifact_node_id = str(record["id"])
        artifact_id = artifact_node_id.removeprefix("artifact:")
        try:
            result = await asyncio.to_thread(
                retrieve_chunks,
                settings,
                doc_id=artifact_id,
                question=query,
            )
        except Exception:
            # An artifact can exist before its indexing pipeline completes.
            # Keep the rest of the project graph usable in that state.
            return []

        chunk_nodes: list[ContextNode] = []
        for position, chunk in enumerate(result.get("chunks") or []):
            if position >= chunks_per_artifact:
                break
            text = str(chunk.get("text") or "").strip()
            if not text:
                continue
            chunk_index = chunk.get("chunk_index")
            page = chunk.get("page")
            similarity = chunk.get("similarity")
            label = str(record.get("label") or "Project artifact")
            if page is not None:
                label = f"{label} · page {page}"
            chunk_nodes.append(
                ContextNode(
                    id=f"artifact-chunk:{artifact_id}:{chunk_index if chunk_index is not None else position}",
                    kind="document",
                    label=label,
                    content=text,
                    source_id=project_id,
                    score=float(similarity) if similarity is not None else 0.65,
                    metadata={
                        "root_kind": "project",
                        "resource_type": "artifact_chunk",
                        "artifact_id": artifact_id,
                        "parent_id": artifact_node_id,
                        "relation": "contains_chunk",
                        "page": str(page or ""),
                        "chunk_index": str(chunk_index if chunk_index is not None else position),
                    },
                )
            )
        return chunk_nodes

    retrieved = await asyncio.gather(
        *(retrieve_artifact(record) for record in artifacts)
    )
    return [*nodes, *(node for group in retrieved for node in group)]
