from __future__ import annotations

from collections import defaultdict
import re
from urllib.parse import urlparse

from .normalization import canonicalize_url


def _owner_key(source: dict) -> str:
    domain = str(source.get("domain") or urlparse(source.get("canonical_url", "")).hostname or "").lower()
    parts = [part for part in domain.split(".") if part]
    return ".".join(parts[-2:]) if len(parts) >= 2 else domain


def aggregate_source_set(items: list[dict]) -> list[dict]:
    """Merge canonical duplicates and attach conservative source-set metadata."""
    merged: dict[str, dict] = {}
    duplicate_ids: dict[str, list[str]] = defaultdict(list)
    for item in items:
        canonical = canonicalize_url(str(item.get("canonical_url") or item.get("url") or ""))
        key = canonical or str(item.get("id") or "")
        if not key:
            continue
        if key in merged:
            duplicate_ids[key].append(str(item.get("id") or ""))
            existing = merged[key]
            if len(str(item.get("snippet") or "")) > len(str(existing.get("snippet") or "")):
                existing["snippet"] = item.get("snippet")
                existing["quote"] = item.get("quote")
            continue
        value = dict(item)
        value["canonical_url"] = canonical
        merged[key] = value

    output = list(merged.values())
    owners = {_owner_key(item) for item in output if _owner_key(item)}
    for index, item in enumerate(output, start=1):
        item["citation_index"] = index
        cross = dict(item.get("cross_verification") or {})
        cross.update({
            "status": "available" if len(owners) > 1 else "not_evaluated",
            "independent_sources": max(0, len(owners) - 1),
            "duplicate_source_ids": duplicate_ids.get(item.get("canonical_url", ""), []),
        })
        item["cross_verification"] = cross
    return output


def finalize_source_usage(answer: str, items: list[dict]) -> list[dict]:
    """Mark public evidence roles from emitted citation markers.

    Influence is citation-share coverage, not hidden model attribution.
    """
    citation_by_url: dict[str, int] = {}
    for item in items:
        citation_index = item.get("citation_index")
        if not isinstance(citation_index, int):
            continue
        for value in (item.get("canonical_url"), item.get("url")):
            canonical = canonicalize_url(str(value or ""))
            if canonical:
                citation_by_url[canonical] = citation_index

    markers: list[int] = []
    markdown_spans: list[tuple[int, int]] = []
    markdown_link_pattern = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", re.IGNORECASE)
    for match in markdown_link_pattern.finditer(answer):
        label, url = match.groups()
        citation_index = citation_by_url.get(canonicalize_url(url))
        if citation_index is None:
            label_index = re.search(r"(?:^|\s)(\d+)\s*$", label)
            citation_index = int(label_index.group(1)) if label_index else None
        if citation_index is not None:
            markers.append(citation_index)
        markdown_spans.append(match.span())

    # Mask Markdown links before scanning bracket markers so `[Publisher 2](url)`
    # is counted once rather than once by its URL and again by its label.
    marker_text = list(answer)
    for start, end in markdown_spans:
        marker_text[start:end] = " " * (end - start)

    line_reference_pattern = re.compile(
        r"[\[【]\s*Source\s+(\d+)(?:†L\d+(?:-L?\d+)?)?\s*(?:[\]】]|(?=\s|[.,;:!?]|$))",
        re.IGNORECASE,
    )
    for match in line_reference_pattern.finditer("".join(marker_text)):
        markers.append(int(match.group(1)))
        start, end = match.span()
        marker_text[start:end] = " " * (end - start)

    markers.extend(
        int(match.group(1))
        for match in re.finditer(r"\[[^\]]*?(\d+)\]", "".join(marker_text))
    )

    total = max(1, len(markers))
    counts = {index: markers.count(index) for index in set(markers)}
    used_order = list(dict.fromkeys(markers))
    first = used_order[0] if used_order else None
    output: list[dict] = []
    for item in items:
        source = dict(item)
        citation_index = source.get("citation_index")
        count = counts.get(citation_index, 0)
        if count:
            role = "primary" if citation_index == first else "supporting"
            source["evidence_role"] = role
            source["influence_score"] = round(count / total, 3)
            source["reason_used"] = (
                f"Cited {count} time{'s' if count != 1 else ''} as "
                f"{role} evidence in the final answer."
            )
        else:
            source["evidence_role"] = "background"
            source["influence_score"] = 0.0
            source["reason_used"] = "Retrieved for context but not cited in the final answer."
        output.append(source)
    return output
