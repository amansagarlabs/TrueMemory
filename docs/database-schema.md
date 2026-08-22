# Source Intelligence Database Schema

## Core tables

### `sources`

Canonical identity shared across answers.

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  favicon_url TEXT,
  source_type TEXT NOT NULL,
  verification JSONB NOT NULL DEFAULT '{}',
  trust_score SMALLINT NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  trust_components JSONB NOT NULL DEFAULT '{}',
  language TEXT,
  license TEXT,
  ownership_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `source_snapshots`

```sql
CREATE TABLE source_snapshots (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  published_at TIMESTAMPTZ,
  page_updated_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL,
  content_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(384),
  UNIQUE (source_id, content_hash)
);
```

### `answer_sources`

```sql
CREATE TABLE answer_sources (
  answer_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  snapshot_id UUID REFERENCES source_snapshots(id),
  citation_index INTEGER NOT NULL,
  evidence_role TEXT NOT NULL,
  reason_used TEXT,
  confidence_score REAL,
  influence_score REAL,
  selected BOOLEAN NOT NULL DEFAULT true,
  score_version TEXT NOT NULL,
  PRIMARY KEY (answer_message_id, source_id)
);
```

### `claim_evidence`

Stores the exact answer span and supporting evidence location.

```sql
CREATE TABLE claim_evidence (
  id UUID PRIMARY KEY,
  answer_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id),
  claim_text TEXT NOT NULL,
  answer_start INTEGER,
  answer_end INTEGER,
  cited_text TEXT,
  source_locator JSONB NOT NULL DEFAULT '{}',
  entailment_score REAL,
  coverage_score REAL
);
```

### `source_relations`

```sql
CREATE TABLE source_relations (
  answer_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  from_source_id UUID NOT NULL REFERENCES sources(id),
  to_source_id UUID NOT NULL REFERENCES sources(id),
  relation TEXT NOT NULL,
  strength REAL NOT NULL,
  explanation TEXT,
  PRIMARY KEY (answer_message_id, from_source_id, to_source_id, relation)
);
```

Indexes cover canonical URL, domain, ownership key, content hash, answer ID, and
vector similarity. The first migration can keep Source Intelligence inside
message JSONB while these tables are introduced behind a feature flag.

