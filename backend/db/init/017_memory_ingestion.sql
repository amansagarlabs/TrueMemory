-- Universal asynchronous memory ingestion and consolidation.
-- This is orchestration state, not a second memory store. Durable memories
-- continue to be projected through MemoryCore and the existing lifecycle.

CREATE TABLE IF NOT EXISTS memory_ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_kind TEXT NOT NULL DEFAULT 'ingestion'
        CHECK (job_kind IN ('ingestion', 'consolidation', 'reprocess')),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT,
    workspace_id TEXT,
    agent_id TEXT,
    scope TEXT NOT NULL DEFAULT 'general',
    provider TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_url TEXT,
    external_id TEXT,
    idempotency_key TEXT,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('requested', 'queued', 'running', 'candidate_ready',
                          'completed', 'failed', 'dead_letter', 'cancelled')),
    current_stage TEXT NOT NULL DEFAULT 'queued',
    priority INTEGER NOT NULL DEFAULT 50,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
    filter_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    discovered_items INTEGER NOT NULL DEFAULT 0,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    memory_count INTEGER NOT NULL DEFAULT 0,
    source_version TEXT NOT NULL DEFAULT '1',
    processor_version TEXT NOT NULL DEFAULT 'memory-compiler-v1',
    embedding_version TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_ingestion_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES memory_ingestion_jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT,
    agent_id TEXT,
    source_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    external_id TEXT,
    canonical_url TEXT,
    title TEXT,
    raw_content TEXT,
    normalized_content TEXT,
    content_hash TEXT NOT NULL,
    source_version TEXT NOT NULL DEFAULT '1',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision TEXT NOT NULL DEFAULT 'processing'
        CHECK (decision IN ('processing', 'rejected', 'duplicate', 'reference',
                            'candidate', 'approved', 'superseded', 'expired')),
    confidence NUMERIC(5,4),
    importance NUMERIC(5,4),
    memory_key TEXT,
    memory_content TEXT,
    memory_id TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, source_id, content_hash)
);

CREATE TABLE IF NOT EXISTS memory_ingestion_events (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES memory_ingestion_jobs(id) ON DELETE CASCADE,
    item_id UUID REFERENCES memory_ingestion_items(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    duration_ms NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_ingestion_idempotency
    ON memory_ingestion_jobs(user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_memory_ingestion_queue
    ON memory_ingestion_jobs(status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_memory_ingestion_owner
    ON memory_ingestion_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_ingestion_items_owner
    ON memory_ingestion_items(user_id, decision, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_ingestion_items_hash
    ON memory_ingestion_items(user_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_memory_ingestion_events_job
    ON memory_ingestion_events(job_id, created_at ASC);
