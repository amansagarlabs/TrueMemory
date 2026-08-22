from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from urllib.parse import urlparse

from source_intelligence import aggregate_source_set, build_source_intelligence


def normalize_source(
    item: dict,
    *,
    source_type: str,
    provider: str | None = None,
    citation_index: int | None = None,
) -> dict:
    url = str(item.get("url") or item.get("start_url") or "").strip()
    parsed = urlparse(url)
    title = str(item.get("title") or parsed.hostname or "Source").strip()
    snippet = str(item.get("snippet") or item.get("description") or item.get("text") or "").strip()[:600]
    image_url = str(item.get("image_url") or item.get("thumbnail") or "").strip()
    if not image_url.lower().startswith(("http://", "https://")):
        image_url = ""
    intelligence = build_source_intelligence(
        item,
        source_type=source_type,
        provider=provider,
        citation_index=citation_index,
    )
    identity_url = str(intelligence.get("canonical_url") or url)
    source_id = "src_" + hashlib.sha256(identity_url.encode("utf-8")).hexdigest()[:12]
    return {
        "id": source_id,
        "title": title,
        "url": url,
        "domain": parsed.hostname or "",
        "snippet": snippet,
        "content": snippet,
        "quote": snippet[:280] or None,
        "image_url": image_url or None,
        "image_landing_url": item.get("image_landing_url"),
        "image_attribution": item.get("image_attribution"),
        "image_license": item.get("image_license"),
        "image_provider": item.get("image_provider"),
        "source_type": source_type,
        "provider": provider or item.get("provider"),
        "provider_label": item.get("provider_label"),
        "published_at": item.get("published_at"),
        "retrieved_at": datetime.now(UTC).isoformat(),
        "citation_index": citation_index,
        **intelligence,
    }


def dedupe_sources(items: list[dict]) -> list[dict]:
    return aggregate_source_set(items)
