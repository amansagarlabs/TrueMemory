"""Small, conservative repairs for model output shown in chat."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from source_intelligence import canonicalize_url

_TITLE_LINK = re.compile(r"^\[\*\*(.+?)\*\*\]\((https?://[^)]+)\)\s*$")
_LINK = re.compile(r"^\[([^\]]+)\]\((https?://[^)]+)\)\s*$")
_PLAIN_DOMAIN = re.compile(
    r"^(?:https?://)?(?:www\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?:/[^\s]*)?$",
    re.IGNORECASE,
)
_INTERNAL_METADATA = re.compile(
    r"^\s*(?:user\s+)?(?:safety|moderation|content\s+safety)\s*:\s*"
    r"(?:safe|allowed|passed|clear|ok)\s*[.!]?\s*$",
    re.IGNORECASE,
)
_HIDDEN_REASONING_START = re.compile(
    r"^\s*(?:here['’]s\s+(?:a\s+)?thinking\s+process|"
    r"thinking\s+process|chain[- ]of[- ]thought|private\s+reasoning)\s*:?")
_FINAL_ANSWER_MARKER = re.compile(r"^\s*(?:final\s+answer|answer)\s*:\s*", re.IGNORECASE)
_HIDDEN_REASONING_ASCII_START = re.compile(
    r"^\s*here's\s+(?:a\s+)?thinking\s+process\s*:?")


def _next_content_line(lines: list[str], index: int) -> tuple[int, str] | None:
    while index < len(lines) and not lines[index].strip():
        index += 1
    if index >= len(lines):
        return None
    return index, lines[index].strip()


def strip_leading_search_result_dump(answer: str) -> str:
    """Remove repeated title/title/domain search cards echoed before an answer.

    A single opening link is left untouched. At least two complete repeated
    search-result blocks must be present before content is removed.
    """
    lines = answer.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cursor = 0
    block_count = 0

    while True:
        title_line = _next_content_line(lines, cursor)
        if title_line is None:
            break
        title_index, title_text = title_line
        title_match = _TITLE_LINK.match(title_text)
        if not title_match:
            break

        repeated_title = _next_content_line(lines, title_index + 1)
        if repeated_title is None:
            break
        repeated_index, repeated_text = repeated_title
        if repeated_text.strip("* ").strip() != title_match.group(1).strip():
            break

        domain_line = _next_content_line(lines, repeated_index + 1)
        if domain_line is None:
            break
        domain_index, domain_text = domain_line
        domain_match = _LINK.match(domain_text)
        if not domain_match:
            break

        try:
            linked_host = (urlparse(domain_match.group(2)).hostname or "").removeprefix("www.")
        except ValueError:
            break
        visible_domain = domain_match.group(1).lower().removeprefix("www.")
        if not linked_host or linked_host.lower() not in visible_domain:
            break

        block_count += 1
        cursor = domain_index + 1

    if block_count < 2:
        # Some providers echo plain-text result cards instead of Markdown:
        # title, repeated title, domain. Only remove them when at least two
        # complete cards are present, so normal prose is never discarded.
        plain_cursor = 0
        plain_count = 0
        while True:
            title_line = _next_content_line(lines, plain_cursor)
            if title_line is None:
                break
            title_index, title_text = title_line
            repeated_title = _next_content_line(lines, title_index + 1)
            if repeated_title is None:
                break
            repeated_index, repeated_text = repeated_title
            if repeated_text.casefold() != title_text.casefold():
                break
            domain_line = _next_content_line(lines, repeated_index + 1)
            if domain_line is None or not _PLAIN_DOMAIN.match(domain_line[1]):
                break
            plain_count += 1
            plain_cursor = domain_line[0] + 1
        if plain_count < 2:
            return answer
        cursor = plain_cursor

    remaining = "\n".join(lines[cursor:]).lstrip()
    return remaining or answer


def sanitize_assistant_answer(answer: str) -> str:
    """Remove provider metadata that must never be shown as answer content."""
    cleaned = strip_leading_search_result_dump(answer)
    reasoning_probe = cleaned.casefold()
    if _HIDDEN_REASONING_START.search(reasoning_probe) or _HIDDEN_REASONING_ASCII_START.search(reasoning_probe):
        lines = cleaned.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        final_index = next(
            (index for index, line in enumerate(lines) if _FINAL_ANSWER_MARKER.match(line)),
            None,
        )
        if final_index is not None:
            cleaned = "\n".join(lines[final_index:])
            cleaned = _FINAL_ANSWER_MARKER.sub("", cleaned, count=1).strip()
        else:
            cleaned = "I can provide the result directly, but I can’t provide private reasoning."
    lines = cleaned.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(line for line in lines if not _INTERNAL_METADATA.match(line)).strip()


def link_bare_source_urls(answer: str, sources: list[dict]) -> str:
    """Convert known bare evidence URLs into stable Markdown citations."""
    known: dict[str, tuple[str, str]] = {}
    for source in sources:
        url = str(source.get("url") or "").strip()
        if not url.lower().startswith(("http://", "https://")):
            continue
        key = canonicalize_url(url)
        if not key:
            continue
        parsed = urlparse(url)
        label = str(source.get("domain") or parsed.hostname or source.get("title") or "Source")
        known[key] = (label.removeprefix("www."), url)

    if not known:
        return answer

    def replace(match: re.Match[str]) -> str:
        raw_url = match.group(0)
        before = answer[: match.start()]
        if before.endswith("]("):
            return raw_url
        punctuation = re.search(r"[.,;:!?]+$", raw_url)
        suffix = punctuation.group(0) if punctuation else ""
        url = raw_url[: -len(suffix)] if suffix else raw_url
        citation = known.get(canonicalize_url(url))
        if not citation:
            return raw_url
        label, canonical_url = citation
        return f"[{label}]({canonical_url}){suffix}"

    return re.sub(r"https?://[^\s<>)]+", replace, answer, flags=re.IGNORECASE)
