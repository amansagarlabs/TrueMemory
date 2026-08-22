CREATE TABLE IF NOT EXISTS coding_worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL DEFAULT '',
    process_id INTEGER,
    status TEXT NOT NULL DEFAULT 'idle',
    current_run_id UUID,
    phase TEXT NOT NULL DEFAULT 'idle',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coding_worker_heartbeats_seen
    ON coding_worker_heartbeats(last_seen_at DESC);
