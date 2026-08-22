Exit code: 0
Wall time: 0.3 seconds
Output:
# Kontext — Architecture Reference

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Kontext                                     │
├─────────────────────────────────┬───────────────────────────────────────────┤
│         AmanAgentLab            │              AmanCrawl                   │
│    Personal AI Operating System │       Web Intelligence Infrastructure    │
├─────────────────────────────────┼───────────────────────────────────────────┤
│  Memory · Artifacts · RAG       │   Search · Crawl · Scrape · Extract      │
│  Agent Workflows · MCP          │   Browser · API · CLI · SDK · MCP        │
└──────────────┬──────────────────┴──────────────────┬────────────────────────┘
               │                                     │
               └─────────────┬───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   CrewAI Layer  │
                    │  Orchestration  │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
     │  Crawl4AI   │  │ Jina Reader │  │ ScrapeGraph │
     │  LLM Scraper│  │             │  │     AI      │
     └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Entry Point — API / MCP Server Trigger

```
POST /api/agent/execute
POST /api/AmanCrawl/scrape
POST /api/AmanCrawl/crawl
POST /api/AmanCrawl/search
POST /api/AmanCrawl/map

MCP Tools:
  AmanCrawl.scrape
  AmanCrawl.crawl
  AmanCrawl.search
  AmanCrawl.map
  AmanCrawl.extract
```

**Why**: Single entry point for all agent operations. The API/MCP server routes requests to the CrewAI orchestration layer.

---

## Orchestration — CrewAI

### Why CrewAI?

| Metric | CrewAI | LangGraph |
|--------|--------|-----------|
| Speed | 5.76× faster | Baseline |
| GitHub Stars | 53k+ | 10k+ |
| Independence | LangChain-free | LangChain-dependent |
| Multi-agent | Crews (autonomous) | Manual coordination |
| Event-driven | Flows | Limited |
| Tool integration | Native MCP | Manual |

### CrewAI Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CrewAI Runtime                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    Crews     │    │    Flows     │    │   Tasks      │  │
│  │  (Autonomous │    │ (Event-      │    │  (Work units)│  │
│  │   multi-     │    │  driven      │    │              │  │
│  │   agent)     │    │  orchestrate)│    │              │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         └───────────────────┼───────────────────┘          │
│                             │                              │
│                    ┌────────▼────────┐                     │
│                    │   Agent Pool    │                     │
│                    │  (Specialized)  │                     │
│                    └────────┬────────┘                     │
│                             │                              │
│                    ┌────────▼────────┐                     │
│                    │   Tool Registry │                     │
│                    │  (Crawl/Scrape) │                     │
│                    └─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Crew Definition

```python
from crewai import Agent, Task, Crew

# Define specialized agents
crawl_agent = Agent(
    role="Web Crawler",
    goal="Deep crawl websites following links, handle JS-rendered pages",
    backstory="Expert in web crawling with Playwright and async operations",
    tools=[crawl4ai_tool],
    verbose=True,
)

scrape_agent = Agent(
    role="Data Extractor",
    goal="Extract structured data from web pages using LLM function calling",
    backstory="Expert in converting unstructured web content to typed schemas",
    tools=[llm_scraper_tool],
    verbose=True,
)

read_agent = Agent(
    role="Quick Reader",
    goal="Instantly read and summarize web pages",
    backstory="Fast reader using Jina Reader API for zero-setup page access",
    tools=[jina_reader_tool],
    verbose=True,
)

graph_agent = Agent(
    role="Flexible Scraper",
    goal="Use natural language prompts to extract specific data from pages",
    backstory="Expert in prompt-driven scraping with ScrapeGraphAI",
    tools=[scrapegraph_tool],
    verbose=True,
)

# Define tasks
crawl_task = Task(
    description="Crawl {url} and extract all internal pages",
    expected_output="List of pages with titles and content",
    agent=crawl_agent,
)

scrape_task = Task(
    description="Extract structured data from {url} using schema: {schema}",
    expected_output="JSON object matching the provided schema",
    agent=scrape_agent,
)

# Create crew
web_intelligence_crew = Crew(
    agents=[crawl_agent, scrape_agent, read_agent, graph_agent],
    tasks=[crawl_task, scrape_task],
    verbose=True,
)
```

---

## Specialized Agents

### 1. Crawl Agent — Crawl4AI

```
┌─────────────────────────────────────────────┐
│              Crawl Agent                    │
│              (Crawl4AI)                     │
├─────────────────────────────────────────────┤
│  Role: Deep Web Crawler                     │
│  Goal: Multi-page crawling with JS support  │
│                                             │
│  Capabilities:                              │
│  ✓ 100% open-source, async-first            │
│  ✓ JS rendering via Playwright              │
│  ✓ Outputs clean Markdown for LLMs          │
│  ✓ Best for: deep crawls, pipelines         │
│                                             │
│  Input: URL + max_pages + depth             │
│  Output: Markdown pages + link graph        │
└─────────────────────────────────────────────┘
```

