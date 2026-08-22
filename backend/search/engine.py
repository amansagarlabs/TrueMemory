from __future__ import annotations

from services.search_router import SearchResult, search_multi

from .image_retrieval import enrich_results


async def search_free(query: str, num_results: int = 5, timeout: float = 10.0, settings=None) -> SearchResult:
    """Run the credential-free provider chain and progressively enrich results."""
    result = await search_multi(query, num_results=num_results, timeout=timeout)
    if not result.results:
        return result
    if settings is None:
        from app.config import get_settings
        settings = get_settings()
    result.results = await enrich_results(result.results, settings, max_results=num_results)
    return result
