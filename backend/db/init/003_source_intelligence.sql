-- Source Intelligence: canonical source identity, snapshots, answer usage,
-- claim-level evidence, and source relationships.

CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_url TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    title TEXT NOT NULL,
    favicon_url TEXT,
    source_type TEXT NOT NULL,
    verification JSONB NOT NULL DEFAULT '{}'::jsonb,
    trust_score NUMERIC(5,2) CHECK (trust_score BETWEEN 0 AND 100),
    trust_components JSONB NOT NULL DEFAULT '{}'::jsonb,
    language TEXT,
    license TEXT,
    ownership_key TEXT,
    score_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    title TEXT,
    snippet TEXT,
    published_at TIMESTAMPTZ,
    page_updated_at TIMESTAMPTZ,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding DOUBLE PRECISION[],
    UNIQUE (source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS answer_sources (
    answer_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id),
    snapshot_id UUID REFERENCES source_snapshots(id),
    citation_index INTEGER NOT NULL,
    evidence_role TEXT NOT NULL CHECK (
        evidence_role IN ('primary', 'supporting', 'background', 'ignored')
    ),
    reason_used TEXT,
    confidence_score DOUBLE PRECISION CHECK (
        confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1
    ),
    influence_score DOUBLE PRECISION CHECK (
        influence_score IS NULL OR influence_score BETWEEN 0 AND 1
    ),
    selected BOOLEAN NOT NULL DEFAULT TRUE,
    score_version TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (answer_message_id, source_id)
);

CREATE TABLE IF NOT EXISTS claim_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    answer_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES sources(id),
    claim_text TEXT NOT NULL,
    answer_start INTEGER,
    answer_end INTEGER,
    cited_text TEXT,
    source_locator JSONB NOT NULL DEFAULT '{}'::jsonb,
    entailment_score DOUBLE PRECISION,
    coverage_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_relations (
    answer_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    from_source_id UUID NOT NULL REFERENCES sources(id),
    to_source_id UUID NOT NULL REFERENCES sources(id),
    relation TEXT NOT NULL CHECK (
        relation IN ('corroborates', 'conflicts', 'cites', 'duplicate_of', 'same_owner', 'supersedes')
    ),
    strength DOUBLE PRECISION NOT NULL CHECK (strength BETWEEN 0 AND 1),
    explanation TEXT,
    PRIMARY KEY (answer_message_id, from_source_id, to_source_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain);
CREATE INDEX IF NOT EXISTS idx_sources_ownership_key ON sources(ownership_key);
CREATE INDEX IF NOT EXISTS idx_source_snapshots_hash ON source_snapshots(content_hash);
CREATE INDEX IF NOT EXISTS idx_source_snapshots_source ON source_snapshots(source_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_sources_message ON answer_sources(answer_message_id, citation_index);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_message ON claim_evidence(answer_message_id);
CREATE INDEX IF NOT EXISTS idx_source_relations_message ON source_relations(answer_message_id);