**Implementation**:
```python
# pip install crawl4ai

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

async def crawl_site(url: str, max_pages: int = 10):
    config = CrawlerRunConfig(
        word_count_threshold=10,
        exclude_external_links=True,
    )
    
    async with AsyncWebCrawler() as crawler:
        results = await crawler.arun(
            url=url,
            config=config,
        )
        return results
```

### 2. Read Agent — Jina Reader

```
┌─────────────────────────────────────────────┐
│              Read Agent                     │
│              (Jina Reader)                  │
├─────────────────────────────────────────────┤
│  Role: Quick Page Reader                    │
│  Goal: Instant single-page content access   │
│                                             │
│  Capabilities:                              │
│  ✓ Zero-install: GET s.jina.ai/URL          │
│  ✓ Returns clean LLM-ready markdown         │
│  ✓ Free tier available                      │
│  ✓ Best for: quick single-page reads        │
│                                             │
│  Input: URL                                 │
│  Output: Clean markdown content             │
└─────────────────────────────────────────────┘
```

**Implementation**:
```python
import httpx

async def read_page(url: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.get(f"https://s.jina.ai/{url}")
        return response.text
```

### 3. Graph Agent — LLM Scraper (TypeScript)

```
┌─────────────────────────────────────────────┐
│              Graph Agent                    │
│              (LLM Scraper)                  │
├─────────────────────────────────────────────┤
│  Role: Structured Data Extractor            │
│  Goal: Convert pages to typed JSON schemas  │
│                                             │
│  Capabilities:                              │
│  ✓ Function calling → typed schemas         │
│  ✓ Works with any LLM provider              │
│  ✓ Returns validated JSON objects           │
│  ✓ Best for: structured data extraction     │
│                                             │
│  Input: URL + JSON schema                   │
│  Output: Validated JSON object              │
└─────────────────────────────────────────────┘
```

**Implementation**:
```typescript
// npm install llm-scraper

import { LLMScraper } from 'llm-scraper';

const scraper = new LLMScraper('openai');

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    links: { type: 'array', items: { type: 'string' } },
  },
};

const result = await scraper.loadUrl(url, schema);
```

### 4. Read Agent — ScrapeGraphAI

```
┌─────────────────────────────────────────────┐
│              Graph Agent                    │
│              (ScrapeGraphAI)                │
├─────────────────────────────────────────────┤
│  Role: Flexible Prompt Scraper              │
│  Goal: Extract data using natural language  │
│                                             │
│  Capabilities:                              │
│  ✓ Graph-based scraping pipelines           │
│  ✓ SmartScraperGraph: prompt → data         │
│  ✓ Supports local LLMs (Ollama)             │
│  ✓ Best for: AI-driven flexible scrape      │
│                                             │
│  Input: URL + natural language prompt       │
│  Output: Extracted data as JSON             │
└─────────────────────────────────────────────┘
```

**Implementation**:
```python
# pip install scrapegraphai

from scrapegraphai.graphs import SmartScraperGraph

graph_config = {
    "llm": "ollama/llama3",
    "verbose": True,
    "headless": True,
}

smart_scraper = SmartScraperGraph(
    prompt="Extract all product names and prices",
    source="https://example.com/products",
    config=graph_config,
)

result = smart_scraper.run()
```

---

## Tool Selection Guide

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUICK PICK GUIDE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Fast single-page read                                          │
│    → Jina Reader (zero setup, one HTTP call)                    │
│                                                                 │
│  Multi-page / JS-heavy crawl                                    │
│    → Crawl4AI (async, Playwright, clean MD)                     │
│                                                                 │
│  Typed structured output                                        │
│    → LLM Scraper (TS, function calling)                         │
│                                                                 │
│  Prompt-driven flexible scrape                                  │
│    → ScrapeGraphAI (Python, local LLM OK)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Need | Tool | Why |
|------|------|-----|
| Instant single-page read | **Jina Reader** (`s.jina.ai/URL`) | Zero install — just an HTTP GET. Returns clean markdown. |
| Deep / JS-rendered crawls | **Crawl4AI** | Async, Playwright-backed, outputs LLM-friendly markdown natively. 100% free. |
| Typed structured JSON | **LLM Scraper** (TypeScript) | Uses function calling to convert any page to a validated schema object. |
| Prompt-driven flexible scrape | **ScrapeGraphAI** | Natural language → data, supports Ollama (local LLMs, fully free). |

---

