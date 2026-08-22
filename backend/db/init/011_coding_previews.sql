ALTER TABLE coding_approvals
    DROP CONSTRAINT IF EXISTS coding_approvals_action_check;
ALTER TABLE coding_approvals
    ADD CONSTRAINT coding_approvals_action_check CHECK (
        action IN (
            'run_command', 'apply_patch', 'run_tests',
            'create_commit', 'create_pull_request', 'start_preview'
        )
    );

CREATE TABLE IF NOT EXISTS coding_previews (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    port INTEGER NOT NULL CHECK (port BETWEEN 1024 AND 65535),
    command TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'stopped', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    stopped_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coding_previews_task
    ON coding_previews(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_previews_token
    ON coding_previews(token_hash, expires_at);
