"""
CrewAI Flow for routing Kontext Crawl requests to appropriate agents.
"""

from enum import Enum
from typing import Any
from pydantic import BaseModel

from crewai.flow.flow import Flow, start, listen


class RequestType(str, Enum):
    SCRAPE = "scrape"
    CRAWL = "crawl"
    SEARCH = "search"
    MAP = "map"
    RESEARCH = "research"


class CrawlRequest(BaseModel):
    request_type: RequestType
    url: str | None = None
    query: str | None = None
    max_pages: int = 10
    num_results: int = 5
    formats: list[str] = ["markdown"]


class CrawlResponse(BaseModel):
    success: bool
    request_type: RequestType
    data: dict[str, Any]
    error: str | None = None


class AmanCrawlFlow(Flow[CrawlRequest]):
    """Flow that routes requests to the appropriate Kontext Crawl handler."""

    @start()
    def route_request(self) -> str:
        """Route the request based on type."""
        request = self.state
        return request.request_type.value

    @listen("route_request")
    async def handle_request(self, route: str) -> CrawlResponse:
        """Handle the routed request."""
        request = self.state

        try:
            if route == RequestType.SCRAPE:
                return await self._handle_scrape(request)
            elif route == RequestType.CRAWL:
                return await self._handle_crawl(request)
            elif route == RequestType.SEARCH:
                return await self._handle_search(request)
            elif route == RequestType.MAP:
                return await self._handle_map(request)
            elif route == RequestType.RESEARCH:
                return await self._handle_research(request)
            else:
                return CrawlResponse(
                    success=False,
                    request_type=request.request_type,
                    data={},
                    error=f"Unknown request type: {route}",
                )
        except Exception as e:
            return CrawlResponse(
                success=False,
                request_type=request.request_type,
                data={},
                error=str(e),
            )

    async def _handle_scrape(self, request: CrawlRequest) -> CrawlResponse:
        """Handle scrape request."""
        from services.crawl_service import scrape_url

        if not request.url:
            return CrawlResponse(
                success=False,
                request_type=RequestType.SCRAPE,
                data={},
                error="URL is required for scrape",
            )

        result = await scrape_url(
            url=request.url,
            formats=request.formats,
        )

        return CrawlResponse(
            success=True,
            request_type=RequestType.SCRAPE,
            data=result,
        )

    async def _handle_crawl(self, request: CrawlRequest) -> CrawlResponse:
        """Handle crawl request."""
        from services.crawl_service import crawl_site

        if not request.url:
            return CrawlResponse(
                success=False,
                request_type=RequestType.CRAWL,
                data={},
                error="URL is required for crawl",
            )

        result = await crawl_site(
            url=request.url,
            max_pages=request.max_pages,
        )

        return CrawlResponse(
            success=True,
            request_type=RequestType.CRAWL,
            data=result,
        )

    async def _handle_search(self, request: CrawlRequest) -> CrawlResponse:
        """Handle search request."""
        from services.crawl_service import search_web

        if not request.query:
            return CrawlResponse(
                success=False,
                request_type=RequestType.SEARCH,
                data={},
                error="Query is required for search",
            )

        result = await search_web(
            query=request.query,
            num_results=request.num_results,
        )

        return CrawlResponse(
            success=True,
            request_type=RequestType.SEARCH,
            data=result,
        )

    async def _handle_map(self, request: CrawlRequest) -> CrawlResponse:
        """Handle map request."""
        from services.crawl_service import map_site

        if not request.url:
            return CrawlResponse(
                success=False,
                request_type=RequestType.MAP,
                data={},
                error="URL is required for map",
            )

        result = await map_site(url=request.url)

        return CrawlResponse(
            success=True,
            request_type=RequestType.MAP,
            data=result,
        )

    async def _handle_research(self, request: CrawlRequest) -> CrawlResponse:
        """Handle research request (search + optional scrape)."""
        from services.crawl_service import search_web, scrape_url

        if not request.query:
            return CrawlResponse(
                success=False,
                request_type=RequestType.RESEARCH,
                data={},
                error="Query is required for research",
            )

        # First search
        search_result = await search_web(
            query=request.query,
            num_results=request.num_results,
        )

        # If URL provided, also scrape it
        scrape_result = None
        if request.url:
            try:
                scrape_result = await scrape_url(url=request.url)
            except Exception:
                pass

        return CrawlResponse(
            success=True,
            request_type=RequestType.RESEARCH,
            data={
                "search": search_result,
                "scrape": scrape_result,
            },
        )
