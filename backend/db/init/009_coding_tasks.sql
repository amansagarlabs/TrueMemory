CREATE TABLE IF NOT EXISTS coding_tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    repository_full_name TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    task_type TEXT NOT NULL CHECK (task_type IN ('explain', 'review', 'analyze', 'implement')),
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN (
            'planning', 'running', 'waiting_approval', 'testing',
            'completed', 'failed', 'cancelled'
        )),
    result TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS coding_task_events (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coding_tasks_scope
    ON coding_tasks(user_id, workspace_id, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_repository
    ON coding_tasks(user_id, repository_full_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coding_task_events_task
    ON coding_task_events(task_id, created_at ASC);
