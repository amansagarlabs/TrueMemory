# AmanCrawlScraping Architecture

> **Date:** June 17, 2026
> **Status:** MVP Implemented
> **Branch:** `development-features`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER REQUEST                                 │
│  Search │ Scrape │ Agent │ Map │ Crawl                              │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AUTH + RATE LIMITING                             │
│  require_scope() → check_rate_limit() → record_usage()              │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                   │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│   │ Search Router │  │ Crawl Router │  │ Agent Router  │           │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│          │                  │                  │                    │
│          ▼                  ▼                  ▼                    │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│   │ Multi-Provider│  │ Fallback Chain│  │ LLM Extract  │           │
│   │   Fallback   │  │   Escalation  │  │   Pipeline   │           │
│   └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Search Architecture

### Provider Chain (never depend on single source)

```
User Query
    │
    ▼
┌─────────────┐
│   Tavily    │ ← AI-optimized, best quality
│  (API key)  │
└──────┬──────┘
       │ failed
       ▼
┌─────────────┐
│   Brave     │ ← General search, fast
│  (API key)  │
└──────┬──────┘
       │ failed
       ▼
┌─────────────┐
│  SearXNG    │ ← Self-hosted meta search
│  (optional) │
└──────┬──────┘
       │ failed
       ▼
┌─────────────┐
│ DuckDuckGo  │ ← Free, often blocked
│  (HTML)     │
└──────┬──────┘
       │ failed
       ▼
┌─────────────┐
│ Google/Jina │ ← Scrape Google via Jina Reader
│  (free)     │
└──────┬──────┘
       │ success
       ▼
┌─────────────┐
│   Results   │ → {provider, latency_ms, attempted[]}
└─────────────┘
```

### Response Format

```json
{
  "query": "AI frameworks 2026",
  "results": [...],
  "provider": "tavily",
  "latency_ms": 180,
  "attempted": [
    {"provider": "duckduckgo", "error": "CAPTCHA", "latency_ms": 1200},
    {"provider": "searxng", "error": "Connection refused", "latency_ms": 500}
  ]
}
```

### Provider Details

| Provider | API Key | Rate Limit | Quality | Speed |
|----------|---------|------------|---------|-------|
| Tavily | `TAVILY_API_KEY` | 1000/mo free | High | Fast |
| Brave | `BRAVE_API_KEY` | 2000/mo free | High | Fast |
| SearXNG | Self-hosted | Unlimited | Medium | Medium |
| DuckDuckGo | None | Often blocked | Medium | Fast |
| Google/Jina | None | Unlimited | High | Slow |

---

## 2. Scrape Architecture

### Fallback Chain (automatic escalation)

```
URL Request
    │
    ▼
┌─────────────────┐
│    Crawl4AI     │ ← Best for JS-rendered, anti-bot
│  (headless)     │
└──────┬──────────┘
       │ failed
       ▼
┌─────────────────┐
│   Playwright    │ ← Browser automation
│  (chromium)     │
└──────┬──────────┘
       │ failed
       ▼
┌─────────────────┐
│   Jina Reader   │ ← API-based, handles anti-bot
│  (r.jina.ai)    │
└──────┬──────────┘
       │ failed
       ▼
┌─────────────────┐
│     httpx       │ ← Last resort, plain HTTP
│  (browser UA)   │
└──────┬──────────┘
       │ success
       ▼
┌─────────────────┐
│     Result      │ → {provider, content_length, markdown}
└─────────────────┘
```

### Response Format

```json
{
  "url": "https://example.com",
  "status_code": 200,
  "title": "Example Domain",
  "content_length": 185,
  "markdown": "# Example Domain\n\n...",
  "provider": "jina"
}
```

### Provider Details

| Provider | Best For | Anti-Bot | JS Rendering | Speed |
|----------|----------|----------|--------------|-------|
| Crawl4AI | RAG pipelines | Yes | Yes | Medium |
| Playwright | Complex sites | Yes | Yes | Slow |
| Jina Reader | Quick scrape | Yes | Partial | Fast |
| httpx | Simple pages | No | No | Fastest |

---

## 3. Crawl Architecture

### Multi-Page Crawl

```
Start URL
    │
    ▼
┌─────────────────┐
│ URL Validation  │ → Check format, normalize
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Robots Check    │ → Respect robots.txt
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Crawler Router  │ → Crawl4AI / httpx / Jina
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Link Discovery  │ → Extract internal links
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Content Filter  │ → Skip boilerplate (nav, auth, static)
│ _should_skip_*  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Queue Manager   │ → BFS traversal, max_pages limit
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Result Collector│ → [{url, title, content_length, text}]
└─────────────────┘
```

### Filtering Rules

```python
SKIP_PATTERNS = [
    "Sign in", "Log in", "Sign up", "Register",
    "Cookie", "Privacy", "Terms of Service",
    "Subscribe", "Newsletter", "Comments",
    ".js", ".css", ".png", ".jpg", ".gif",
    "javascript:", "mailto:", "tel:",
]

SKIP_TITLE_PATTERNS = [
    "Page Not Found", "404", "Access Denied",
    "Login", "Sign In", "Register",
]
```

---

## 4. Agent Architecture

### LLM Extraction Pipeline

```
URL + Instruction
    │
    ▼
┌─────────────────┐
│   Scrape URL    │ → Use scrape fallback chain
└──────┬──────────┘
       │ raw content (80k chars max)
       ▼
┌─────────────────┐
│  Build Prompt   │ → System: extraction rules
│                 │ → User: content + instruction
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   LLM Call      │ → OpenRouter (GPT-4o-mini)
│  (temperature   │
│   = 0.1)        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Parse Result   │ → Try JSON parse, fallback to text
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│    Response     │ → {result, raw_content, tokens_used}
└─────────────────┘
```

