"""
AmanCrawlservice — web intelligence for AI agents.

Provides scrape, crawl, search, and map functionality.
"""

import os
import re
import hashlib
import random
from urllib.parse import urljoin, urlparse
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from .url_safety import safe_get, validate_public_url


async def scrape_url(
    url: str,
    formats: list[str] | None = None,
    timeout: float = 30.0,
) -> dict:
    """
    Scrape a single URL with the production fallback chain:
    Jina Reader (advanced) → validated HTTP reader.
    """
    if formats is None:
        formats = ["markdown", "html"]

    url = await validate_public_url(url)

    # Jina performs JavaScript rendering without exposing this application's
    # network to browser-driven redirects and subresource requests.
    try:
        jina_result = await _jina_scrape(url, timeout)
        if jina_result and jina_result.get("markdown"):
            jina_result["provider"] = "jina"
            # Keep the machine provider key stable for source normalization while
            # exposing a product-facing label in the AmanCrawlUI.
            jina_result["provider_label"] = "Jina AI Reader (advanced)"
            return jina_result
    except Exception:
        pass

    # Direct HTTP fallback re-validates DNS and every redirect.
    httpx_result = await _httpx_scrape(url, formats, timeout)
    if httpx_result:
        httpx_result["provider"] = "httpx"
        httpx_result["provider_label"] = "HTTP reader (fallback)"
    return httpx_result


async def _jina_scrape(url: str, timeout: float = 30.0) -> dict | None:
    """Scrape using Jina Reader API — best for sites with anti-bot protection."""
    url = await validate_public_url(url)
    jina_key = os.getenv("JINA_API_KEY", "")

    headers = {
        "Accept": "application/json",
        "X-Retain-Images": "none",
        "X-Return-Format": "markdown",
    }
    if jina_key:
        headers["Authorization"] = f"Bearer {jina_key}"

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        resp = await client.get(f"https://r.jina.ai/{url}", headers=headers)
        resp.raise_for_status()
        data = resp.json()

    content = data.get("data", {})
    title = content.get("title", "")
    # Jina returns content in "content" field (markdown format), not "markdown"
    markdown = content.get("content", "") or content.get("markdown", "")
    description = content.get("description", "")

    if not markdown:
        return None

    # Parse markdown for headings
    headings = []
    for line in markdown.split("\n"):
        match = re.match(r"^(#{1,6})\s+(.+)", line)
        if match:
            headings.append({"level": f"h{len(match.group(1))}", "text": match.group(2)})

    return {
        "url": url,
        "status_code": 200,
        "title": title,
        "description": description,
        "headings": headings[:20],
        "links": [],
        "images": [],
        "content_length": len(markdown),
        "markdown": markdown,
        "text": markdown,
    }


async def _httpx_scrape(url: str, formats: list[str], timeout: float = 30.0) -> dict:
    """Fallback scrape using httpx with browser-like headers."""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ]

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        headers={
            "User-Agent": random.choice(user_agents),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        },
    ) as client:
        response = await safe_get(client, url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove script and style elements
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    # Extract meta description
    meta_desc = ""
    meta_tag = soup.find("meta", attrs={"name": "description"})
    if meta_tag and meta_tag.get("content"):
        meta_desc = meta_tag["content"].strip()

    # Extract headings
    headings = []
    for h in soup.find_all(["h1", "h2", "h3"]):
        text = h.get_text(strip=True)
        if text:
            headings.append({"level": h.name, "text": text})

    # Extract links
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        text = a.get_text(strip=True)
        if href and text:
            absolute_url = urljoin(url, href)
            links.append({"text": text, "url": absolute_url})

    # Extract images
    images = []
    for img in soup.find_all("img", src=True):
        src = urljoin(url, img["src"])
        alt = img.get("alt", "")
        images.append({"src": src, "alt": alt})

    # Extract text content as markdown
    markdown = _soup_to_markdown(soup)

    result: dict = {
        "url": url,
        "status_code": response.status_code,
        "title": title,
        "description": meta_desc,
        "headings": headings[:20],
        "links": links[:50],
        "images": images[:20],
        "content_length": len(markdown),
    }

    if "markdown" in formats:
        result["markdown"] = markdown[:50000]
    if "html" in formats:
        result["html"] = response.text[:100000]
    if "text" in formats:
        result["text"] = soup.get_text(separator="\n", strip=True)[:50000]

    return result


def _browser_headers() -> dict:
    """Return browser-like headers for httpx requests."""
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ]
    return {
        "User-Agent": random.choice(user_agents),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }


