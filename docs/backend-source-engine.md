# Backend Source Engine

## Modules

```text
backend/source_intelligence/
  models.py          typed enums and score records
  normalization.py   canonical URLs, hashes, duplicate keys
  verification.py    deterministic source classification
  scoring.py         trust, support, freshness, influence
  aggregation.py     corroboration and conflict groups
```

## Processing

`normalize_source` remains the compatibility boundary. It delegates to Source
Intelligence and returns the existing fields plus:

```json
{
  "canonical_url": "https://example.org/docs",
  "favicon_url": "https://example.org/favicon.ico",
  "verification": {"status": "verified", "type": "official_docs"},
  "trust_score": 91,
  "trust_components": {"authority": 27, "ownership": 20},
  "confidence_score": 0.84,
  "confidence_label": "high",
  "evidence_role": "primary",
  "reason_used": "Canonical documentation directly supports the claim.",
  "freshness": {"label": "Updated 2 days ago", "status": "fresh"},
  "cross_verification": {"independent_sources": 4},
  "content_hash": "sha256:...",
  "score_version": "source-intelligence-v1"
}
```

## Explainability

Every score function returns both total and components. Every classifier returns
signals. Logs record score version and input availability, but never raw secrets
or hidden model reasoning.

## Caching

- canonical source identity: long TTL;
- ownership verification: 30 days, with revocation support;
- page metadata: 15 minutes to 24 hours by freshness class;
- content snapshot: content-hash keyed;
- claim/evidence alignment: answer-version keyed;
- cross-verification group: query/evidence-set keyed.

Process-local caching remains a development adapter. Redis is the production
multi-worker adapter.

