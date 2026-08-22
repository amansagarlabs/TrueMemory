"""Authorized file and document @mention retrieval."""

from __future__ import annotations

import asyncio
from typing import Iterable

from rag.retriever import retrieve_chunks
from services.context_engine import ContextNode, normalize_kind
from services.postgres_store import get_artifact_for_user


async def resolve_mentioned_image_attachments(
    settings,
    *,
    user_id: str,
    mentions: Iterable[dict[str, str]],
    limit: int = 4,
) -> list[dict[str, str]]:
    """Turn authorized image file mentions into first-class model inputs."""
    if limit <= 0:
        return []
    artifact_ids = list(dict.fromkeys(
        str(mention.get("id") or "")
        for mention in mentions
        if normalize_kind(str(mention.get("kind") or "")) in {"file", "document"}
        and mention.get("id")
    ))

    async def load(artifact_id: str):
        return await asyncio.to_thread(
            get_artifact_for_user,
            settings,
            artifact_id=artifact_id,
            user_id=user_id,
        )

    artifacts = await asyncio.gather(*(load(artifact_id) for artifact_id in artifact_ids))
    return [
        {
            "artifact_id": str(artifact["id"]),
            "filename": str(artifact.get("filename") or "image"),
            "mime_type": str(artifact.get("mime_type") or "image/png"),
        }
        for artifact in artifacts
        if artifact and str(artifact.get("mime_type") or "").startswith("image/")
    ][:limit]


async def retrieve_mentioned_artifact_nodes(
    settings,
    *,
    user_id: str,
    question: str,
    mentions: Iterable[dict[str, str]],
    chunks_per_artifact: int = 4,
) -> list[ContextNode]:
    """Resolve authorized artifact mentions and their relevant indexed chunks."""
    selected_by_key: dict[tuple[str, str], dict[str, str]] = {}
    for mention in mentions:
        kind = normalize_kind(str(mention.get("kind") or ""))
        artifact_id = str(mention.get("id") or "")
        if kind in {"file", "document"} and artifact_id:
            selected_by_key.setdefault((kind, artifact_id), dict(mention))
    selected = list(selected_by_key.values())

    async def retrieve_one(mention: dict[str, str]) -> list[ContextNode]:
        artifact_id = str(mention.get("id") or "")
        kind = normalize_kind(str(mention.get("kind") or "document"))
        artifact = await asyncio.to_thread(
            get_artifact_for_user,
            settings,
            artifact_id=artifact_id,
            user_id=user_id,
        )
        if not artifact:
            return []

        label = str(
            mention.get("label")
            or artifact.get("title")
            or artifact.get("filename")
            or "Workspace file"
        )
        filename = str(artifact.get("filename") or label)
        mime_type = str(artifact.get("mime_type") or "application/octet-stream")
        page_count = artifact.get("page_count")
        details = [filename, mime_type]
        if page_count:
            details.append(f"{page_count} pages")
        root_id = f"artifact:{artifact_id}"
        nodes = [
            ContextNode(
                id=root_id,
                kind=kind,
                label=label,
                content=" · ".join(details),
                source_id=artifact_id,
                score=0.8,
                metadata={
                    "root_kind": kind,
                    "resource_type": "artifact",
                    "artifact_id": artifact_id,
                    "mime_type": mime_type,
                },
            )
        ]
        query = question.strip()
        if not query or chunks_per_artifact <= 0:
            return nodes

        try:
            result = await asyncio.to_thread(
                retrieve_chunks,
                settings,
                doc_id=artifact_id,
                question=query,
            )
        except Exception:
            # Uploads are visible before indexing finishes. Metadata remains
            # valid context while the chunk pipeline catches up.
            return nodes

        for position, chunk in enumerate(result.get("chunks") or []):
            if position >= chunks_per_artifact:
                break
            text = str(chunk.get("text") or "").strip()
            if not text:
                continue
            chunk_index = chunk.get("chunk_index")
            page = chunk.get("page")
            similarity = chunk.get("similarity")
            chunk_label = f"{label} · page {page}" if page is not None else label
            nodes.append(
                ContextNode(
                    id=f"artifact-chunk:{artifact_id}:{chunk_index if chunk_index is not None else position}",
                    kind=kind,
                    label=chunk_label,
                    content=text,
                    source_id=artifact_id,
                    score=float(similarity) if similarity is not None else 0.65,
                    metadata={
                        "root_kind": kind,
                        "resource_type": "artifact_chunk",
                        "artifact_id": artifact_id,
                        "parent_id": root_id,
                        "relation": "contains_chunk",
                        "page": str(page or ""),
                        "chunk_index": str(
                            chunk_index if chunk_index is not None else position
                        ),
                    },
                )
            )
        return nodes

    resolved = await asyncio.gather(*(retrieve_one(mention) for mention in selected))
    return [node for group in resolved for node in group]