# URL patterns to skip during crawl (boilerplate, navigation, auth pages)
SKIP_PATTERNS = [
    # Medium
    "/m/signin", "/m/signup", "/m/account", "/m/lists", "/m/stories",
    "/me/", "/tag/", "/feed/", "/?source=", "/cmp/",
    # Generic
    "/login", "/signup", "/register", "/auth", "/account", "/settings",
    "/privacy", "/terms", "/cookies", "/sitemap", "/robots.txt",
    "/feed", "/rss", "/atom", ".xml", ".json", ".css", ".js",
    ".jpg", ".png", ".gif", ".svg", ".ico", ".pdf",
]

SKIP_TITLE_PATTERNS = [
    "Medium: Read and write stories",
    "Page not found",
    "Sign up",
    "Log in",
    "404",
    "500",
]


def _should_skip_url(url: str) -> bool:
    """Check if URL should be skipped during crawl."""
    lower = url.lower()
    for pattern in SKIP_PATTERNS:
        if pattern in lower:
            return True
    return False


def _should_skip_page(title: str, text: str, min_chars: int = 100) -> bool:
    """Check if page content is too thin/boilerplate to include."""
    # Skip pages with very little content
    if len(text.strip()) < min_chars:
        return True
    # Skip pages with boilerplate titles
    for pattern in SKIP_TITLE_PATTERNS:
        if pattern.lower() in title.lower():
            return True
    return False


async def crawl_site(
    url: str,
    max_pages: int = 10,
    timeout: float = 30.0,
) -> dict:
    """Crawl a website starting from the given URL, following internal links."""
    url = await validate_public_url(url)
    parsed_base = urlparse(url)
    base_domain = parsed_base.netloc

    visited: set[str] = set()
    queue = [url]
    pages: list[dict] = []

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        headers=_browser_headers(),
    ) as client:
        while queue and len(pages) < max_pages:
            current_url = queue.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            # Skip boilerplate URLs
            if _should_skip_url(current_url):
                continue

            try:
                response = await safe_get(client, current_url)
                if response.status_code >= 400:
                    continue

                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    continue

                soup = BeautifulSoup(response.text, "html.parser")
                for tag in soup(["script", "style"]):
                    tag.decompose()

                title = soup.title.string.strip() if soup.title and soup.title.string else ""

                # Extract text
                text = soup.get_text(separator="\n", strip=True)

                # Skip boilerplate pages
                if _should_skip_page(title, text, min_chars=80):
                    continue

                page_data = {
                    "url": current_url,
                    "title": title,
                    "status_code": response.status_code,
                    "content_length": len(text),
                    "text": text[:10000],
                }
                pages.append(page_data)

                # Find internal links
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    absolute = urljoin(current_url, href)
                    parsed = urlparse(absolute)
                    if (
                        parsed.netloc == base_domain
                        and parsed.scheme in ("http", "https")
                        and absolute not in visited
                        and len(pages) < max_pages
                    ):
                        # Remove fragment
                        clean_url = parsed._replace(fragment="").geturl()
                        if clean_url not in visited and not _should_skip_url(clean_url):
                            queue.append(clean_url)

            except Exception:
                continue

    return {
        "start_url": url,
        "pages_crawled": len(pages),
        "pages": pages,
    }


async def _jina_map_links(url: str, timeout: float = 15.0) -> list[str]:
    """Extract links from a page using Jina Reader."""
    url = await validate_public_url(url)
    jina_key = os.getenv("JINA_API_KEY", "")
    headers = {"Accept": "application/json"}
    if jina_key:
        headers["Authorization"] = f"Bearer {jina_key}"

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        resp = await client.get(f"https://r.jina.ai/{url}", headers=headers)
        resp.raise_for_status()
        data = resp.json()

    content = data.get("data", {})
    links = []

    # Extract links from markdown content (Jina returns in "content" field)
    markdown = content.get("content", "") or content.get("markdown", "")
    for match in re.finditer(r"\[([^\]]+)\]\((https?://[^\)]+)\)", markdown):
        links.append(match.group(2))

    # Also check raw markdown for bare URLs
    for match in re.finditer(r"(?<!\()(https?://[^\s\)]+)", markdown):
        links.append(match.group(1))

    return list(set(links))


