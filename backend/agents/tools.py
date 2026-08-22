"""
CrewAI tool adapters for AmanCrawl's four crawl tools.
"""

import httpx
from typing import Any, Type
from pydantic import BaseModel, Field

from crewai.tools import BaseTool

from services.crawl_service import scrape_url, crawl_site, map_site, search_web
from services.url_safety import validate_public_url


class JinaReaderInput(BaseModel):
    url: str = Field(..., description="URL to read via Jina Reader")


class JinaReaderTool(BaseTool):
    """Instant single-page reader using Jina Reader API."""

    name: str = "jina_reader"
    description: str = (
        "Read a single web page instantly using Jina Reader. "
        "Returns clean LLM-ready markdown. Best for quick single-page reads. "
        "Input: a URL string."
    )
    args_schema: Type[BaseModel] = JinaReaderInput

    async def _run(self, url: str) -> str:
        url = await validate_public_url(url)
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
            response = await client.get(
                f"https://r.jina.ai/{url}",
                headers={"Accept": "text/markdown"},
            )
            response.raise_for_status()
            return response.text[:50000]


class Crawl4AIInput(BaseModel):
    url: str = Field(..., description="Starting URL to crawl")
    max_pages: int = Field(default=10, description="Maximum pages to crawl")


class Crawl4AITool(BaseTool):
    """Deep multi-page crawler using httpx + BeautifulSoup (Crawl4AI pattern)."""

    name: str = "crawl4ai"
    description: str = (
        "Deep crawl a website following internal links. "
        "Returns page titles and content. Best for multi-page crawls. "
        "Input: a URL and optional max_pages (default 10)."
    )
    args_schema: Type[BaseModel] = Crawl4AIInput

    async def _run(self, url: str, max_pages: int = 10) -> dict:
        result = await crawl_site(url=url, max_pages=max_pages)
        return result


class LLMScraperInput(BaseModel):
    url: str = Field(..., description="URL to scrape")


class LLMScraperTool(BaseTool):
    """Structured data extractor from web pages."""

    name: str = "llm_scraper"
    description: str = (
        "Extract structured data from a web page. "
        "Returns markdown content with headings, links, and text. "
        "Best for getting clean content for further processing. "
        "Input: a URL string."
    )
    args_schema: Type[BaseModel] = LLMScraperInput

    async def _run(self, url: str) -> dict:
        result = await scrape_url(url=url, formats=["markdown", "text"])
        return result


class ScrapeGraphAIInput(BaseModel):
    url: str = Field(..., description="URL to scrape")


class ScrapeGraphAITool(BaseTool):
    """Prompt-driven flexible scraper."""

    name: str = "scrapegraph"
    description: str = (
        "Scrape a web page and extract all useful content. "
        "Returns markdown, links, images, and metadata. "
        "Best for flexible content extraction. "
        "Input: a URL string."
    )
    args_schema: Type[BaseModel] = ScrapeGraphAIInput

    async def _run(self, url: str) -> dict:
        result = await scrape_url(url=url, formats=["markdown", "html", "text"])
        return result


class WebSearchInput(BaseModel):
    query: str = Field(..., description="Search query")
    num_results: int = Field(default=5, description="Number of results")


class WebSearchTool(BaseTool):
    """Search the web using DuckDuckGo."""

    name: str = "web_search"
    description: str = (
        "Search the web for information. Returns titles, URLs, and snippets. "
        "Input: a search query string and optional num_results (default 5)."
    )
    args_schema: Type[BaseModel] = WebSearchInput

    async def _run(self, query: str, num_results: int = 5) -> dict:
        result = await search_web(query=query, num_results=num_results)
        return result


class SiteMapInput(BaseModel):
    url: str = Field(..., description="URL to map")


class SiteMapTool(BaseTool):
    """Map website structure by discovering all internal links."""

    name: str = "site_map"
    description: str = (
        "Map the structure of a website by discovering all internal links. "
        "Returns a tree structure and list of all links. "
        "Input: a URL string."
    )
    args_schema: Type[BaseModel] = SiteMapInput

    async def _run(self, url: str) -> dict:
        result = await map_site(url=url)
        return result
