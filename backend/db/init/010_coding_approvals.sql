CREATE TABLE IF NOT EXISTS coding_approvals (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (
        action IN (
            'run_command', 'apply_patch', 'run_tests',
            'create_commit', 'create_pull_request'
        )
    ),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'consumed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coding_approvals_task
    ON coding_approvals(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_approvals_pending
    ON coding_approvals(user_id, status, expires_at);
