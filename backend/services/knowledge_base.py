"""Curated knowledge-base storage and version metadata."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def resolve_path(settings) -> Path:
    configured = Path(settings.curated_kb_path)
    if configured.exists():
        return configured
    return Path(__file__).resolve().parents[1] / "knowledge_base" / "curated.jsonl"


def _read_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, list) else payload.get("chunks", [])
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _manifest_path(path: Path) -> Path:
    return path.with_name("manifest.json")


def status(settings) -> dict[str, Any]:
    path = resolve_path(settings)
    records = _read_records(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
    manifest = {}
    manifest_path = _manifest_path(path)
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {
        "path": str(path),
        "records": len(records),
        "sha256": digest,
        "version": manifest.get("version", 0),
        "updated_at": manifest.get("updated_at"),
        "updated_by": manifest.get("updated_by"),
    }


def list_records(settings) -> list[dict[str, Any]]:
    return _read_records(resolve_path(settings))


def upsert_records(settings, records: list[dict[str, Any]], *, updated_by: str, replace: bool = False) -> dict[str, Any]:
    path = resolve_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = [] if replace else _read_records(path)
    by_id = {str(item.get("id")): item for item in existing if item.get("id")}
    for record in records:
        item = dict(record)
        item["id"] = str(item.get("id") or hashlib.sha1(item.get("text", "").encode()).hexdigest()[:16])
        item["title"] = str(item.get("title") or "Curated source")
        item["text"] = str(item.get("text") or item.get("content") or "").strip()
        if not item["text"]:
            raise ValueError(f"Record {item['id']} has no text.")
        by_id[item["id"]] = item
    output = list(by_id.values())
    path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in output), encoding="utf-8")
    previous = status(settings)
    manifest = {
        "version": int(previous.get("version") or 0) + 1,
        "updated_at": datetime.now(UTC).isoformat(),
        "updated_by": updated_by,
        "records": len(output),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    _manifest_path(path).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return {**manifest, "path": str(path)}