async def map_site(
    url: str,
    timeout: float = 30.0,
) -> dict:
    """Map the structure of a website by discovering all internal links.
    Uses Jina Reader for initial fetch (handles anti-bot), then crawls discovered links.
    """
    url = await validate_public_url(url)
    parsed_base = urlparse(url)
    base_domain = parsed_base.netloc

    visited: set[str] = set()
    queue = [url]
    all_links: set[str] = set()

    # Try Jina Reader first for the initial page
    try:
        jina_links = await _jina_map_links(url, timeout)
        for link in jina_links:
            parsed = urlparse(link)
            if parsed.netloc == base_domain and parsed.scheme in ("http", "https"):
                clean_url = parsed._replace(fragment="").geturl()
                if not _should_skip_url(clean_url):
                    all_links.add(clean_url)
                    if clean_url not in visited:
                        queue.append(clean_url)
    except Exception:
        pass

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        headers=_browser_headers(),
    ) as client:
        while queue and len(visited) < 500:
            current_url = queue.pop(0)
            if current_url in visited:
                continue
            visited.add(current_url)

            if _should_skip_url(current_url):
                continue

            try:
                response = await safe_get(client, current_url)
                if response.status_code >= 400:
                    continue

                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    continue

                soup = BeautifulSoup(response.text, "html.parser")

                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    absolute = urljoin(current_url, href)
                    parsed = urlparse(absolute)
                    if (
                        parsed.netloc == base_domain
                        and parsed.scheme in ("http", "https")
                    ):
                        clean_url = parsed._replace(fragment="").geturl()
                        if not _should_skip_url(clean_url):
                            all_links.add(clean_url)
                            if clean_url not in visited:
                                queue.append(clean_url)

            except Exception:
                continue

    # If no links found (e.g. single article page), return the URL itself
    if not all_links:
        all_links.add(url)

    # Organize by path depth
    tree: dict = {}
    for link in sorted(all_links):
        parsed = urlparse(link)
        parts = [p for p in parsed.path.split("/") if p]
        current = tree
        for part in parts:
            if part not in current:
                current[part] = {}
            current = current[part]

    return {
        "start_url": url,
        "total_links": len(all_links),
        "links": sorted(all_links),
        "structure": tree,
    }


async def search_web(
    query: str,
    num_results: int = 5,
    timeout: float = 15.0,
) -> dict:
    """Search the free provider chain and progressively enrich result images."""
    from app.config import get_settings
    from search.engine import search_free

    result = await search_free(query, num_results, timeout, get_settings())
    return {
        "query": result.query,
        "results": result.results,
        "provider": result.provider,
        "latency_ms": result.latency_ms,
        "attempted": result.attempted,
    }


async def _google_search_via_jina(query: str, num_results: int = 5, timeout: float = 15.0) -> dict:
    """Search via Jina Reader scraping Google search results."""
    import re as _re

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

    # Extract links from markdown: [title](url)
    results = []
    for match in _re.finditer(r"\[([^\]]{5,})\]\((https?://[^\)]+)\)", content):
        title = match.group(1).strip()
        url = match.group(2).strip()
        # Skip Google internal links
        if any(x in url for x in ["google.com", "gstatic.com", "youtube.com/results"]):
            continue
        results.append({"title": title, "url": url, "snippet": ""})
        if len(results) >= num_results:
            break

    if not results:
        raise Exception("No valid links extracted from Google search")

    return {"query": query, "results": results}


async def _jina_search(query: str, num_results: int = 5, timeout: float = 10.0) -> dict:
    """Fallback search using Jina Search API."""
    import os
    jina_key = os.getenv("JINA_API_KEY", "")

    headers = {
        "Accept": "application/json",
        "X-Retain-Images": "none",
    }
    if jina_key:
        headers["Authorization"] = f"Bearer {jina_key}"

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(
            f"https://s.jina.ai/{query}",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("data", [])[:num_results]:
        results.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "snippet": item.get("description", ""),
        })

    return {"query": query, "results": results}


def _soup_to_markdown(soup: BeautifulSoup) -> str:
    """Convert BeautifulSoup to simple markdown."""
    lines = []

    for element in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "a", "img"]):
        tag = element.name
        text = element.get_text(strip=True)

        if not text:
            continue

        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(tag[1])
            lines.append(f"{'#' * level} {text}")
        elif tag == "p":
            lines.append(text)
        elif tag == "li":
            lines.append(f"- {text}")
        elif tag == "a":
            href = element.get("href", "")
            if href:
                lines.append(f"[{text}]({href})")
            else:
                lines.append(text)
        elif tag == "img":
            src = element.get("src", "")
            alt = element.get("alt", "")
            if src:
                lines.append(f"![{alt}]({src})")

    return "\n\n".join(lines)
