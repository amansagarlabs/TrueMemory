CREATE TABLE IF NOT EXISTS memory_hot_cache (
    cache_key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_hot_cache_expiry
    ON memory_hot_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_hot_cache_user_scope
    ON memory_hot_cache(user_id, scope);
