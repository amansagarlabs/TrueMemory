"""
CrewAI agent definitions for AmanCrawlweb intelligence.
"""

import os
import logging
from crewai import Agent, Task, Crew, Process, LLM

from agents.tools import (
    JinaReaderTool,
    Crawl4AITool,
    LLMScraperTool,
    ScrapeGraphAITool,
    WebSearchTool,
    SiteMapTool,
)


def _get_llm() -> LLM:
    """Get LLM configured for OpenRouter (or OpenAI if no OpenRouter key)."""
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_model = os.getenv("OPENROUTER_MODEL", "openrouter/free")

    if openrouter_key:
        # Use OpenRouter via LiteLLM
        return LLM(
            model=f"openrouter/{openrouter_model}",
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1",
        )
    # Fallback to OpenAI
    return LLM(model="openrouter/free")


def create_agents():
    """Create specialized agents for web intelligence."""
    llm = _get_llm()

    # Quick Reader — Jina Reader
    read_agent = Agent(
        role="Quick Page Reader",
        goal="Instantly read and summarize web pages using Jina Reader",
        backstory=(
            "Expert in fast web content access. Uses Jina Reader API for "
            "zero-setup, instant page reads. Returns clean markdown perfect "
            "for LLM processing. Always the first choice for single-page reads."
        ),
        tools=[JinaReaderTool()],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    # Deep Crawler — Crawl4AI pattern
    crawl_agent = Agent(
        role="Deep Web Crawler",
        goal="Crawl websites following internal links, extract content from multiple pages",
        backstory=(
            "Expert in multi-page web crawling. Follows internal links systematically, "
            "extracts content from each page, and builds a comprehensive view of websites. "
            "Handles timeouts gracefully and respects crawl limits."
        ),
        tools=[Crawl4AITool(), SiteMapTool()],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    # Data Extractor — LLM Scraper pattern
    extract_agent = Agent(
        role="Structured Data Extractor",
        goal="Extract structured data and clean content from web pages",
        backstory=(
            "Expert in converting unstructured web content to clean, structured data. "
            "Extracts headings, links, images, and text content. Perfect for feeding "
            "data into downstream processing pipelines."
        ),
        tools=[LLMScraperTool()],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    # Flexible Scraper — ScrapeGraphAI pattern
    graph_agent = Agent(
        role="Flexible Content Scraper",
        goal="Use flexible scraping to extract any type of content from web pages",
        backstory=(
            "Expert in flexible web scraping. Can extract any type of content "
            "from web pages including markdown, HTML, text, and metadata. "
            "Adapts to different website structures automatically."
        ),
        tools=[ScrapeGraphAITool()],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    # Research Coordinator — orchestrates the other agents
    coordinator_agent = Agent(
        role="Research Coordinator",
        goal="Coordinate web research tasks and synthesize findings",
        backstory=(
            "Expert in research coordination. Determines the best approach "
            "for web research tasks, delegates to specialized agents, and "
            "synthesizes findings into comprehensive results."
        ),
        tools=[WebSearchTool()],
        llm=llm,
        verbose=True,
        allow_delegation=True,
    )

    # Answer Synthesizer — processes raw results + instruction into concise answer
    synthesizer_agent = Agent(
        role="Answer Synthesizer",
        goal="Analyze raw web data and user instructions to produce clear, concise answers",
        backstory=(
            "Expert at analyzing web crawl/scrape/search results and answering "
            "user questions based on that data. Always references specific data "
            "from the results. Returns direct, actionable answers. Never makes "
            "up information — only uses what's in the provided data."
        ),
        tools=[],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    return {
        "read": read_agent,
        "crawl": crawl_agent,
        "extract": extract_agent,
        "graph": graph_agent,
        "coordinator": coordinator_agent,
        "synthesizer": synthesizer_agent,
    }


def create_scrape_crew(url: str, instruction: str | None = None) -> Crew:
    """Create a crew for scraping a single URL."""
    agents = create_agents()

    description = f"Scrape the content from {url} and extract all useful information"
    if instruction:
        description += f"\n\nUser instruction: {instruction}"

    task = Task(
        description=description,
        expected_output="Comprehensive content extraction with markdown, links, and metadata",
        agent=agents["extract"],
    )

    return Crew(
        agents=[agents["extract"]],
        tasks=[task],
        verbose=True,
        process=Process.sequential,
    )


def create_crawl_crew(url: str, max_pages: int = 10, instruction: str | None = None) -> Crew:
    """Create a crew for crawling a website."""
    agents = create_agents()

    description = f"Crawl {url} following internal links, up to {max_pages} pages"
    if instruction:
        description += f"\n\nUser instruction: {instruction}"

    task = Task(
        description=description,
        expected_output="List of crawled pages with titles and content summaries",
        agent=agents["crawl"],
    )

    return Crew(
        agents=[agents["crawl"]],
        tasks=[task],
        verbose=True,
        process=Process.sequential,
    )


def create_synthesis_crew(raw_data: str, instruction: str) -> Crew:
    """Create a crew for synthesizing an answer from raw data + instruction."""
    agents = create_agents()

    task = Task(
        description=(
            f"Given the following web data:\n\n---\n{raw_data}\n---\n\n"
            f"Answer the user's question based ONLY on the data above.\n"
            f"User question: {instruction}\n\n"
            f"Be concise and direct. If counting items, list the exact count. "
            f"Reference specific items from the data."
        ),
        expected_output="A concise, direct answer to the user's question based on the web data",
        agent=agents["synthesizer"],
    )

    return Crew(
        agents=[agents["synthesizer"]],
        tasks=[task],
        verbose=True,
        process=Process.sequential,
    )


def create_research_crew(query: str, url: str | None = None, instruction: str | None = None) -> Crew:
    """Create a crew for researching a topic."""
    agents = create_agents()

    tasks = []

    # Search task
    search_description = f"Search the web for information about: {query}"
    if instruction:
        search_description += f"\n\nUser instruction: {instruction}"

    search_task = Task(
        description=search_description,
        expected_output="List of relevant search results with titles, URLs, and snippets",
        agent=agents["coordinator"],
    )
    tasks.append(search_task)

    # If URL provided, also scrape it
    if url:
        scrape_description = f"Scrape and analyze the content from {url}"
        if instruction:
            scrape_description += f"\n\nUser instruction: {instruction}"

        scrape_task = Task(
            description=scrape_description,
            expected_output="Detailed content analysis and key findings",
            agent=agents["read"],
        )
        tasks.append(scrape_task)

    return Crew(
        agents=[agents["coordinator"], agents["read"]],
        tasks=tasks,
        verbose=True,
        process=Process.sequential,
    )


def _truncate_data(data: dict, max_chars: int = 8000) -> str:
    """Truncate raw data to fit in LLM context."""
    import json
    raw = json.dumps(data, indent=2)
    if len(raw) <= max_chars:
        return raw
    return raw[:max_chars] + "\n... (truncated)"


async def synthesize_answer(raw_data: dict, instruction: str) -> str | None:
    """Synthesize an answer from raw data + instruction using OpenRouter directly.
    Returns None if synthesis fails."""
    try:
        import httpx
        import json

        api_key = os.getenv("OPENROUTER_API_KEY", "")
        model = os.getenv("OPENROUTER_MODEL", "openrouter/free")

        if not api_key:
            logger.info("AmanCrawl synthesis skipped: OPENROUTER_API_KEY missing")
            return None

        truncated = _truncate_data(raw_data)
        logger.info(
            "AmanCrawl synthesis request",
            extra={
                "instruction_preview": instruction[:120],
                "raw_keys": sorted(list(raw_data.keys())) if isinstance(raw_data, dict) else None,
                "raw_length": len(truncated),
                "model": model,
            },
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": (
                            "You analyze web crawl/scrape/search results and answer user questions. "
                            "Always reference specific data from the results. "
                            "Be concise and direct. Never make up information."
                        )},
                        {"role": "user", "content": (
                            f"Web data:\n\n{truncated}\n\n"
                            f"Question: {instruction}\n\n"
                            "Answer based ONLY on the data above:"
                        )},
                    ],
                },
            )
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"].strip()
            logger.info(
                "AmanCrawl synthesis completed",
                extra={
                    "instruction_preview": instruction[:120],
                    "response_chars": len(answer),
                    "model": model,
                    "status_code": resp.status_code,
                },
            )
            return answer if answer else None
    except Exception as e:
        logger.exception(
            "AmanCrawl synthesis failed",
            extra={
                "instruction_preview": instruction[:120],
                "raw_keys": sorted(list(raw_data.keys())) if isinstance(raw_data, dict) else None,
            },
        )
        return None


class WebIntelligenceCrew:
    """Main crew orchestrator for AmanCrawl."""

    def __init__(self):
        self.agents = create_agents()

    async def scrape(self, url: str, instruction: str | None = None) -> dict:
        """Scrape a single URL with optional AI instruction."""
        crew = create_scrape_crew(url, instruction)
        result = crew.kickoff()
        raw = {"result": str(result), "url": url, "instruction": instruction}

        # If instruction provided, synthesize an answer
        if instruction:
            answer = await synthesize_answer(raw, instruction)
            return {"answer": answer, "raw": raw}
        return raw

    async def crawl(self, url: str, max_pages: int = 10, instruction: str | None = None) -> dict:
        """Crawl a website with optional AI instruction."""
        crew = create_crawl_crew(url, max_pages, instruction)
        result = crew.kickoff()
        raw = {"result": str(result), "url": url, "max_pages": max_pages, "instruction": instruction}

        if instruction:
            answer = await synthesize_answer(raw, instruction)
            return {"answer": answer, "raw": raw}
        return raw

    async def search(self, query: str, num_results: int = 5, instruction: str | None = None) -> dict:
        """Search the web with optional AI instruction."""
        crew = create_research_crew(query, instruction=instruction)
        result = crew.kickoff()
        raw = {"result": str(result), "query": query, "instruction": instruction}

        if instruction:
            answer = await synthesize_answer(raw, instruction)
            return {"answer": answer, "raw": raw}
        return raw

    async def research(self, query: str, url: str | None = None, instruction: str | None = None) -> dict:
        """Research a topic with optional URL analysis and AI instruction."""
        crew = create_research_crew(query, url, instruction)
        result = crew.kickoff()
        raw = {"result": str(result), "query": query, "url": url, "instruction": instruction}

        if instruction:
            answer = await synthesize_answer(raw, instruction)
            return {"answer": answer, "raw": raw}
        return raw
logger = logging.getLogger(__name__)
