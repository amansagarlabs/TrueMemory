CREATE TABLE IF NOT EXISTS coding_task_plans (
    task_id UUID PRIMARY KEY REFERENCES coding_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan JSONB NOT NULL,
    markdown TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved')),
    revision INTEGER NOT NULL DEFAULT 1,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coding_task_plans_user
    ON coding_task_plans(user_id, updated_at DESC);
