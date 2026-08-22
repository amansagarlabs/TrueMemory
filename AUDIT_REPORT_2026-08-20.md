# Kontext Engineering Audit Report

Date: 2026-08-20
Repository: `D:\aman\Kontext`
Scope: Product health, runtime failures, AmanCrawl, provider fallback, authentication, SSRF protection, Docker configuration, and verification.

## Executive Summary

Kontext now has a working local Ollama fallback for OpenRouter failures, corrected AmanCrawl client routes, running SearXNG configuration, protected Next web API routes, and public-network validation for web scraping.

The production build and TypeScript checks pass. Targeted security and route tests pass. The repository still has operational and architectural follow-up work, especially distributed Redis, authenticated cross-user isolation tests, Docker verification on Windows, and migration from Next.js middleware to the newer proxy convention.

## Product Truth

Kontext is organized around two related products:

- AmanAgentLab: memory, artifacts, RAG, documents, agent workflows, MCP, and long-term context.
- AmanCrawl: search, scrape, crawl, map, browser interaction, extraction, and source-grounded web intelligence.

The intended flow is:

`Search -> Crawl -> Extract -> Parse -> Store -> Memory -> Knowledge -> Agent -> Workflow -> Artifact`

The current implementation is strongest in the basic document/chat flow and AmanCrawl direct operations. Distributed production behavior and long-lived memory workflows remain incomplete.

## Confirmed Problems

### 1. OpenRouter credit failure blocked answers

OpenRouter returned HTTP 402 due to insufficient provider credits. The application surfaced a provider error instead of continuing with the configured local model.

Resolution:

- Added Ollama model registration and local aliases.
- Added Ollama streaming completion support.
- Routed explicit local model selections without requiring an OpenRouter key.
- Added OpenRouter-to-Ollama fallback for provider failures.
- Added user-facing error guidance when no provider is available.

Configured local model:

`qwen3-coder:30b`

### 2. AmanCrawl frontend route mismatch

The frontend used incorrect or inconsistent endpoints for scrape, crawl, map, search, and interaction flows. Interaction routes were Next.js routes, but some calls targeted the FastAPI service directly.

Resolution:

- Corrected AmanCrawl backend endpoint paths in `services/amancrawl.ts`.
- Corrected payload names and response normalization.
- Forwarded extraction instructions.
- Routed browser interaction calls through `/api/web/interact/...`.

### 3. SearXNG was not started by default

SearXNG was behind an optional Compose profile while the configured search path expected it to be available.

Resolution:

- SearXNG now starts as a normal Compose service.
- Backend and coding worker can resolve `host.docker.internal` for Ollama access.

### 4. Next web API authentication bypass

The `/api/web/*` routes were absent from both the protected path list and the middleware matcher. They could therefore be called without the normal session gate.

Resolution:

- Added `/api/web` to protected API prefixes.
- Added `/api/web/:path*` to the middleware matcher.
- Added `tests/middleware-auth.test.ts`.

### 5. Web scraping SSRF exposure

The Next browser scraper accepted arbitrary URLs without checking loopback, private, link-local, metadata, credentialed, or nonstandard-port targets.

Resolution:

- Added public URL validation in `lib/web-intel.ts`.
- Applied validation to direct text fetches.
- Applied validation before browser navigation.
- Added Playwright request interception so redirects and browser requests are checked as well.
- Added `tests/web-intel-security.test.ts`.

Blocked examples include:

- `localhost`
- `127.0.0.1`
- `169.254.169.254`
- RFC1918 private networks
- IPv6 loopback and local ranges
- URLs containing credentials
- Nonstandard ports

## Docker Configuration

Current intended local ports:

- Backend: `8000`
- PostgreSQL host port: `5433`
- pgAdmin: `5050`
- SearXNG: `8080`
- Ollama: host service on `11434`

Inside Docker, PostgreSQL remains available as:

`postgres:5432`

The host-facing connection uses:

`localhost:5433`

This avoids the common local PostgreSQL conflict on port `5432`.

Recommended startup:

```powershell
docker compose up -d --build
docker compose ps
```

If port `5432` is required by another local PostgreSQL installation, keep `POSTGRES_PORT=5433` in `.env`.

## Verification Evidence

Passed:

- `npx tsc --noEmit`
- `npm run build`
- `python -m compileall -q backend/app backend/services backend/agents`
- Targeted middleware authentication tests
- Targeted URL security tests
- AmanCrawl route/cache tests
- Local Ollama fallback smoke test
- Scrape smoke test against `example.com`
- Map smoke test against `example.com`
- SearXNG search smoke test

Lint status:

- No lint errors.
- Existing warnings remain in unrelated UI files, including unused imports, image optimization warnings, and one hook dependency warning.

## Security Action Required

The local `.env` contains live-looking provider, database, OAuth, image-generation, vector database, and JWT credentials. They are intentionally not reproduced in this report.

Rotate the following credentials immediately if they are real or have been used:

- OpenRouter API key
- Milvus/Zilliz token
- GitHub OAuth client secret
- FAL key
- JWT/session secret
- Database password

After rotation:

1. Update the local `.env` values.
2. Confirm `.env` is ignored by Git.
3. Remove any exposed values from shell history, tickets, screenshots, or shared logs.
4. Use deployment secret storage for production values.

## Remaining Critical Issues

### Distributed state

Redis is not configured. Cache and agent queues fall back to process-local memory, which is unsafe for multiple frontend instances or worker replicas.

### Tenant isolation

Authenticated cross-user tests still need to be executed against PostgreSQL for conversations, artifacts, memories, workspaces, and coding tasks.

### Browser resource policy

The current request interceptor blocks HTTP(S) requests that fail public URL validation. Browser features may still need an explicit allowlist for third-party resources if some legitimate sites fail due to DNS, CDN, or redirect behavior.

### Next.js convention migration

Next.js 16 reports that the `middleware` file convention is deprecated in favor of `proxy`. This is currently a warning, not a build failure.

### Docker verification

Docker status verification from this environment was blocked by Windows Docker engine pipe permissions. Run `docker compose ps` from an elevated shell if Docker reports access denied.

## Recommended Next Steps

1. Add PostgreSQL-backed two-user authorization tests.
2. Configure Redis and move agent/cache state out of process memory.
3. Migrate `middleware.ts` to the Next.js 16 proxy convention.
4. Rebuild the backend image after environment or Python changes.
5. Rotate all credentials currently present in `.env`.

