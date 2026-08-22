"""
Kontext Crawl API routes — web intelligence for AI agents.

All endpoints require authentication via x-auth-context header (set by Next.js middleware)
or bearer token. Scope checks enforced per operation.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth_middleware import AuthContext, log_operation, require_auth, require_scope
from services.crawl_service import scrape_url, crawl_site, map_site, search_web
from services.agent_service import scrape_and_extract, batch_extract
from agents.flows import AmanCrawlFlow, CrawlRequest as FlowCrawlRequest, RequestType
from agents.crawl_agents import WebIntelligenceCrew, synthesize_answer


router = APIRouter(prefix="/api/AmanCrawl", tags=["AmanCrawl"])
logger = logging.getLogger(__name__)

# Initialize crew
crew = WebIntelligenceCrew()


# ── Request models ─────────────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    url: str = Field(..., description="URL to scrape")
    formats: list[str] = Field(
        default=["markdown"],
        description="Output formats: markdown, html, text",
    )
    timeout: float = Field(default=30.0, description="Request timeout in seconds")
    instruction: Optional[str] = Field(default=None, description="AI instruction for what to extract from this page")


class CrawlRequest(BaseModel):
    url: str = Field(..., description="Starting URL to crawl")
    max_pages: int = Field(default=10, description="Maximum pages to crawl")
    timeout: float = Field(default=30.0, description="Request timeout in seconds")
    instruction: Optional[str] = Field(default=None, description="AI instruction for what content to focus on during crawl")


class MapRequest(BaseModel):
    url: str = Field(..., description="Starting URL to map")
    timeout: float = Field(default=30.0, description="Request timeout in seconds")
    instruction: Optional[str] = Field(default=None, description="AI instruction for what types of pages to discover")


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    num_results: int = Field(default=5, description="Number of results to return")
    instruction: Optional[str] = Field(default=None, description="AI instruction to refine search focus")


class CrewScrapeRequest(BaseModel):
    url: str = Field(..., description="URL to scrape with CrewAI")
    use_crew: bool = Field(default=False, description="Use CrewAI agents (vs direct service)")
    instruction: Optional[str] = Field(default=None, description="AI instruction for what to extract")


class CrewCrawlRequest(BaseModel):
    url: str = Field(..., description="Starting URL to crawl with CrewAI")
    max_pages: int = Field(default=10, description="Maximum pages to crawl")
    use_crew: bool = Field(default=False, description="Use CrewAI agents (vs direct service)")
    instruction: Optional[str] = Field(default=None, description="AI instruction for what to focus on")


class CrewResearchRequest(BaseModel):
    query: str = Field(..., description="Research query")
    url: Optional[str] = Field(default=None, description="Optional URL to include in research")
    use_crew: bool = Field(default=False, description="Use CrewAI agents (vs direct service)")
    instruction: Optional[str] = Field(default=None, description="AI instruction to refine research")


# ── Core endpoints (scope-checked) ────────────────────────────────────────

@router.post("/scrape")
async def api_scrape(
    req: ScrapeRequest,
    auth: AuthContext = Depends(require_scope("crawl:scrape")),
):
    """Scrape a single URL and return structured data. Requires: crawl:scrape"""
    log_operation(auth, "scrape", extra={"url": req.url, "has_instruction": bool(req.instruction)})

    # Check rate limit
    from services.subscription_service import check_rate_limit, record_usage
    from app.config import get_settings
    settings = get_settings()
    limit = check_rate_limit(settings, auth.user_id, "crawl:scrape")
    if not limit["allowed"]:
        raise HTTPException(status_code=429, detail={
            "error": "daily_limit_reached",
            "resource": "crawl:scrape",
            "plan": limit.get("plan", "free"),
            "limit": limit["limit"],
            "used": limit["used"],
            "remaining": limit["remaining"],
            "message": f"Daily scrape limit reached ({limit['limit']}). Upgrade your plan for more.",
        })

    try:
        result = await scrape_url(
            url=req.url,
            formats=req.formats,
            timeout=req.timeout,
        )
        # Record usage
        record_usage(settings, user_id=auth.user_id, resource_key="crawl:scrape", endpoint="/api/AmanCrawl/scrape")
        # If instruction provided, try to synthesize an answer
        if req.instruction:
            answer = await synthesize_answer(result, req.instruction)
            if answer:
                return {
                    "user_id": auth.user_id,
                    "answer": answer,
                    "raw": result,
                    "ai_instruction": req.instruction,
                    # Preserve adapter provenance on synthesized responses so
                    # the UI can still identify Jina's advanced reader.
                    "provider": result.get("provider"),
                    "provider_label": result.get("provider_label"),
                }
            # Synthesis failed — return raw with note
            return {
                "user_id": auth.user_id,
                "raw": result,
                "ai_instruction": req.instruction,
                "synthesis_failed": True,
                "provider": result.get("provider"),
                "provider_label": result.get("provider_label"),
            }
        return {"user_id": auth.user_id, **result}
    except Exception as e:
        logger.exception(
            "AmanCrawl scrape failed",
            extra={
                "user_id": str(auth.user_id),
                "url": req.url,
                "has_instruction": bool(req.instruction),
                "formats": req.formats,
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/crawl")
async def api_crawl(
    req: CrawlRequest,
    auth: AuthContext = Depends(require_scope("crawl:crawl")),
):
    """Crawl a website starting from the given URL. Requires: crawl:crawl"""
    log_operation(auth, "crawl", extra={"url": req.url, "max_pages": req.max_pages, "has_instruction": bool(req.instruction)})

    from services.subscription_service import check_rate_limit, record_usage
    from app.config import get_settings
    settings = get_settings()
    limit = check_rate_limit(settings, auth.user_id, "crawl:crawl")
    if not limit["allowed"]:
        raise HTTPException(status_code=429, detail={
            "error": "monthly_limit_reached",
            "resource": "crawl:crawl",
            "plan": limit.get("plan", "free"),
            "limit": limit["limit"],
            "used": limit["used"],
            "remaining": limit["remaining"],
            "message": f"Monthly crawl limit reached ({limit['limit']}). Upgrade your plan for more.",
        })

    try:
        result = await crawl_site(
            url=req.url,
            max_pages=min(req.max_pages, 50),
            timeout=req.timeout,
        )
        record_usage(settings, user_id=auth.user_id, resource_key="crawl:crawl", quantity=1, endpoint="/api/AmanCrawl/crawl")
        if req.instruction:
            answer = await synthesize_answer(result, req.instruction)
            if answer:
                return {"user_id": auth.user_id, "answer": answer, "raw": result, "ai_instruction": req.instruction}
            return {"user_id": auth.user_id, "raw": result, "ai_instruction": req.instruction, "synthesis_failed": True}
        return {"user_id": auth.user_id, **result}
    except Exception as e:
        logger.exception(
            "AmanCrawl crawl failed",
            extra={
                "user_id": str(auth.user_id),
                "url": req.url,
                "max_pages": req.max_pages,
                "has_instruction": bool(req.instruction),
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/map")
async def api_map(
    req: MapRequest,
    auth: AuthContext = Depends(require_scope("crawl:map")),
):
    """Map the structure of a website. Requires: crawl:map"""
    log_operation(auth, "map", extra={"url": req.url, "has_instruction": bool(req.instruction)})

    from services.subscription_service import check_rate_limit, record_usage
    from app.config import get_settings
    settings = get_settings()
    limit = check_rate_limit(settings, auth.user_id, "crawl:map")
    if not limit["allowed"]:
        raise HTTPException(status_code=429, detail={
            "error": "daily_limit_reached",
            "resource": "crawl:map",
            "plan": limit.get("plan", "free"),
            "limit": limit["limit"],
            "used": limit["used"],
            "remaining": limit["remaining"],
            "message": f"Daily map limit reached ({limit['limit']}). Upgrade your plan for more.",
        })

    try:
        result = await map_site(
            url=req.url,
            timeout=req.timeout,
        )
        record_usage(settings, user_id=auth.user_id, resource_key="crawl:map", endpoint="/api/AmanCrawl/map")
        if req.instruction:
            answer = await synthesize_answer(result, req.instruction)
            if answer:
                return {"user_id": auth.user_id, "answer": answer, "raw": result, "ai_instruction": req.instruction}
            return {"user_id": auth.user_id, "raw": result, "ai_instruction": req.instruction, "synthesis_failed": True}
        return {"user_id": auth.user_id, **result}
    except Exception as e:
        logger.exception(
            "AmanCrawl map failed",
            extra={
                "user_id": str(auth.user_id),
                "url": req.url,
                "has_instruction": bool(req.instruction),
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/search")
async def api_search(
    req: SearchRequest,
    auth: AuthContext = Depends(require_scope("crawl:search")),
):
    """Search the web. Requires: crawl:search"""
    log_operation(auth, "search", extra={"query": req.query, "has_instruction": bool(req.instruction)})

    from services.subscription_service import check_rate_limit, record_usage
    from app.config import get_settings
    settings = get_settings()
    limit = check_rate_limit(settings, auth.user_id, "crawl:search")
    if not limit["allowed"]:
        raise HTTPException(status_code=429, detail={
            "error": "daily_limit_reached",
            "resource": "crawl:search",
            "plan": limit.get("plan", "free"),
            "limit": limit["limit"],
            "used": limit["used"],
            "remaining": limit["remaining"],
            "message": f"Daily search limit reached ({limit['limit']}). Upgrade your plan for more.",
        })

    try:
        result = await search_web(
            query=req.query,
            num_results=min(req.num_results, 20),
        )
        record_usage(settings, user_id=auth.user_id, resource_key="crawl:search", endpoint="/api/AmanCrawl/search")
        if req.instruction:
            answer = await synthesize_answer(result, req.instruction)
            if answer:
                return {"user_id": auth.user_id, "answer": answer, "raw": result, "ai_instruction": req.instruction}
            return {"user_id": auth.user_id, "raw": result, "ai_instruction": req.instruction, "synthesis_failed": True}
        return {"user_id": auth.user_id, **result}
    except Exception as e:
        logger.exception(
            "AmanCrawl search failed",
            extra={
                "user_id": str(auth.user_id),
                "query": req.query,
                "has_instruction": bool(req.instruction),
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


# ── CrewAI-powered endpoints ──────────────────────────────────────────────

@router.post("/crew/scrape")
async def api_crew_scrape(
    req: CrewScrapeRequest,
    auth: AuthContext = Depends(require_scope("crawl:scrape")),
):
    """Scrape a URL using CrewAI agents or direct service. Requires: crawl:scrape"""
    log_operation(auth, "crew_scrape", extra={"url": req.url, "use_crew": req.use_crew, "has_instruction": bool(req.instruction)})
    try:
        if req.use_crew:
            result = await crew.scrape(req.url, req.instruction)
            return {"user_id": auth.user_id, **result}
        else:
            result = await scrape_url(url=req.url, formats=["markdown", "text"])
            if req.instruction:
                result["ai_instruction"] = req.instruction
            return {"user_id": auth.user_id, "result": result, "url": req.url, "method": "direct"}
    except Exception as e:
        logger.exception(
            "AmanCrawl crew scrape failed",
            extra={
                "user_id": str(auth.user_id),
                "url": req.url,
                "use_crew": req.use_crew,
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/crew/crawl")
async def api_crew_crawl(
    req: CrewCrawlRequest,
    auth: AuthContext = Depends(require_scope("crawl:crawl")),
):
    """Crawl a website using CrewAI agents or direct service. Requires: crawl:crawl"""
    log_operation(auth, "crew_crawl", extra={"url": req.url, "max_pages": req.max_pages, "has_instruction": bool(req.instruction)})
    try:
        if req.use_crew:
            result = await crew.crawl(req.url, req.max_pages, req.instruction)
            return {"user_id": auth.user_id, **result}
        else:
            result = await crawl_site(url=req.url, max_pages=req.max_pages)
            if req.instruction:
                result["ai_instruction"] = req.instruction
            return {"user_id": auth.user_id, "result": result, "url": req.url, "max_pages": req.max_pages, "method": "direct"}
    except Exception as e:
        logger.exception(
            "AmanCrawl crew crawl failed",
            extra={
                "user_id": str(auth.user_id),
                "url": req.url,
                "max_pages": req.max_pages,
                "use_crew": req.use_crew,
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/crew/research")
async def api_crew_research(
    req: CrewResearchRequest,
    auth: AuthContext = Depends(require_scope("crawl:search")),
):
    """Research a topic using CrewAI agents or direct service. Requires: crawl:search"""
    log_operation(auth, "crew_research", extra={"query": req.query, "url": req.url, "has_instruction": bool(req.instruction)})
    try:
        if req.use_crew:
            result = await crew.research(req.query, req.url, req.instruction)
            return {"user_id": auth.user_id, **result}
        else:
            search_result = await search_web(query=req.query, num_results=5)
            scrape_result = None
            if req.url:
                try:
                    scrape_result = await scrape_url(url=req.url, formats=["markdown"])
                except Exception:
                    pass
            return {
                "user_id": auth.user_id,
                "result": {"search": search_result, "scrape": scrape_result},
                "query": req.query,
                "url": req.url,
                "instruction": req.instruction,
                "method": "direct",
            }
    except Exception as e:
        logger.exception(
            "AmanCrawl crew research failed",
            extra={
                "user_id": str(auth.user_id),
                "query": req.query,
                "url": req.url,
                "use_crew": req.use_crew,
            },
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/flow")
async def api_flow(
    req: FlowCrawlRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Process request through CrewAI Flow. Requires authentication."""
    log_operation(auth, "flow", extra={"request_type": req.request_type})
    try:
        flow = AmanCrawlFlow()
        result = await flow.kickoff(req)
        return {"user_id": auth.user_id, **result}
    except Exception as e:
        logger.exception(
            "AmanCrawl flow failed",
            extra={"user_id": str(auth.user_id), "request_type": req.request_type},
        )
        raise HTTPException(status_code=400, detail=str(e))


