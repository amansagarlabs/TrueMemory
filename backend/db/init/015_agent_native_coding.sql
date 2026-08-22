ALTER TABLE coding_tasks
    ADD COLUMN IF NOT EXISTS source JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'ask',
    ADD COLUMN IF NOT EXISTS effort_profile TEXT NOT NULL DEFAULT 'fast',
    ADD COLUMN IF NOT EXISTS goal_spec JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE coding_tasks
SET source = CASE
    WHEN repository_full_name LIKE 'local:%' THEN jsonb_build_object(
        'kind', 'local_git',
        'workspaceSlug', substring(repository_full_name FROM 7),
        'branch', branch,
        'snapshotId', ''
    )
    ELSE jsonb_build_object(
        'kind', 'github',
        'fullName', repository_full_name,
        'branch', branch
    )
END
WHERE source = '{}'::jsonb;

ALTER TABLE coding_tasks
    DROP CONSTRAINT IF EXISTS coding_tasks_interaction_mode_check,
    ADD CONSTRAINT coding_tasks_interaction_mode_check
        CHECK (interaction_mode IN ('ask', 'plan', 'build')),
    DROP CONSTRAINT IF EXISTS coding_tasks_effort_profile_check,
    ADD CONSTRAINT coding_tasks_effort_profile_check
        CHECK (effort_profile IN ('fast', 'balanced', 'deep'));

ALTER TABLE coding_agent_runs
    ADD COLUMN IF NOT EXISTS source JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'ask',
    ADD COLUMN IF NOT EXISTS effort_profile TEXT NOT NULL DEFAULT 'fast',
    ADD COLUMN IF NOT EXISTS goal_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES coding_agent_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS orchestration_role TEXT NOT NULL DEFAULT 'orchestrator';

ALTER TABLE coding_agent_runs
    DROP CONSTRAINT IF EXISTS coding_agent_runs_interaction_mode_check,
    ADD CONSTRAINT coding_agent_runs_interaction_mode_check
        CHECK (interaction_mode IN ('ask', 'plan', 'build')),
    DROP CONSTRAINT IF EXISTS coding_agent_runs_effort_profile_check,
    ADD CONSTRAINT coding_agent_runs_effort_profile_check
        CHECK (effort_profile IN ('fast', 'balanced', 'deep'));

ALTER TABLE coding_agent_steps
    ADD COLUMN IF NOT EXISTS orchestration_role TEXT NOT NULL DEFAULT 'orchestrator',
    ADD COLUMN IF NOT EXISTS dependencies JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_coding_agent_runs_parent
    ON coding_agent_runs(parent_run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_coding_tasks_mode
    ON coding_tasks(user_id, interaction_mode, effort_profile, updated_at DESC);