## Output + Future RAG Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    OUTPUT PIPELINE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Scraped Data                                                   │
│    ├── Markdown (Crawl4AI, Jina Reader)                         │
│    ├── JSON (LLM Scraper, ScrapeGraphAI)                       │
│    └── HTML (raw)                                               │
│         │                                                       │
│         ▼                                                       │
│  Chunking                                                       │
│    ├── Markdown → semantic chunks                               │
│    ├── JSON → schema-aware chunks                               │
│    └── HTML → clean text chunks                                 │
│         │                                                       │
│         ▼                                                       │
│  Embedding                                                      │
│    ├── sentence-transformers (local)                            │
│    ├── OpenAI embeddings (API)                                  │
│    └── Ollama embeddings (local)                                │
│         │                                                       │
│         ▼                                                       │
│  Vector Store                                                   │
│    ├── Chroma (local, lightweight)                              │
│    ├── Qdrant (local/cloud, high-performance)                   │
│    ├── Weaviate (cloud, GraphQL)                                │
│    └── Milvus/Zilliz (existing infrastructure)                  │
│         │                                                       │
│         ▼                                                       │
│  RAG Retrieval                                                  │
│    ├── Similarity search                                        │
│    ├── Hybrid search (keyword + semantic)                       │
│    └── Re-ranking                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP TOOL ENDPOINTS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AmanCrawl.scrape                                               │
│    Input: { url: string, formats: string[] }                    │
│    Output: { markdown: string, json: object, html: string }     │
│                                                                 │
│  AmanCrawl.crawl                                                │
│    Input: { url: string, max_pages: number }                    │
│    Output: { pages: Page[], links: string[] }                   │
│                                                                 │
│  AmanCrawl.search                                               │
│    Input: { query: string, num_results: number }                │
│    Output: { results: SearchResult[] }                          │
│                                                                 │
│  AmanCrawl.map                                                  │
│    Input: { url: string }                                       │
│    Output: { links: string[], structure: object }               │
│                                                                 │
│  AmanCrawl.extract                                              │
│    Input: { url: string, schema: JSONSchema }                   │
│    Output: { data: object }                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Core Crawl Tools (Current)
- [x] Basic scrape (BeautifulSoup + httpx)
- [x] Basic crawl (link following)
- [x] Basic map (site structure)
- [x] Basic search (DuckDuckGo)

### Phase 2: CrewAI Integration
- [ ] Install CrewAI
- [ ] Define specialized agents
- [ ] Register crawl tools
- [ ] Create Flow for request routing
- [ ] Wire to API endpoints

### Phase 3: Advanced Tools
- [ ] Crawl4AI integration (JS rendering)
- [ ] Jina Reader integration (fast reads)
- [ ] LLM Scraper integration (typed extraction)
- [ ] ScrapeGraphAI integration (prompt-driven)

### Phase 4: RAG Layer
- [ ] Chunking pipeline
- [ ] Embedding generation
- [ ] Vector store integration
- [ ] Retrieval API

### Phase 5: MCP + SDK
- [ ] MCP tool definitions
- [ ] TypeScript SDK
- [ ] Python SDK
- [ ] CLI tool

---

## Architecture Decision Records

### ADR-001: CrewAI Over LangGraph

**Decision**: Use CrewAI as the orchestration layer.

**Rationale**:
- 5.76× faster than LangGraph
- LangChain-independent (no vendor lock-in)
- Native multi-agent support (Crews)
- Event-driven orchestration (Flows)
- Larger community (53k+ stars)

### ADR-002: Four Tool Strategy

**Decision**: Implement four specialized crawl tools instead of one monolithic solution.

**Rationale**:
- Different use cases need different tools
- Jina Reader for instant reads (zero setup)
- Crawl4AI for deep crawls (JS rendering)
- LLM Scraper for typed extraction (schema validation)
- ScrapeGraphAI for flexible scraping (prompt-driven)

### ADR-003: RAG as Optional Future Layer

**Decision**: Make RAG optional, not required for MVP.

**Rationale**:
- Core crawl/scrape functionality works without RAG
- RAG adds complexity (embedding, vector store)
- Can be added incrementally
- Existing Milvus/Zilliz infrastructure supports it

---

## References

- [CrewAI Documentation](https://docs.crewai.com/)
- [Crawl4AI GitHub](https://github.com/unclecode/crawl4ai)
- [Jina Reader](https://jina.ai/reader/)
- [LLM Scraper](https://github.com/anthropics/llm-scraper)
- [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
- [MCP Specification](https://modelcontextprotocol.io/)

---

## Open-source Perplexity-style search addendum

The search experience is implemented as a self-hostable, free-by-default
pipeline. A query is routed to local SearXNG, then DuckDuckGo HTML, normalized,
and enriched in parallel with safe page metadata and openly licensed imagery.
The existing SSE contract remains the browser boundary so route, progress,
source, image, token, and completion events can render progressively.

### Modular boundaries

| Module | Responsibility |
| --- | --- |
| `backend/search/engine.py` | Free provider orchestration and enrichment |
| `backend/search/metadata.py` | OpenGraph, title, description, favicon extraction |
| `backend/search/image_retrieval.py` | Openverse/Wikimedia image discovery and attribution |
| `backend/search/citations.py` | Stable source IDs and citation index validation |
| `backend/search/cache.py` | Bounded TTL cache replaceable by Redis |
| `backend/query/evidence.py` | Shared source normalization and grounding |

Search and image providers are intentionally credential-free by default. Hosted
or paid providers require explicit environment opt-in. SearXNG can be started
with `docker compose --profile search up -d searxng`; the default backend URL is
`http://searxng:8080`. Openverse and Wikimedia metadata retain landing URLs,
creator, provider, and license data so the UI can display attribution.

For JavaScript-heavy sites, the existing bounded HTTP reader remains the fast
path and Crawl4AI is the optional local worker. The frontend keeps source cards
in the Sources drawer and shows only dedicated result images above an answer.
