"""Optional web-search provider for automatic no-document chat fallback."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

TAVILY_SEARCH_URL = "https://api.tavily.com/search"


def web_search_available(settings: Any) -> bool:
    return bool(settings.web_search_enabled and settings.tavily_api_key)


async def search_web(settings: Any, query: str) -> dict[str, Any]:
    if not web_search_available(settings):
        return {
            "enabled": False,
            "query": query,
            "results": [],
            "summary": "",
            "timestamp": datetime.now(UTC).isoformat(),
        }

    payload = {
        "api_key": settings.tavily_api_key,
        "query": query,
        "search_depth": "advanced",
        "include_answer": True,
        "include_raw_content": False,
        "max_results": settings.web_search_max_results,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(TAVILY_SEARCH_URL, json=payload)
        response.raise_for_status()
        data = response.json()

    results = []
    for item in data.get("results", []):
        url = item.get("url")
        title = item.get("title") or url or "Untitled source"
        content = item.get("content") or ""
        if not url:
            continue
        results.append(
            {
                "title": title,
                "url": url,
                "content": content,
                "score": item.get("score"),
            }
        )

    return {
        "enabled": True,
        "query": query,
        "summary": data.get("answer") or "",
        "results": results,
        "timestamp": datetime.now(UTC).isoformat(),
    }


def format_web_context(search_result: dict[str, Any]) -> str:
    results = search_result.get("results") or []
    if not results:
        return "None"

    parts = []
    summary = search_result.get("summary")
    if summary:
        parts.append(f"Search summary:\n{summary}")

    for index, item in enumerate(results, start=1):
        parts.append(
            "\n".join(
                [
                    f"[Web Source {index}]",
                    f"Title: {item['title']}",
                    f"URL: {item['url']}",
                    f"Excerpt: {item['content']}",
                ]
            )
        )
    return "\n\n".join(parts)
