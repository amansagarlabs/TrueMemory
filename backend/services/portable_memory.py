"""Canonical semantic portable memory format v1."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

FORMAT = "truememory-memory-v1"


def _timestamp(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        value = value.isoformat()
    text = str(value)
    return text.replace("+00:00", "Z")


def to_portable(item: dict) -> dict:
    """Strip storage fields and return the stable semantic representation."""
    return {
        "memory_id": str(item.get("id") or item.get("memory_id") or ""),
        "key": str(item.get("memory_key") or item.get("key") or ""),
        "content": str(item.get("content") or ""),
        "memory_type": str(item.get("memory_type") or item.get("type") or "fact"),
        "scope": str(item.get("scope") or "general"),
        "revision": int(item.get("revision") or 1),
        "state": str(item.get("lifecycle_status") or item.get("state") or "current"),
        "confidence": float(item.get("confidence_score") or item.get("confidence") or 0.0),
        "valid_from": _timestamp(item.get("valid_from")),
        "valid_until": _timestamp(item.get("valid_until")),
        "source": {"type": str(item.get("source") or "unknown")},
        "provenance": {
            key: _timestamp(value) if key.endswith("_at") else value
            for key, value in {
                "conversation_id": item.get("conversation_id"),
                "source_message_id": item.get("source_message_id"),
                "observed_at": item.get("observed_at") or item.get("created_at"),
            }.items() if value is not None
        },
        "relationships": list(item.get("relationships") or []),
    }


def validate_document(document: dict) -> list[dict]:
    if not isinstance(document, dict) or document.get("format") != FORMAT:
        raise ValueError("unsupported portable memory format")
    if document.get("export", {}).get("schema_version", "1") != "1":
        raise ValueError("unsupported portable memory schema version")
    memories = document.get("memories")
    if not isinstance(memories, list) or len(memories) > 5000:
        raise ValueError("memories must be a list of at most 5000 items")
    required = ("memory_id", "key", "content", "memory_type", "scope", "revision")
    for item in memories:
        if not isinstance(item, dict) or any(not item.get(key) for key in required):
            raise ValueError("portable memory is missing required fields")
        if not isinstance(item["revision"], int) or item["revision"] < 1:
            raise ValueError("revision must be a positive integer")
        if not isinstance(item["relationships"], list):
            raise ValueError("relationships must be a list")
    ids = {item["memory_id"] for item in memories}
    for item in memories:
        for rel in item["relationships"]:
            if isinstance(rel, dict) and rel.get("to_memory_id") and rel["to_memory_id"] not in ids:
                raise ValueError("relationship references unknown memory")
    return memories


def make_document(items: list[dict], *, source_instance: str = "truememory") -> dict:
    return {
        "format": FORMAT,
        "export": {"export_id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "source_instance": source_instance, "schema_version": "1"},
        "memories": [to_portable(item) for item in items],
    }
