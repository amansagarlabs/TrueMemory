# Kontext

This document tracks the local direction for the `AmanSagar0607/Kontext` repo.
When this checkout drifts, prefer the remote GitHub repo as source of truth.

## Source of Truth

The canonical documents live under `docs/`:

- [docs/README.md](docs/README.md)
- [docs/research/MEMORY_RESEARCH.md](docs/research/MEMORY_RESEARCH.md)
- [docs/vision/VISION.md](docs/vision/VISION.md)
- [docs/strategy/PLATFORM_STRATEGY.md](docs/strategy/PLATFORM_STRATEGY.md)
- [docs/architecture/MEMORY_ARCHITECTURE.md](docs/architecture/MEMORY_ARCHITECTURE.md)
- [docs/benchmarks/BENCHMARK_PLAN.md](docs/benchmarks/BENCHMARK_PLAN.md)

## Mission

Build open-source platform for AI Memory, Agents, and Web Intelligence.

The long-term goal is to create a Personal AI Operating System powered by persistent memory, agent workflows, and web intelligence infrastructure.

---

## Company Vision

Most AI products solve only one part of the problem.

Some products help collect information.

Some products help retrieve information.

Some products help automate tasks.

Some products help chat with AI.

Very few products combine:

- Memory
- Knowledge
- Context
- Agents
- Web Intelligence
- Automation

into a single ecosystem.

Kontext exists to unify these capabilities.

---

## Platform Architecture

Kontext consists of two products.

### AmanAgentLab

Personal AI Operating System

**Purpose**

Remember everything.  
Understand context.  
Help users get work done.

**Core Capabilities**

- Memory
- Artifacts
- RAG
- Knowledge Workspace
- Agent Workflows
- MCP Integration
- CLI Interface
- Document Intelligence
- Context Retrieval
- Long-Term Memory

**Target Users**

- Developers
- Researchers
- Founders
- Knowledge Workers
- Teams

**Positioning**

> My AI remembers everything I've worked on and helps me get work done.

### AmanCrawl

Web Intelligence Infrastructure

**Purpose**

Turn websites into AI-ready data.

**Core Capabilities**

- Search
- Crawl
- Scrape
- Browser Automation
- Website Monitoring
- Structured Extraction
- Document Parsing
- PDF Processing
- API
- CLI
- SDK
- MCP Integration

**Target Users**

- AI Developers
- Agent Builders
- RAG Applications
- Startups
- Enterprise AI Teams

**Positioning**

> The web intelligence layer for AI agents.

---

## Orchestration Layer — CrewAI

AmanPlatform uses **CrewAI** as the multi-agent orchestration layer.

### Why CrewAI?

- **5.76× faster** than LangGraph
- **LangChain-free** — no vendor lock-in
- **Crews** — autonomous multi-agent collaboration
- **Flows** — event-driven, precise orchestration
- **53k+ GitHub stars** — large, active community

### Agent Architecture

```
API/MCP Trigger
    │
    ▼
CrewAI Orchestration
    │
    ├── Crawl Agent (Crawl4AI)
    │   └── Deep crawls, JS rendering, async
    │
    ├── Scrape Agent (LLM Scraper)
    │   └── Typed structured extraction
    │
    ├── Read Agent (Jina Reader)
    │   └── Instant single-page reads
    │
    └── Graph Agent (ScrapeGraphAI)
        └── Prompt-driven flexible scraping
```

### Tool Selection

| Need | Tool | Why |
|------|------|-----|
| Fast single-page read | Jina Reader | Zero setup, one HTTP call |
| Multi-page / JS-heavy crawl | Crawl4AI | Async, Playwright, clean markdown |
| Typed structured output | LLM Scraper | Function calling, typed schemas |
| Prompt-driven flexible scrape | ScrapeGraphAI | Natural language → data, local LLM OK |

See `ARCHITECTURE.md` for the full technical reference.

---

## Relationship Between Products

