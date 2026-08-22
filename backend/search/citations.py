from __future__ import annotations

from urllib.parse import urlparse


def assign_citation_indices(sources: list[dict]) -> list[dict]:
    """Return stable, one-based citation indices after URL deduplication."""
    seen: set[str] = set()
    output: list[dict] = []
    for source in sources:
        url = str(source.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        item = dict(source)
        item["citation_index"] = len(output) + 1
        item["domain"] = item.get("domain") or urlparse(url).netloc.lower()
        output.append(item)
    return output


def citation_is_grounded(index: int, sources: list[dict]) -> bool:
    return any(source.get("citation_index") == index for source in sources)