# ── Prompt refinement ──────────────────────────────────────────────────────

class RefinePromptRequest(BaseModel):
    instruction: str = Field(..., description="User's raw instruction to refine")
    context: str = Field(default="scrape", description="Operation context: scrape, crawl, map, search")


@router.post("/refine-prompt")
async def api_refine_prompt(
    req: RefinePromptRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Refine a user instruction into an optimized prompt for the AI agent. Requires authentication."""
    log_operation(auth, "refine_prompt", extra={"context": req.context, "original_length": len(req.instruction)})
    try:
        import os
        import httpx

        api_key = os.getenv("OPENROUTER_API_KEY", "")
        model = os.getenv("OPENROUTER_MODEL", "openrouter/free")

        if not api_key:
            return {"refined": req.instruction, "original": req.instruction}

        context_hints = {
            "scrape": "The user wants to scrape a single web page. Focus on what specific data to extract.",
            "crawl": "The user wants to crawl multiple pages. Focus on which pages to visit and what to extract.",
            "map": "The user wants to discover website structure. Focus on what types of pages to find.",
            "search": "The user wants to search the web. Focus on what information to find.",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": (
                            "You are a prompt optimizer for web scraping AI agents. "
                            "Rewrite the user's instruction into a clear, specific, optimized prompt. "
                            f"Context: {context_hints.get(req.context, context_hints['scrape'])}\n\n"
                            "Rules: concise (1-3 sentences), specific about data to extract, "
                            "include constraints. Output ONLY the refined prompt, no explanations."
                        )},
                        {"role": "user", "content": f"Refine this instruction:\n\n{req.instruction}"},
                    ],
                },
            )
            resp.raise_for_status()
            refined = resp.json()["choices"][0]["message"]["content"].strip()
            return {"refined": refined, "original": req.instruction}
    except Exception as e:
        import logging
        logging.warning(f"Prompt refinement failed: {e}")
        return {"refined": req.instruction, "original": req.instruction}


# ── AI Agent endpoints (scope-checked) ───────────────────────────────────

class AgentExtractRequest(BaseModel):
    url: str = Field(..., description="URL to scrape and extract data from")
    instruction: str = Field(..., description="What to extract (e.g. 'Extract all product names and prices as JSON')")
    output_format: str = Field(default="auto", description="Output format: json, markdown, text, auto")
    model: str = Field(default="openrouter/free", description="OpenRouter model to use")


class AgentBatchRequest(BaseModel):
    urls: list[str] = Field(..., description="List of URLs to extract from (max 20)")
    instruction: str = Field(..., description="What to extract from each URL")
    output_format: str = Field(default="auto", description="Output format: json, markdown, text, auto")
    model: str = Field(default="openrouter/free", description="OpenRouter model to use")


@router.post("/agent/extract")
async def api_agent_extract(
    req: AgentExtractRequest,
    auth: AuthContext = Depends(require_auth),
):
    """AI Agent: scrape a URL and extract/transform data using LLM."""
    await require_scope("crawl:extract")(auth)
    log_operation(auth, "agent_extract", extra={"url": req.url})

    result = await scrape_and_extract(
        url=req.url,
        instruction=req.instruction,
        output_format=req.output_format,
        model=req.model,
    )

    # Record usage (1 extraction = 1 crawl usage)
    from app.config import get_settings
    from services.subscription_service import record_usage
    settings = get_settings()
    record_usage(settings, user_id=auth.user_id, resource_key="crawl:scrape")

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/agent/batch")
async def api_agent_batch(
    req: AgentBatchRequest,
    auth: AuthContext = Depends(require_auth),
):
    """AI Agent: extract data from multiple URLs in batch."""
    await require_scope("crawl:extract")(auth)
    log_operation(auth, "agent_batch", extra={"url_count": len(req.urls)})

    if len(req.urls) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 URLs per batch")

    result = await batch_extract(
        urls=req.urls,
        instruction=req.instruction,
        output_format=req.output_format,
        model=req.model,
    )

    # Record usage (batch = N crawl usages)
    from app.config import get_settings
    from services.subscription_service import record_usage
    settings = get_settings()
    for _ in range(result["successful"]):
        record_usage(settings, user_id=auth.user_id, resource_key="crawl:scrape")

    return result


# ── Health check (public) ────────────────────────────────────────────────

@router.get("/health")
async def api_health():
    """Health check for AmanCrawlservice."""
    return {"status": "ok", "service": "AmanCrawl"}
