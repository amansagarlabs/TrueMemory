ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS agent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_active
    ON api_tokens(user_id, revoked_at, expires_at);
