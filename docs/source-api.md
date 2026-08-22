# Source Intelligence API

## Compatibility

`source.discovered` and `answer.sources` remain supported. Their `source`
objects gain optional Source Intelligence fields, so old clients continue to
work.

## Source object

```typescript
interface SourceIntelligence {
  canonical_url: string;
  favicon_url?: string;
  verification: {
    status: "verified" | "probable" | "unverified" | "conflicting" | "revoked";
    type: string;
    label: string;
    signals: string[];
  };
  trust_score: number;
  trust_components: Record<string, number>;
  confidence_score: number;
  confidence_label: "very_high" | "high" | "medium" | "low";
  evidence_role: "primary" | "supporting" | "background" | "ignored";
  reason_used: string;
  influence_score: number;
  freshness: {
    status: "fresh" | "aging" | "stale" | "unknown";
    label: string;
    age_days?: number;
  };
  cross_verification: {
    independent_sources: number;
    supporting_source_ids: string[];
    conflicting_source_ids: string[];
  };
  content_hash: string;
  score_version: string;
}
```

## SSE events

### `source.intelligence`

Emitted after enrichment/scoring updates a previously discovered source.

```json
{
  "event": "source.intelligence",
  "data": {"source_id": "src_1", "patch": {"trust_score": 91}}
}
```

### `answer.evidence`

Final claim coverage and relations:

```json
{
  "event": "answer.evidence",
  "data": {
    "coverage": 0.86,
    "independent_owners": 4,
    "conflicts": [],
    "relations": []
  }
}
```

## Read endpoint

`GET /api/v1/messages/{message_id}/source-intelligence`

Returns the complete evidence bundle for reopening Source Explorer without
re-running search or scoring.