AmanCrawlpowers AmanAgentLab.

### Flow

Search  
↓  
Crawl  
↓  
Extract  
↓  
Parse  
↓  
Store  
↓  
Memory  
↓  
Knowledge  
↓  
Agent  
↓  
Workflow  
↓  
Artifact

AmanAgentLab consumes intelligence produced by AmanCrawl.

AmanCrawlcan also be used independently by developers.

---

## Product Strategy

The platform should support both:

- Standalone usage
- Integrated usage

### Examples

- Developer only needs crawling → use `AmanCrawl`
- Developer needs memory and agents → use `AmanAgentLab`
- Developer wants the complete platform → use both

---

## Long-Term Product Evolution

### Phase 1 — Personal Memory Workspace

- Memory
- Artifacts
- RAG
- Chat
- Authentication
- Search

### Phase 2 — Knowledge System

- Cross-Artifact Retrieval
- Memory Ranking
- Workspace Intelligence
- Knowledge Graph Foundation

### Phase 3 — Agent Workspace

- Research Agents
- Documentation Agents
- Coding Agents
- Security Agents
- Workflow Agents

### Phase 4 — Web Intelligence Platform

- AmanCrawlAPI
- AmanCrawlCLI
- AmanCrawlMCP
- Website Monitoring
- Browser Automation
- Deep Research

### Phase 5 — AI Workforce

- Background Agents
- Scheduled Tasks
- Multi-Step Workflows
- Delegation
- Task Queues

### Phase 6 — Personal AI Operating System

- Persistent Memory
- Context Awareness
- Tool Usage
- Autonomous Workflows
- Human Approval Gates
- Continuous Learning

---

## Domain Strategy

### Primary Domain

- Platform Website → `amansagar.in`
- Documentation → `docs.amansagar.in`
- Personal AI OS → `agentlab.amansagar.in`
- Web Intelligence Platform → `crawl.amansagar.in`
- API → `api.amansagar.in`
- MCP Registry → `mcp.amansagar.in`
- Documentation Portal → `developers.amansagar.in`
- CLI Documentation → `cli.amansagar.in`
- Agent Marketplace → `agents.amansagar.in`
- Future SaaS Dashboard → `app.amansagar.in`

---

## Open Source Strategy

- Open-source core
- Developer first
- Community driven
- Self-hostable
- Extensible
- MCP native
- Agent native
- API first
- CLI first

The platform should be useful before it is flashy.

Reliability should be prioritized over autonomy.

Trust should be prioritized over automation.

Memory should be prioritized over chat.

Context should be prioritized over prompts.

---

## Suggested Repository Direction

This is the ideal long-term structure:

```text
/
├── apps/
│   ├── agentlab/
│   └── crawl/
│
├── packages/
│   ├── memory/
│   ├── rag/
│   ├── agents/
│   ├── mcp/
│   ├── crawler/
│   ├── browser/
│   ├── knowledge/
│   ├── auth/
│   └── security/
│
├── docs/
│   ├── vision/
│   ├── product/
│   ├── architecture/
│   ├── agents/
│   ├── crawl/
│   ├── memory/
│   ├── rag-security/
│   ├── mcp/
│   └── roadmap/
│
├── VISION.md
├── PRD.md
├── ROADMAP.md
├── RAG_SECURITY.md
├── AGENT_STRATEGY.md
├── MCP_STRATEGY.md
└── BUSINESS_MODEL.md
```

This gives one company, one platform, two products, and a clear path from today's RAG application to a future AI Operating System.

---

## North Star

Kontext becomes the infrastructure layer that helps users:

- Remember everything
- Understand context
- Retrieve knowledge instantly
- Build intelligent agents
- Collect information from the web
- Automate useful work

The end goal is not another chatbot.

The end goal is a trusted Personal AI Operating System powered by memory, agents, and web intelligence.

Success is when users say:

> My AI already knows what I'm working on and helps me get the work done.