### Batch Processing

```
URLs[]
    │
    ▼ (sequential, max 20)
┌─────────────────┐
│ For each URL:   │
│  1. Scrape      │
│  2. Extract     │
│  3. Collect     │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Batch Result    │ → {results[], successful, failed, total_tokens}
└─────────────────┘
```

---

## 5. Map Architecture

### Site Structure Discovery

```
Start URL
    │
    ▼
┌─────────────────┐
│ Jina Reader     │ → Extract all links from page
│  (r.jina.ai)    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Link Filter     │ → Same domain only
│                 │ → Skip boilerplate URLs
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Group by Path   │ → /docs/*, /api/*, /blog/*
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Structure Tree  │ → Nested JSON
└─────────────────┘
```

---

## 6. Browser Fallback Layer

### Escalation Chain

```
Normal HTTP Request
       │
       ▼ (403/429/503)
┌─────────────────┐
│   Playwright    │ → Headless Chromium
│  (wait: 5s)     │
└──────┬──────────┘
       │ blocked
       ▼
┌─────────────────┐
│   Camoufox      │ → Anti-fingerprint browser
│  (future)       │
└──────┬──────────┘
       │ blocked
       ▼
┌─────────────────┐
│  Browser-Use    │ → AI agent controls browser
│  (future)       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Return Error    │ → With provider + reason
└─────────────────┘
```

---

## 7. Security Layer

### Request Validation Pipeline

```
User Request
       │
       ▼
┌─────────────────┐
│  Auth Check     │ → require_auth()
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Scope Check    │ → require_scope("crawl:scrape")
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Rate Limit     │ → check_rate_limit()
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  URL Validation │ → Valid format, not internal
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Record Usage   │ → record_usage()
└─────────────────┘
```

### Scope Hierarchy

```
free
├── crawl:search
├── crawl:scrape
└── crawl:map

pro ($9.99/mo)
├── crawl:search
├── crawl:scrape
├── crawl:map
├── crawl:crawl
├── crawl:extract
└── crawl:pdf

team ($29.99/mo)
└── ALL SCOPES

enterprise
└── ALL SCOPES + custom
```

---

## 8. Rate Limits

| Resource | Free | Pro | Team | Period |
|----------|------|-----|------|--------|
| crawl:scrape | 10 | 1,000 | Unlimited | Daily |
| crawl:map | 5 | 500 | Unlimited | Daily |
| crawl:search | 10 | 1,000 | Unlimited | Daily |
| crawl:crawl | 0 | 200 | Unlimited | Monthly |
| crawl:extract | 0 | 500 | Unlimited | Daily |

---

## 9. Environment Variables

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-...
DATABASE_URL=postgresql://...

# Search Providers (optional, enables fallback)
TAVILY_API_KEY=tvly-...
BRAVE_API_KEY=...
SEARXNG_URL=https://search.example.com

# Scraping (optional)
JINA_API_KEY=...  # Improves Jina success rate

# Crawl4AI (optional, needs playwright install)
# crawl4ai>=0.8.9 in requirements.txt
# playwright>=1.40.0 in requirements.txt
# playwright install (run once)
```

---

## 10. File Structure

```
backend/
├── services/
│   ├── search_router.py        # Multi-provider search fallback
│   ├── crawl4ai_service.py     # Crawl4AI + Playwright + Jina + httpx
│   ├── crawl_service.py        # Main crawl service (uses above)
│   ├── agent_service.py        # LLM extraction agent
│   └── subscription_service.py # Rate limiting + usage
├── app/routes/
│   └── AmanCrawl.py            # API endpoints
└── requirements.txt            # crawl4ai, playwright, beautifulsoup4
```

---

## 11. UI Provider Status

The frontend now shows which provider succeeded:

```
┌─────────────────────────────────────────┐
│  Search Results                         │
│                                         │
│  1. Best AI Frameworks 2026             │
│     https://example.com/ai-frameworks   │
│                                         │
│  2. Top 10 AI Tools                     │
│     https://example.com/ai-tools        │
│                                         │
├─────────────────────────────────────────┤
│  ● Done via tavily 180ms                │
│                                          │
│  [Copy JSON]                             │
└─────────────────────────────────────────┘
```

When providers fail, the `attempted[]` array shows what was tried:

```
Provider: tavily
Status:   Success
Latency:  180ms

Attempted:
  ✗ duckduckgo — CAPTCHA (1200ms)
  ✗ searxng — Connection refused (500ms)
  ✓ tavily — Success (180ms)
```

---

## 12. Future Roadmap

### Phase 1 (Current — MVP)
- ✅ Multi-provider search router
- ✅ Crawl4AI + Playwright + Jina + httpx fallback
- ✅ Provider status in UI
- ✅ Agent extraction with LLM

### Phase 2 (Next)
- [ ] Camoufox anti-fingerprint browser
- [ ] Browser-Use AI agent for complex sites
- [ ] Scrapy for large-scale crawling
- [ ] Katana for URL discovery
- [ ] Robots.txt respect

### Phase 3 (Future)
- [ ] SearXNG self-hosted instance
- [ ] Custom search connectors (Enterprise)
- [ ] Private indexes (Enterprise)
- [ ] Monitoring + alerting
- [ ] Batch crawl with queue management

---

*Generated: June 17, 2026 — Kontext*
