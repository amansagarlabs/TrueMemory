-- Existing artifacts metadata remains canonical. Soft deletion is additive so
-- storage deletion and database retention can be coordinated safely.
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_artifacts_live_user_updated
    ON artifacts(user_id, updated_at DESC)
    WHERE deleted_at IS NULL AND status <> 'archived';
