import asyncio

from services import search_router


def test_default_provider_chain_is_credential_free(monkeypatch):
    calls = []

    async def searx(query, num, timeout):
        calls.append("searxng")
        return []

    async def ddg(query, num, timeout):
        calls.append("duckduckgo")
        return [{"title": "Result", "url": "https://example.org", "snippet": "text"}]

    async def paid(query, num, timeout):
        calls.append("paid")
        return []

    monkeypatch.delenv("SEARCH_ALLOW_REMOTE_FALLBACK", raising=False)
    monkeypatch.delenv("SEARCH_FREE_ONLY", raising=False)
    monkeypatch.setattr(search_router, "_search_searxng", searx)
    monkeypatch.setattr(search_router, "_search_ddg", ddg)
    monkeypatch.setattr(search_router, "_search_tavily", paid)
    monkeypatch.setattr(search_router, "_search_brave", paid)

    result = asyncio.run(search_router.search_multi("hello"))
    assert result.provider == "duckduckgo"
    assert calls == ["searxng", "duckduckgo"]
