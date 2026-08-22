CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT NOT NULL UNIQUE,
    username CITEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'deleted')),
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    timezone TEXT DEFAULT 'Asia/Calcutta',
    locale TEXT DEFAULT 'en-IN',
    theme TEXT DEFAULT 'dark',
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('password', 'google', 'github', 'magic_link')),
    provider_user_id TEXT,
    password_hash TEXT,
    password_salt TEXT,
    password_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id),
    UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL UNIQUE,
    refresh_token_hash TEXT UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_label TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    tenant_id TEXT,
    workspace_id TEXT,
    agent_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS agent_id TEXT;

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key TEXT NOT NULL UNIQUE,
    role_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    page_count INTEGER,
    checksum_sha256 TEXT,
    source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload', 'url', 'generated')),
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'ready', 'failed', 'archived')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifact_pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    run_status TEXT NOT NULL DEFAULT 'queued' CHECK (run_status IN ('queued', 'running', 'completed', 'failed')),
    extraction_ms NUMERIC(12,2),
    chunking_ms NUMERIC(12,2),
    tokenization_ms NUMERIC(12,2),
    embedding_ms NUMERIC(12,2),
    vector_insert_ms NUMERIC(12,2),
    total_ms NUMERIC(12,2),
    chunk_count INTEGER,
    token_count INTEGER,
    embedding_model TEXT,
    vector_collection TEXT,
    error_message TEXT,
    raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    conversation_type TEXT NOT NULL DEFAULT 'artifact_chat' CHECK (conversation_type IN ('artifact_chat', 'general_chat', 'support_chat')),
    model_name TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_artifacts (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, artifact_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    message_status TEXT NOT NULL DEFAULT 'completed' CHECK (message_status IN ('streaming', 'completed', 'failed')),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    retrieval_ms NUMERIC(12,2),
    llm_ms NUMERIC(12,2),
    total_ms NUMERIC(12,2),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_retrieval_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'milvus_chunk' CHECK (source_type IN ('milvus_chunk', 'memory', 'profile', 'manual_note')),
    chunk_index INTEGER,
    page_number INTEGER,
    similarity NUMERIC(8,4),
    preview TEXT,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    memory_type TEXT NOT NULL CHECK (memory_type IN ('conversation_summary', 'preference', 'task_state', 'fact')),
    memory_key TEXT NOT NULL,
    content TEXT NOT NULL,
    importance_score NUMERIC(4,2) NOT NULL DEFAULT 0.50,
    source TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, memory_type, memory_key)
);

CREATE TABLE IF NOT EXISTS profile_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    profile_key TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'chat-summary',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, artifact_id, profile_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    action TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON artifacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_artifact_id ON artifact_pipeline_runs(artifact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_sources_message_id ON message_retrieval_sources(message_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_memories_user_id ON profile_memories(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id, created_at DESC);

INSERT INTO roles (role_key, role_name, description)
VALUES
    ('admin', 'Admin', 'Full administrative access'),
    ('user', 'User', 'Standard signed-in user'),
    ('viewer', 'Viewer', 'Read-only access')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO permissions (permission_key, description)
VALUES
    ('artifact.read', 'Read uploaded artifacts'),
    ('artifact.write', 'Upload and edit artifacts'),
    ('artifact.delete', 'Delete artifacts'),
    ('chat.read', 'Read chat history'),
    ('chat.write', 'Send chat messages'),
    ('chat.delete', 'Delete chat history'),
    ('memory.read', 'Read memory records'),
    ('memory.write', 'Write memory records'),
    ('profile.read', 'Read profile settings'),
    ('profile.write', 'Update profile settings'),
    ('admin.access', 'Access admin features')
ON CONFLICT (permission_key) DO NOTHING;

WITH role_map AS (
    SELECT id, role_key FROM roles
),
permission_map AS (
    SELECT id, permission_key FROM permissions
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_map r
JOIN permission_map p ON (
    (r.role_key = 'admin')
    OR (r.role_key = 'user' AND p.permission_key IN (
        'artifact.read',
        'artifact.write',
        'chat.read',
        'chat.write',
        'memory.read',
        'memory.write',
        'profile.read',
        'profile.write'
    ))
    OR (r.role_key = 'viewer' AND p.permission_key IN (
        'artifact.read',
        'chat.read',
        'memory.read',
        'profile.read'
    ))
)
ON CONFLICT DO NOTHING;
