"""
Multi-provider search router — never depend on a single search source.

Chain: Tavily → Brave → SearXNG → DDG HTML → Google via Jina

Each provider returns {"results": [...], "provider": str, "latency_ms": int}
or raises an exception. The router tries each in order and returns the first
successful result.
"""

import os
import time
import httpx
import logging
import re as _re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class SearchResult:
    query: str
    results: list[dict]
    provider: str
    latency_ms: int
    attempted: list[dict] = field(default_factory=list)


async def search_multi(
    query: str,
    num_results: int = 5,
    timeout: float = 10.0,
) -> SearchResult:
    """
    Try multiple search providers in order. Return first successful result.
    """
    # Keep the default path self-hostable and credential-free. Paid/hosted
    # providers remain available only when explicitly opted in.
    providers = [
        ("searxng", _search_searxng),
        ("duckduckgo", _search_ddg),
    ]
    if _env_bool("SEARCH_ALLOW_REMOTE_FALLBACK", False):
        providers.append(("google_jina", _search_google_via_jina))
    if not _env_bool("SEARCH_FREE_ONLY", True):
        providers = [
            ("tavily", _search_tavily),
            ("brave", _search_brave),
            *providers,
        ]

    attempted = []
    last_error = None

    for name, fn in providers:
        start = time.monotonic()
        try:
            results = await fn(query, num_results, timeout)
            latency = int((time.monotonic() - start) * 1000)
            if results:
                logger.info(f"Search '{query}' via {name}: {len(results)} results ({latency}ms)")
                return SearchResult(
                    query=query,
                    results=results,
                    provider=name,
                    latency_ms=latency,
                    attempted=attempted,
                )
        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            attempted.append({"provider": name, "error": str(e), "latency_ms": latency})
            last_error = e
            logger.warning(f"Search provider {name} failed: {e}")

    # All providers failed
    return SearchResult(
        query=query,
        results=[],
        provider="none",
        latency_ms=0,
        attempted=attempted,
    )


# ── Provider: Tavily ─────────────────────────────────────────────────────

async def _search_tavily(query: str, num: int, timeout: float) -> list[dict]:
    """Tavily Search API — best for AI-focused queries."""
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        raise Exception("No TAVILY_API_KEY")

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": num,
                "include_answer": False,
                "include_images": True,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    images = data.get("images", [])
    results = []
    for index, item in enumerate(data.get("results", [])[:num]):
        image = images[index] if index < len(images) else None
        image_url = image.get("url") if isinstance(image, dict) else image
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("content", "")[:200],
            "image_url": image_url or "",
        })
    return results


# ── Provider: Brave Search ────────────────────────────────────────────────

async def _search_brave(query: str, num: int, timeout: float) -> list[dict]:
    """Brave Search API."""
    api_key = os.getenv("BRAVE_API_KEY", "")
    if not api_key:
        raise Exception("No BRAVE_API_KEY")

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": num},
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": api_key,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("web", {}).get("results", [])[:num]:
        thumbnail = item.get("thumbnail") or {}
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("description", "")[:200],
            "image_url": thumbnail.get("src", "") if isinstance(thumbnail, dict) else "",
        })
    return results


# ── Provider: SearXNG ────────────────────────────────────────────────────

async def _search_searxng(query: str, num: int, timeout: float) -> list[dict]:
    """SearXNG meta-search — self-hosted or public instance."""
    base_url = os.getenv("SEARXNG_URL", "http://searxng:8080").rstrip("/")
    if not base_url:
        raise Exception("No SEARXNG_URL")

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(
            f"{base_url}/search",
            params={"q": query, "format": "json", "categories": "general"},
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("results", [])[:num]:
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("content", "")[:200],
            "image_url": item.get("thumbnail") or item.get("img_src") or "",
        })
    return results


# ── Provider: DuckDuckGo HTML ────────────────────────────────────────────

async def _search_ddg(query: str, num: int, timeout: float) -> list[dict]:
    """DuckDuckGo HTML search — often blocked, but worth trying."""
    import random
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ]
    headers = {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = await client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query, "kl": "us-en"},
        )
        if resp.status_code != 200:
            raise Exception(f"DDG returned {resp.status_code}")

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(resp.text, "html.parser")
    results = []
    for div in soup.find_all("div", class_="result"):
        a = div.find("a", class_="result__a")
        snippet = div.find("a", class_="result__snippet")
        if a:
            results.append({
                "title": a.get_text(strip=True),
                "url": a.get("href", ""),
                "snippet": snippet.get_text(strip=True) if snippet else "",
            })
        if len(results) >= num:
            break

    if not results:
        raise Exception("DDG returned 0 results (likely CAPTCHA)")

    return results


# ── Provider: Google via Jina Reader ─────────────────────────────────────

async def _search_google_via_jina(query: str, num: int, timeout: float) -> list[dict]:
    """Scrape Google search results via Jina Reader — reliable fallback."""
    search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(
            f"https://r.jina.ai/{search_url}",
            headers={"Accept": "application/json", "X-Return-Format": "markdown"},
        )
        resp.raise_for_status()
        data = resp.json()

    content = data.get("data", {}).get("content", "")
    if not content:
        raise Exception("Empty content from Jina Google search")

    results = []
    for match in _re.finditer(r"\[([^\]]{5,})\]\((https?://[^\)]+)\)", content):
        title = match.group(1).strip()
        url = match.group(2).strip()
        if any(x in url for x in ["google.com", "gstatic.com", "youtube.com/results"]):
            continue
        results.append({"title": title, "url": url, "snippet": ""})
        if len(results) >= num:
            break

    if not results:
        raise Exception("No valid links extracted from Google search")

    return results
