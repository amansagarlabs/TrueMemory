from __future__ import annotations

import asyncio
from urllib.parse import urljoin

import httpx

from .cache import image_cache
from .metadata import fetch_page_metadata
from .models import ImageCandidate


def _is_http_url(value: str) -> bool:
    return value.lower().startswith(("http://", "https://"))


async def search_openverse(query: str, *, client: httpx.AsyncClient, limit: int = 3) -> list[ImageCandidate]:
    response = await client.get(
        "https://api.openverse.org/v1/images/",
        params={"q": query, "page_size": limit},
    )
    response.raise_for_status()
    candidates: list[ImageCandidate] = []
    for item in response.json().get("results", [])[:limit]:
        image_url = item.get("thumbnail") or item.get("url") or ""
        if _is_http_url(image_url):
            candidates.append(ImageCandidate(
                url=image_url,
                landing_url=item.get("foreign_landing_url") or item.get("detail_url") or "",
                attribution=item.get("creator") or item.get("title") or "Openverse image",
                license=item.get("license") or "",
                provider="openverse",
                score=float(item.get("score") or 0),
            ))
    return candidates


async def search_wikimedia(query: str, *, client: httpx.AsyncClient, limit: int = 2) -> list[ImageCandidate]:
    response = await client.get(
        "https://commons.wikimedia.org/w/api.php",
        params={
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|mime",
            "iiurlwidth": 640,
            "format": "json",
        },
    )
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {}).values()
    candidates: list[ImageCandidate] = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        image_url = info.get("thumburl") or info.get("url") or ""
        if _is_http_url(image_url):
            candidates.append(ImageCandidate(
                url=image_url,
                landing_url=f"https://commons.wikimedia.org/?curid={page.get('pageid', '')}",
                attribution=page.get("title", "Wikimedia Commons").replace("File:", ""),
                license="Wikimedia Commons license; verify before reuse",
                provider="wikimedia",
            ))
    return candidates


async def enrich_result(item: dict, *, client: httpx.AsyncClient, settings) -> dict:
    enriched = dict(item)
    source_url = str(enriched.get("url") or "")
    if not _is_http_url(str(enriched.get("image_url") or "")):
        enriched["image_url"] = ""
    if _is_http_url(str(enriched.get("image_url") or "")):
        enriched.setdefault("image_provider", enriched.get("provider", "search"))
        return enriched

    if source_url:
        metadata = await fetch_page_metadata(source_url, settings.image_search_timeout)
        if metadata:
            enriched["title"] = enriched.get("title") or metadata.title
            enriched["snippet"] = enriched.get("snippet") or metadata.description
            if _is_http_url(metadata.image_url):
                enriched.update({
                    "image_url": metadata.image_url,
                    "image_landing_url": source_url,
                    "image_provider": "opengraph",
                })

    query = enriched.get("title") or enriched.get("snippet") or ""
    if not enriched.get("image_url") and settings.openverse_enabled and query:
        cache_key = f"openverse:{query.lower().strip()}"
        candidates = image_cache.get(cache_key)
        if candidates is None:
            try:
                candidates = await search_openverse(query, client=client, limit=1)
            except Exception:
                candidates = []
            image_cache.set(cache_key, candidates, 1800)
        if candidates:
            image = candidates[0]
            enriched.update({
                "image_url": image.url,
                "image_landing_url": image.landing_url,
                "image_attribution": image.attribution,
                "image_license": image.license,
                "image_provider": image.provider,
            })

    if not enriched.get("image_url") and settings.wikimedia_enabled and query:
        try:
            candidates = await search_wikimedia(query, client=client, limit=1)
        except Exception:
            candidates = []
        if candidates:
            image = candidates[0]
            enriched.update({
                "image_url": image.url,
                "image_landing_url": image.landing_url,
                "image_attribution": image.attribution,
                "image_license": image.license,
                "image_provider": image.provider,
            })
    return enriched


async def enrich_results(results: list[dict], settings, *, max_results: int | None = None) -> list[dict]:
    if not settings.image_search_enabled:
        return results
    limit = max_results or settings.image_search_max_results
    semaphore = asyncio.Semaphore(4)

    async with httpx.AsyncClient(timeout=settings.image_search_timeout, follow_redirects=False) as client:
        async def enrich(item: dict) -> dict:
            async with semaphore:
                return await enrich_result(item, client=client, settings=settings)

        return await asyncio.gather(*(enrich(item) for item in results[:limit]))
