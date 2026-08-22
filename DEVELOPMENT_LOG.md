# Kontext — Development Log

> **Last updated:** June 17, 2026
> **Repo:** [amanpdfagent](https://github.com/amansagar070707-crypto/amanpdfagent) → `development-features` branch

---

## Goal

Build and polish the **Kontext** — a two-product AI platform:

| Product | Purpose |
|---------|---------|
| **AmanAgentLab** | Personal AI OS — memory, RAG, chat |
| **AmanCrawl** | Web intelligence — scrape, crawl, map, search, AI extraction |

Current focus: production-ready usage tracking, cross-platform dashboard, anti-bot scraping, AI-powered data extraction, and system status monitoring.

---

## Constraints & Preferences

- **Products:** AmanAgentLab (personal AI OS) + AmanCrawl(web intelligence)
- **Platform branding:** "Kontext" with Zap icon
- **CrewAI** chosen over LangGraph (5.76× faster, LangChain-free, 53k stars)
- **Four crawl tools:** Jina Reader, Crawl4AI, LLM Scraper, ScrapeGraphAI
- **Auth system** shared across both products with scope-based access control
- **Plan tiers:** free, pro, team, enterprise — each with different scope grants
- **LLM provider:** OpenRouter (not direct OpenAI) — `OPENROUTER_API_KEY` in `.env`
- **Docker** for backend services (`docker compose down; docker compose up --build`)
- **Next.js** frontend, **FastAPI** backend, Python venv at `backend/.venv`
- **PowerShell:** use `;` not `&&` as command separator

---

## Date-wise Updates

### June 17, 2026

#### ✅ AI Scraping Agent (NEW)
Built an LLM-powered intelligent data extraction agent:

| Layer | File | What |
|-------|------|------|
| Service | `backend/services/agent_service.py` | `scrape_and_extract()` — scrapes URL via Jina, sends to LLM, returns structured data. `batch_extract()` for multiple URLs. |
| API | `backend/app/routes/AmanCrawl.py` | `POST /api/AmanCrawl/agent/extract` — single URL. `POST /api/AmanCrawl/agent/batch` — multi-URL batch (max 20). |
| Frontend | `services/AmanCrawl.ts` | `agentExtract()` API client with `AgentExtractResult` type |
| UI | `app/AmanCrawl/page.tsx` | New **Agent** tab (Sparkles icon) with instruction field |

**Flow:** URL + instruction → Jina scrape → LLM (GPT-4o-mini via OpenRouter) → structured result (JSON/markdown/text) + raw content + token count.

**Commit:** `8370519` — `feat: AI scraping agent — LLM-powered data extraction with /agent/extract endpoint and Agent tab`

#### ✅ Medium 403 Fix — Root Cause Found
**Bug:** Jina Reader returns content in `data.content`, not `data.markdown`. Our code was reading the wrong field → returned `None` → fell through to httpx → 403.

**Fix in `crawl_service.py`:**
```python
# Before (broken)
markdown = content.get("markdown", "")

# After (fixed)
markdown = content.get("content", "") or content.get("markdown", "")
```

Applied to both `_jina_scrape()` and `_jina_map_links()`.

**Result:** Medium article now returns **25,128 chars** of clean markdown content.

**Commit:** `4d429fc` — `fix: Jina Reader returns content in data.content not data.markdown — fixes Medium 403`

---

### June 16, 2026

#### ✅ Anti-bot Scraping Fixes
- **Search 403 fix:** Browser-like User-Agent rotation, retry logic (POST→GET), Jina Search fallback (`s.jina.ai`)
- **Scrape anti-bot fix:** Jina Reader (`r.jina.ai`) as primary scraper, httpx with browser headers as fallback
- **Map/crawl anti-bot fix:** Both use `_browser_headers()`, Jina Reader for initial page fetch, `_should_skip_url()` and `_should_skip_page()` filter boilerplate
- **Crawl/map content filtering:** `SKIP_PATTERNS` (Medium nav, auth, static files), `SKIP_TITLE_PATTERNS`, 200-char minimum content threshold

#### ✅ System Status Page
- **Frontend:** `app/status/page.tsx` — auto-refreshes 30s, per-service status (Backend API, Database, AmanCrawl, AI Integration), latency display, 90-day uptime bar, incident history
- **Backend:** `/api/status` endpoint — checks Postgres, OpenRouter config, returns per-service status + latency

#### ✅ Dashboard Overhaul
- Crawl jobs now query Postgres `usage_aggregates` (not SQLite)
- Platform toggle actually filters data ("AgentLab" → lab only, "AmanCrawl" → crawl only, "Both" → everything)
- 30s auto-refresh polling
- Error surfacing (amber warning bar)
- Manual refresh button with timestamp
- Backend receives `?platform=lab|crawl|both` and skips irrelevant queries

#### ✅ Friendly Error Messages
`friendlyError()` converts raw errors (403, 404, 429, 500, timeout, fetch failed) to user-friendly text.

#### ✅ UX Improvements
- **URL auto-detect:** Pasting URL in Search tab auto-switches to Scrape
- **Stop button:** Red square (■) replaces orange arrow during loading, uses `AbortController` to cancel fetch
- **Copy Result button:** Top-right of results panel copies JSON to clipboard
- **CTA link fixes:** "Explore AmanAgentLab" → `/chat`, "Explore AmanCrawl" → `/AmanCrawl`

#### ✅ AI Synthesis Flow
After scrape/crawl/search/map, if instruction provided, raw results → LLM → answer + raw data.

---

### June 15, 2026

#### ✅ Subscription System
- Full schema (6 tables): `subscriptions`, `plans`, `usage_records`, `usage_aggregates`, `invoices`, `webhook_events`
- Plan CRUD, subscription lifecycle, usage recording, rate limiting
- 7 API endpoints
- Plan tiers: free (10 scrapes/day, 5 maps/day, 10 searches/day, 0 crawls/month, 50K tokens/month), pro ($9.99/mo or $99/yr), team ($29.99/mo or $299/yr)

#### ✅ Rate Limiting
- All endpoints check limits via `check_rate_limit()`
- Structured 429 responses with `error`, `resource`, `plan`, `limit`, `used`, `remaining`, `message`
- Daily/monthly period detection fixed: `check_rate_limit()` and `get_usage_summary()` compute correct `period_start` based on `limit_period` (day → today midnight, month → 1st)

#### ✅ `get_user_subscription()` Fallback
Falls back to `users.plan` column when no subscription row exists — fixes "0 crawls on Team plan" for direct-plan-assigned users.

#### ✅ Test Users Seeded
All 3 test users have subscriptions: user1=team, user2=pro, user3=free (both `users.plan` and `subscriptions` table in sync).

#### ✅ Cross-user Integration Test
`backend/test_cross_user.py`: **63/63 core tests passed** for free/pro/team plans.

#### ✅ LimitReachedModal Component
Professional modal with usage breakdown, progress bars, reset timers, upgrade CTA, plan badge, loading/error states.

#### ✅ UsageCounter Component
3 modes (compact, horizontal, vertical), threshold warnings (80%+ orange, 100% red), reset timers, auto-refresh via `refreshTrigger` prop.

#### ✅ SubscriptionModal Component
Monthly/yearly toggle, 17% discount, API-driven plans.

#### ✅ Auth Responses Include Plan
`/login`, `/me`, `/signup` all return `plan` field.

---

## In Progress

| Item | Status | Notes |
|------|--------|-------|
| Free plan expiry → subscription modal | Schema ready | Trigger logic pending |
| Stripe/Razorpay integration | Not started | Wire for real payment processing |
| CrewAI agents end-to-end | Not started | Test with OpenRouter |
| Status page link from landing | Not started | Add footer link |

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| `get_user_subscription()` falls back to `users.plan` | Subscription row may not exist for directly-assigned plans |
| Jina Reader as primary scraper | Handles JS rendering and anti-bot better than raw httpx |
| `_should_skip_url()` / `_should_skip_page()` | Crawl/map filters boilerplate to avoid wasting pages on navigation/auth/static content |
| Structured 429 errors | Frontend receives `LimitReachedError` with full usage data for the modal |
| `AbortController` for stop button | Frontend cancels fetch immediately on user click |
| 30s dashboard polling | Balance between real-time and server load |
| Platform toggle filters API calls | Backend receives `?platform=lab\|crawl\|both` and skips irrelevant queries |
| `data.content` not `data.markdown` for Jina | Jina Reader API returns scraped content in `content` field |
| Agent tab uses GPT-4o-mini | Fast, cheap, good enough for structured extraction |

---

## Critical Context

| Item | Value |
|------|-------|
| Backend URL | `localhost:8000` |
| Frontend URL | `localhost:3000` |
| Database | `app-agent` (not `amanplatform`) |
| Test user passwords | `12345678` for all three |
| Auth flow | `middleware.ts` (server) → `x-auth-context` header → FastAPI `require_scope()` |
| user1@gmail.com | team plan |
| user2@gmail.com | pro plan |
| user3@gmail.com | free plan |
| Docker DNS | `dns: 8.8.8.8` for external URL resolution |
| LLM calls | OpenRouter via httpx (refine prompt + synthesis) |
| Jina API key | `JINA_API_KEY` env var |
| Crawl limit period | `crawl` = monthly; `scrape/map/search` = daily |
| Documents table | Missing — dashboard artifacts query errors (AgentLab issue, not critical) |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                 │
│  Landing │ Chat │ AmanCrawl│ Dashboard │ Status     │
└──────────┬──────────────────────────────────────────┘
           │ x-auth-context header
┌──────────▼──────────────────────────────────────────┐
│               MIDDLEWARE (middleware.ts)              │
│  Auth check → scope extraction → forward to backend  │
└──────────┬──────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│                BACKEND (FastAPI :8000)                │
│  Auth │ Subscriptions │ Dashboard │ AmanCrawl│ Health│
└──────────┬──────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│              SERVICES (Python)                       │
│  crawl_service │ subscription_service │ agent_service│
│  Jina Reader   │ rate limiting         │ LLM extract │
│  httpx fallback│ usage recording       │ batch mode  │
└──────────┬──────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│            EXTERNAL APIS                             │
│  OpenRouter (LLM) │ Jina Reader (scrape) │ Postgres  │
└─────────────────────────────────────────────────────┘
```

---

## Relevant Files

### Frontend
| File | Purpose |
|------|---------|
| `app/page.tsx` | Landing page |
| `app/AmanCrawl/page.tsx` | AmanCrawl— URL input, auto-detect, stop button, Agent tab, LimitReachedModal, UsageCounter |
| `app/dashboard/page.tsx` | Dashboard — platform toggle, auto-refresh 30s, error surfacing, UsageCounter |
| `app/status/page.tsx` | System status — auto-refresh, per-service status, uptime bar |
| `components/SubscriptionModal.tsx` | Pricing modal — monthly/yearly toggle |
| `components/LimitReachedModal.tsx` | Limit modal — usage breakdown per resource |
| `components/UsageCounter.tsx` | Quota counter — 3 modes, threshold warnings, reset timers |
| `services/AmanCrawl.ts` | API client — `LimitReachedError`, `throwIfLimitError()`, signal param, `agentExtract()` |
| `services/dashboard.ts` | Dashboard API — `fetchDashboardStats(platform)`, `CrawlUsage` type |
| `services/subscriptions.ts` | `fetchUsageSummary()`, `fetchResourceLimit()` |

### Backend
| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI entry — includes all routers |
| `backend/app/routes/health.py` | Health + `/api/status` endpoint |
| `backend/app/routes/AmanCrawl.py` | Scrape/crawl/map/search/agent — structured 429, rate limiting, usage recording, synthesis |
| `backend/app/routes/dashboard.py` | Dashboard stats — `_get_crawl_usage()` queries Postgres, platform filter |
| `backend/app/routes/subscriptions.py` | Subscription endpoints |
| `backend/services/crawl_service.py` | `scrape_url()` (Jina→httpx), `search_web()` (DDG→Jina fallback), `map_site()`, `crawl_site()`, `_browser_headers()`, `_should_skip_url()`, `_should_skip_page()` |
| `backend/services/subscription_service.py` | `get_user_subscription()` (falls back to `users.plan`), `check_rate_limit()`, `get_usage_summary()` |
| `backend/services/agent_service.py` | `scrape_and_extract()`, `batch_extract()` — LLM-powered extraction |
| `backend/test_cross_user.py` | Cross-user integration tests (63/63 passed) |

### Config
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Backend with `dns: 8.8.8.8` |
| `backend/.venv/` | Python virtual environment |

---

## Next Steps

1. ~~Fix Medium 403 scraping~~ → **Done** (Jina `data.content` fix)
2. ~~AI Agent extraction feature~~ → **Done** (Agent tab + endpoint)
3. Rebuild Docker to pick up backend changes
4. Add free plan expiry logic (after N days, show modal)
5. Wire Stripe/Razorpay for real payment processing
6. Test CrewAI agents end-to-end with OpenRouter
7. Link status page from landing page footer

---

*Generated from development log — Kontext*
