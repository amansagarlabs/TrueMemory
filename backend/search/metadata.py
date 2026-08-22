from __future__ import annotations

from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from services.url_safety import safe_get, validate_public_url

from .cache import metadata_cache
from .models import PageMetadata


def parse_metadata(html: str, url: str) -> PageMetadata:
    soup = BeautifulSoup(html[:500_000], "html.parser")

    def meta(*, name: str | None = None, prop: str | None = None) -> str:
        attrs = {"name": name} if name else {"property": prop}
        node = soup.find("meta", attrs=attrs)
        return str(node.get("content", "")).strip() if node else ""

    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    image = meta(prop="og:image") or meta(name="twitter:image")
    icon = soup.find("link", rel=lambda value: value and "icon" in value)
    favicon = str(icon.get("href", "")).strip() if icon else ""
    return PageMetadata(
        url=url,
        title=meta(prop="og:title") or title,
        description=meta(prop="og:description") or meta(name="description"),
        image_url=urljoin(url, image) if image else "",
        site_name=meta(prop="og:site_name"),
        favicon_url=urljoin(url, favicon) if favicon else urljoin(url, "/favicon.ico"),
    )


async def fetch_page_metadata(url: str, timeout: float = 8.0) -> PageMetadata | None:
    cached = metadata_cache.get(url)
    if cached is not None:
        return cached
    try:
        safe_url = await validate_public_url(url)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            response = await safe_get(
                client,
                safe_url,
                headers={"User-Agent": "Kaidon/1.0 (+open-source-search)"},
            )
            response.raise_for_status()
        if "text/html" not in response.headers.get("content-type", "").lower():
            return None
        metadata = parse_metadata(response.text, str(response.url))
        metadata_cache.set(url, metadata, 900)
        return metadata
    except Exception:
        return None
