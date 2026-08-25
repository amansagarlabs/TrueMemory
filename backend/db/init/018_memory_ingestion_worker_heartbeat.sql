-- Operational liveness for the durable memory-ingestion worker.

CREATE TABLE IF NOT EXISTS memory_ingestion_worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    current_job_id UUID REFERENCES memory_ingestion_jobs(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_memory_ingestion_worker_heartbeat_seen
    ON memory_ingestion_worker_heartbeats(last_seen_at DESC);
