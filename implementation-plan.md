# Open-Source Search Implementation Plan

## Phase 1 — contracts and free defaults

- Add typed `SearchResult`, `PageMetadata`, `ImageCandidate`, and citation records.
- Make SearXNG local + DuckDuckGo the default provider order.
- Keep remote/paid providers behind explicit opt-in environment flags.
- Preserve the existing `/api/v1/query/stream` SSE envelope.

## Phase 2 — result enrichment

- Fetch OpenGraph metadata concurrently for the top results.
- Search Openverse and Wikimedia Commons only when a result has no useful image.
- Normalize image URL, landing URL, creator, provider, license, and attribution.
- Emit `source.discovered` as soon as each result is normalized.

## Phase 3 — extraction and grounding

- Use the existing bounded scraper for simple pages.
- Add Crawl4AI as an optional Docker worker for JS-heavy pages and bounded crawl jobs.
- Add source snippets/quotes to the answer context with explicit source IDs.
- Validate cited IDs and remove unsupported citations before persistence.

## Phase 4 — UI

- Render streaming route/progress events in the existing activity timeline.
- Render only dedicated source images above the answer.
- Keep links and full metadata in the Sources drawer and inline citation hover card.
- Add a responsive image gallery, keyboard focus states, lazy loading, and reduced-motion behavior.

## Phase 5 — performance and operations

- Replace process-local cache with Redis when running multiple workers.
- Add request deduplication keyed by user/workspace/query/options.
- Add latency, provider success, image hit-rate, citation coverage, and grounding metrics.
- Add retry budgets and cancellation tests.

## Acceptance criteria

- A clean Docker install can search without a paid provider key.
- Search results stream before answer tokens.
- At least one stable source ID maps to every rendered citation.
- Image enrichment never blocks the answer longer than its bounded timeout.
- Openverse/Wikimedia attribution is retained in API and UI data.
- Web search can be disabled without changing direct/document chat behavior.
