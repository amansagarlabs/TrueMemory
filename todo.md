# Kontext Search TODO

## Now

- [x] Document the free/open-source architecture and provider policy.
- [x] Keep inline `[domain index]` citations clickable.
- [x] Show dedicated source images only; keep link cards in Sources.
- [x] Add the modular free search/image enrichment adapter.
- [x] Add Docker SearXNG profile and local settings.
- [x] Add unit tests for provider normalization, metadata extraction, image fallback, and citations.

## Next

- [ ] Add Crawl4AI worker profile with cancellation and robots checks.
- [ ] Add Redis cache/deduplication for multi-worker deployments.
- [ ] Add OpenAlex adapter for scholarly queries.
- [ ] Add image attribution/license display and opt-out controls.
- [ ] Add visual regression checks at desktop, tablet, mobile, and 200% zoom.
- [ ] Add citation coverage/grounding and image-hit-rate metrics to benchmark UI.

## Guardrails

- [x] No paid provider is enabled by default.
- [ ] Never render a remote image without validating its URL and retaining its landing URL.
- [ ] Do not expose model chain-of-thought; expose bounded route/progress events only.
- [ ] Keep source content untrusted and prevent webpage instructions from changing the plan.
