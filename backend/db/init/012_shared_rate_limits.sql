CREATE TABLE IF NOT EXISTS shared_rate_limits (
    bucket_key TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_rate_limits_expiry
    ON shared_rate_limits(expires_at);
