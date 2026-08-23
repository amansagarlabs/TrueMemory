"""Postgres-backed MVP persistence for users, conversations, and messages."""

from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
from typing import Any
from uuid import UUID, uuid4

try:
    import psycopg
    from psycopg.rows import dict_row
except ModuleNotFoundError:  # pragma: no cover - optional dependency in local dev
    psycopg = None
    dict_row = None

logger = logging.getLogger(__name__)
_CODING_TASK_STATUSES = {
    "planning",
    "running",
    "waiting_approval",
    "testing",
    "completed",
    "failed",
    "cancelled",
}
_CODING_AGENT_RUN_STATUSES = {
    "queued",
    "running",
    "waiting_approval",
    "completed",
    "failed",
    "cancelled",
}


def postgres_enabled(settings) -> bool:
    return bool(getattr(settings, "database_url", "") and psycopg is not None)


def _connect(settings: Any):
    if psycopg is None or dict_row is None:
        raise RuntimeError(
            "psycopg is not installed. Run `pip install -r requirements.txt` in backend/."
        )
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def ensure_conversation_controls(settings) -> None:
    """Add sidebar controls to older databases without breaking existing installs."""
    if not postgres_enabled(settings):
        return

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                ALTER TABLE conversations
                ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE
                """
            )
            cur.execute(
                """
                ALTER TABLE conversations
                DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;
                ALTER TABLE conversations
                ADD CONSTRAINT conversations_conversation_type_check
                CHECK (conversation_type IN ('artifact_chat', 'general_chat', 'support_chat', 'coding_chat', 'agents_chat', 'workflow_chat'))
                """
            )
            conn.commit()


def check_postgres_connection(settings) -> dict[str, Any]:
    if not postgres_enabled(settings):
        return {
            "connected": False,
            "mode": getattr(settings, "database_mode", "unknown"),
            "database": getattr(settings, "postgres_db", ""),
            "host": getattr(settings, "postgres_host", ""),
            "reason": "Postgres is not configured.",
        }

    try:
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT current_database() AS database, current_user AS user_name")
                row = cur.fetchone() or {}
        return {
            "connected": True,
            "mode": getattr(settings, "database_mode", "unknown"),
            "database": row.get("database", getattr(settings, "postgres_db", "")),
            "host": getattr(settings, "postgres_host", ""),
            "user": row.get("user_name", getattr(settings, "postgres_user", "")),
        }
    except Exception as exc:  # pragma: no cover - operational health check
        return {
            "connected": False,
            "mode": getattr(settings, "database_mode", "unknown"),
            "database": getattr(settings, "postgres_db", ""),
            "host": getattr(settings, "postgres_host", ""),
            "reason": str(exc),
        }


def resolve_user_id(settings, user_hint: str) -> str | None:
    if not postgres_enabled(settings):
        return None

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            try:
                uuid_value = str(UUID(user_hint))
                cur.execute("SELECT id::text FROM users WHERE id = %s", (uuid_value,))
                row = cur.fetchone()
                if row:
                    return row["id"]
            except ValueError:
                pass

            cur.execute(
                """
                SELECT id::text
                FROM users
                WHERE username = %s OR email = %s
                LIMIT 1
                """,
                (user_hint, user_hint),
            )
            row = cur.fetchone()
            if row:
                return row["id"]

            if user_hint != "local-user":
                return None

            cur.execute(
                """
                INSERT INTO users (email, username, status, is_email_verified)
                VALUES (%s, %s, 'active', TRUE)
                RETURNING id::text
                """,
                ("local-user@app-agent.local", "local-user"),
            )
            user = cur.fetchone()
            user_id = user["id"]
            cur.execute(
                """
                INSERT INTO user_profiles (user_id, full_name, onboarding_completed)
                VALUES (%s, %s, TRUE)
                ON CONFLICT (user_id) DO NOTHING
                """,
                (user_id, "Local User"),
            )
            cur.execute(
                """
                INSERT INTO user_roles (user_id, role_id)
                SELECT %s, id FROM roles WHERE role_key = 'user'
                ON CONFLICT DO NOTHING
                """,
                (user_id,),
            )
            conn.commit()
            return user_id


def ensure_conversation(
    settings,
    *,
    conversation_id: str,
    user_id: str,
    question: str,
    workspace_id: str | None = None,
    project_id: str | None = None,
    conversation_type: str = "artifact_chat",
) -> None:
    if not postgres_enabled(settings):
        return

    title = question.strip()[:80] or "New chat"
    normalized_type = conversation_type if conversation_type in {"artifact_chat", "general_chat", "support_chat", "coding_chat", "agents_chat", "workflow_chat"} else "artifact_chat"
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversations (
                    id, user_id, workspace_id, project_id, title, conversation_type, status, last_message_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'active', NOW())
                ON CONFLICT (id)
                DO UPDATE SET
                    title = COALESCE(conversations.title, EXCLUDED.title),
                    workspace_id = COALESCE(conversations.workspace_id, EXCLUDED.workspace_id),
                    project_id = COALESCE(conversations.project_id, EXCLUDED.project_id),
                    conversation_type = EXCLUDED.conversation_type,
                    updated_at = NOW(),
                    last_message_at = NOW()
                """,
                (conversation_id, user_id, workspace_id, project_id, title, normalized_type),
            )
            conn.commit()


def upsert_workspace(
    settings,
    *,
    workspace_id: str,
    user_id: str,
    name: str,
    platform: str = "Kontext Memory",
) -> dict[str, Any]:
    normalized_name = name.strip()[:120] or "My workspace"
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO workspaces (
                    id, owner_user_id, name, platform, last_active_at
                )
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    platform = EXCLUDED.platform,
                    updated_at = NOW(),
                    last_active_at = NOW()
                WHERE workspaces.owner_user_id = EXCLUDED.owner_user_id
                RETURNING
                    id::text, name, platform,
                    last_active_at AS last_active
                """,
                (workspace_id, user_id, normalized_name, platform[:80]),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Workspace belongs to another user.")
            cur.execute(
                """
                UPDATE conversations
                SET workspace_id = %s, updated_at = NOW()
                WHERE user_id = %s AND workspace_id IS NULL
                """,
                (workspace_id, user_id),
            )
            conn.commit()
            return dict(row)


def list_workspaces(settings, *, user_id: str) -> list[dict[str, Any]]:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, name, platform,
                    last_active_at AS last_active
                FROM workspaces
                WHERE owner_user_id = %s
                ORDER BY last_active_at DESC, created_at ASC
                """,
                (user_id,),
            )
            return list(cur.fetchall())


def delete_workspace(settings, *, workspace_id: str, user_id: str) -> bool:
    """Delete an owned Space and its cascade-owned context."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM workspaces WHERE id = %s AND owner_user_id = %s RETURNING id",
                (workspace_id, user_id),
            )
            deleted = cur.fetchone() is not None
            conn.commit()
            return deleted


def get_project_for_user(
    settings, *, project_id: str, user_id: str, workspace_id: str | None = None
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, workspace_id::text, name, description,
                       created_at, last_active_at AS last_active
                FROM projects
                WHERE id = %s AND owner_user_id = %s AND status = 'active'
                  AND (%s::uuid IS NULL OR workspace_id = %s::uuid)
                """,
                (project_id, user_id, workspace_id, workspace_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def list_projects(settings, *, user_id: str, workspace_id: str) -> list[dict[str, Any]]:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, workspace_id::text, name, description,
                       created_at, last_active_at AS last_active
                FROM projects
                WHERE owner_user_id = %s AND workspace_id = %s AND status = 'active'
                ORDER BY last_active_at DESC, created_at DESC
                """,
                (user_id, workspace_id),
            )
            return list(cur.fetchall())


def upsert_project(
    settings, *, project_id: str, workspace_id: str, user_id: str,
    name: str, description: str = ""
) -> dict[str, Any]:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM workspaces WHERE id = %s AND owner_user_id = %s",
                (workspace_id, user_id),
            )
            if not cur.fetchone():
                raise ValueError("Workspace was not found.")
            cur.execute(
                """
                INSERT INTO projects (id, workspace_id, owner_user_id, name, description)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, description = EXCLUDED.description,
                    status = 'active', updated_at = NOW(), last_active_at = NOW()
                WHERE projects.owner_user_id = EXCLUDED.owner_user_id
                  AND projects.workspace_id = EXCLUDED.workspace_id
                RETURNING id::text, workspace_id::text, name, description,
                          created_at, last_active_at AS last_active
                """,
                (project_id, workspace_id, user_id, name.strip()[:80], description.strip()[:240]),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Project belongs to another workspace or user.")
            conn.commit()
            return dict(row)


def archive_project(settings, *, project_id: str, user_id: str) -> bool:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE projects SET status = 'archived', updated_at = NOW()
                WHERE id = %s AND owner_user_id = %s AND status = 'active'
                """,
                (project_id, user_id),
            )
            changed = cur.rowcount > 0
            conn.commit()
            return changed


def list_project_context_items(
    settings, *, project_id: str, user_id: str, limit: int = 12
) -> list[dict[str, str]]:
    """Return bounded project context for automatic prompt grounding."""
    bounded = max(1, min(limit, 30))
    items: list[dict[str, str]] = []
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT name, description
                FROM projects
                WHERE id = %s AND owner_user_id = %s AND status = 'active'
                """,
                (project_id, user_id),
            )
            project = cur.fetchone()
            if not project:
                return []
            items.append({
                "key": "project",
                "content": f"Active project: {project['name']}. {project['description']}".strip(),
            })
            cur.execute(
                """
                SELECT title, original_filename
                FROM artifacts
                WHERE project_id = %s AND user_id = %s AND status <> 'archived'
                ORDER BY updated_at DESC LIMIT %s
                """,
                (project_id, user_id, bounded),
            )
            items.extend({
                "key": f"project-artifact:{index}",
                "content": f"Project artifact: {row['title']} ({row['original_filename']})",
            } for index, row in enumerate(cur.fetchall()))
            cur.execute(
                """
                SELECT title
                FROM conversations
                WHERE project_id = %s AND user_id = %s AND status = 'active'
                ORDER BY updated_at DESC LIMIT %s
                """,
                (project_id, user_id, bounded),
            )
            items.extend({
                "key": f"project-conversation:{index}",
                "content": f"Previous project conversation: {row['title'] or 'Untitled chat'}",
            } for index, row in enumerate(cur.fetchall()))
    return items[: bounded + 1]


def list_project_context_records(
    settings, *, project_id: str, user_id: str, limit: int = 12
) -> list[dict[str, Any]]:
    """Load authorized project graph records and their relationship metadata."""
    bounded = max(1, min(limit, 30))
    records: list[dict[str, Any]] = []
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, name, description
                FROM projects
                WHERE id = %s AND owner_user_id = %s AND status = 'active'
                """,
                (project_id, user_id),
            )
            project = cur.fetchone()
            if not project:
                return []
            root_id = f"project:{project['id']}"
            records.append({
                "id": root_id,
                "kind": "project",
                "label": project["name"],
                "content": project["description"] or f"Project {project['name']}",
                "score": 1.0,
                "metadata": {"resource_type": "project"},
            })
            cur.execute(
                """
                SELECT id::text, title, original_filename, mime_type, status
                FROM artifacts
                WHERE project_id = %s AND user_id = %s AND status <> 'archived'
                ORDER BY updated_at DESC LIMIT %s
                """,
                (project_id, user_id, bounded),
            )
            records.extend({
                "id": f"artifact:{row['id']}",
                "kind": "document",
                "label": row["title"],
                "content": f"{row['original_filename']} · {row['mime_type']} · {row['status']}",
                "score": 0.75,
                "metadata": {
                    "resource_type": "artifact",
                    "parent_id": root_id,
                    "relation": "contains_artifact",
                },
            } for row in cur.fetchall())
            cur.execute(
                """
                SELECT c.id::text, COALESCE(NULLIF(c.title, ''), 'Untitled chat') AS title,
                       COALESCE((
                           SELECT STRING_AGG(
                               CONCAT(UPPER(LEFT(recent.role, 1)), SUBSTRING(recent.role FROM 2), ': ', recent.content),
                               E'\n' ORDER BY recent.created_at
                           )
                           FROM (
                               SELECT m.role, m.content, m.created_at
                               FROM messages m
                               WHERE m.conversation_id = c.id
                                 AND m.message_status = 'completed'
                               ORDER BY m.created_at DESC
                               LIMIT 6
                           ) AS recent
                       ), '') AS recent_messages
                FROM conversations c
                WHERE c.project_id = %s AND c.user_id = %s AND c.status = 'active'
                ORDER BY c.updated_at DESC LIMIT %s
                """,
                (project_id, user_id, bounded),
            )
            records.extend({
                "id": f"conversation:{row['id']}",
                "kind": "memory",
                "label": row["title"],
                "content": (
                    f"Recent project conversation: {row['title']}\n{row['recent_messages']}"
                    if row["recent_messages"]
                    else f"Project conversation: {row['title']}"
                ),
                "score": 0.7,
                "metadata": {
                    "resource_type": "conversation",
                    "parent_id": root_id,
                    "relation": "contains_conversation",
                },
            } for row in cur.fetchall())
            cur.execute(
                """
                SELECT id::text, memory_type, memory_key, content, importance_score
                FROM user_memories
                WHERE project_id = %s AND user_id = %s
                ORDER BY importance_score DESC, updated_at DESC LIMIT %s
                """,
                (project_id, user_id, bounded),
            )
            records.extend({
                "id": f"memory:{row['id']}",
                "kind": "memory",
                "label": str(row["memory_key"]).replace("_", " ").title(),
                "content": row["content"],
                "score": float(row["importance_score"] or 0.5),
                "metadata": {
                    "resource_type": str(row["memory_type"]),
                    "parent_id": root_id,
                    "relation": "contains_memory",
                },
            } for row in cur.fetchall())
            cur.execute(
                """
                SELECT ca.conversation_id::text, ca.artifact_id::text
                FROM conversation_artifacts ca
                JOIN conversations c ON c.id = ca.conversation_id
                JOIN artifacts a ON a.id = ca.artifact_id
                WHERE c.project_id = %s AND c.user_id = %s AND a.user_id = %s
                LIMIT %s
                """,
                (project_id, user_id, user_id, bounded),
            )
            relationships = {
                f"conversation:{row['conversation_id']}": f"artifact:{row['artifact_id']}"
                for row in cur.fetchall()
            }
            for record in records:
                linked_artifact = relationships.get(record["id"])
                if linked_artifact:
                    record["metadata"]["linked_artifact_id"] = linked_artifact
    return records


def save_durable_memories(
    settings,
    *,
    user_id: str,
    workspace_id: str,
    conversation_id: str,
    source_message_id: str | None,
    candidates: list[Any],
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    if not postgres_enabled(settings) or not candidates:
        return []
    saved: list[dict[str, Any]] = []
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            for candidate in candidates:
                cur.execute(
                    """
                    SELECT *
                    FROM user_memories
                    WHERE user_id = %s AND workspace_id = %s
                      AND project_id IS NOT DISTINCT FROM %s
                      AND memory_type = %s AND memory_key = %s
                      AND lifecycle_status IN ('pending', 'approved')
                    FOR UPDATE
                    """,
                    (
                        user_id, workspace_id, project_id,
                        candidate.memory_type, candidate.memory_key,
                    ),
                )
                current = cur.fetchone()
                lifecycle_status = "approved"
                supersedes_id = None
                if current and current["content"] == candidate.content:
                    cur.execute(
                        """
                        UPDATE user_memories SET
                            conversation_id = %s, source_message_id = %s,
                            importance_score = %s, updated_at = NOW()
                        WHERE id = %s
                        RETURNING id::text, memory_type, memory_key, content,
                                  importance_score, source, conversation_id::text,
                                  source_message_id::text, updated_at
                        """,
                        (
                            conversation_id, source_message_id,
                            candidate.importance_score, current["id"],
                        ),
                    )
                else:
                    if current:
                        lifecycle_status = "pending"
                        supersedes_id = current["id"]
                        cur.execute(
                            """
                            UPDATE user_memories
                            SET lifecycle_status = 'superseded',
                                superseded_at = NOW(), updated_at = NOW()
                            WHERE id = %s
                            """,
                            (current["id"],),
                        )
                    cur.execute(
                        """
                        INSERT INTO user_memories (
                            user_id, workspace_id, project_id, conversation_id,
                            source_message_id, memory_type, memory_key, content,
                            importance_score, confidence_score, source,
                            lifecycle_status, supersedes_memory_id
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0.900,
                                'user-declared', %s, %s)
                        RETURNING id::text, memory_type, memory_key, content,
                                  importance_score, source, conversation_id::text,
                                  source_message_id::text, updated_at
                        """,
                        (
                            user_id, workspace_id, project_id, conversation_id,
                            source_message_id, candidate.memory_type,
                            candidate.memory_key, candidate.content,
                            candidate.importance_score, lifecycle_status, supersedes_id,
                        ),
                    )
                row = cur.fetchone()
                if row:
                    saved.append(dict(row))
            conn.commit()
    return saved


def list_workspace_memories(
    settings,
    *,
    user_id: str,
    workspace_id: str,
    limit: int = 50,
    project_id: str | None = None,
    as_of: str | None = None,
    include_history: bool = False,
) -> list[dict[str, Any]]:
    if not postgres_enabled(settings):
        return []
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, memory_type, memory_key, content,
                    importance_score, source, conversation_id::text,
                    source_message_id::text, updated_at, valid_from, valid_until,
                    revision, confidence_score, lifecycle_status,
                    supersedes_memory_id::text, provenance
                FROM user_memories
                WHERE user_id = %s AND workspace_id = %s
                  AND (%s::uuid IS NULL OR project_id = %s::uuid)
                  AND (%s::boolean OR lifecycle_status = 'approved')
                  AND (%s::timestamptz IS NULL OR valid_from IS NULL OR valid_from <= %s::timestamptz)
                  AND (%s::timestamptz IS NULL OR valid_until IS NULL OR valid_until > %s::timestamptz)
                ORDER BY importance_score DESC, updated_at DESC
                LIMIT %s
                """,
                (
                    user_id,
                    workspace_id,
                    project_id,
                    project_id,
                    include_history,
                    as_of,
                    as_of,
                    as_of,
                    as_of,
                    max(1, min(limit, 200)),
                ),
            )
            return list(cur.fetchall())


def list_managed_memories(
    settings, *, user_id: str, workspace_id: str,
    project_id: str | None = None, query: str = "", status: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    normalized_query = query.strip()[:200]
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    memory.id::text, memory.workspace_id::text,
                    memory.project_id::text, project.name AS project_name,
                    memory.memory_type, memory.memory_key, memory.content,
                    memory.importance_score, memory.confidence_score,
                    memory.source, memory.lifecycle_status AS status,
                    memory.is_pinned, memory.conversation_id::text,
                    conversation.title AS conversation_title,
                    memory.source_message_id::text,
                    memory.artifact_id::text, artifact.title AS artifact_title,
                    memory.supersedes_memory_id::text,
                    memory.created_at, memory.updated_at, memory.reviewed_at
                FROM user_memories memory
                LEFT JOIN projects project ON project.id = memory.project_id
                LEFT JOIN conversations conversation ON conversation.id = memory.conversation_id
                LEFT JOIN artifacts artifact ON artifact.id = memory.artifact_id
                WHERE memory.user_id = %s AND memory.workspace_id = %s
                  AND (%s::uuid IS NULL OR memory.project_id = %s)
                  AND (%s::text IS NULL OR memory.lifecycle_status = %s)
                  AND (
                    %s::text = '' OR memory.content ILIKE '%%' || %s || '%%'
                    OR memory.memory_key ILIKE '%%' || %s || '%%'
                  )
                ORDER BY memory.is_pinned DESC, memory.updated_at DESC
                LIMIT %s
                """,
                (
                    user_id, workspace_id, project_id, project_id,
                    status, status, normalized_query, normalized_query,
                    normalized_query, max(1, min(limit, 500)),
                ),
            )
            return list(cur.fetchall())


def update_managed_memory(
    settings, *, memory_id: str, user_id: str, action: str,
    content: str | None = None,
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM user_memories WHERE id = %s AND user_id = %s FOR UPDATE",
                (memory_id, user_id),
            )
            current = cur.fetchone()
            if not current:
                return None
            if action == "edit":
                normalized = (content or "").strip()[:4000]
                if not normalized:
                    raise ValueError("Memory content cannot be empty.")
                cur.execute(
                    """
                    UPDATE user_memories
                    SET lifecycle_status = 'superseded', superseded_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                    """,
                    (memory_id,),
                )
                cur.execute(
                    """
                    INSERT INTO user_memories (
                        user_id, workspace_id, project_id, conversation_id,
                        artifact_id, source_message_id, memory_type, memory_key,
                        content, importance_score, confidence_score, source,
                        lifecycle_status, is_pinned, supersedes_memory_id, reviewed_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, 'user-edited', 'approved', %s, %s, NOW()
                    )
                    RETURNING id::text
                    """,
                    (
                        current["user_id"], current["workspace_id"], current["project_id"],
                        current["conversation_id"], current["artifact_id"],
                        current["source_message_id"], current["memory_type"],
                        current["memory_key"], normalized, current["importance_score"],
                        current["confidence_score"], current["is_pinned"], memory_id,
                    ),
                )
                next_id = cur.fetchone()["id"]
            else:
                updates = {
                    "pin": ("is_pinned = TRUE",),
                    "unpin": ("is_pinned = FALSE",),
                    "approve": ("lifecycle_status = 'approved', reviewed_at = NOW()",),
                    "reject": ("lifecycle_status = 'rejected', reviewed_at = NOW()",),
                    "archive": ("lifecycle_status = 'archived', reviewed_at = NOW()",),
                }
                if action not in updates:
                    raise ValueError("Unsupported memory action.")
                cur.execute(
                    f"UPDATE user_memories SET {updates[action][0]}, updated_at = NOW() WHERE id = %s",
                    (memory_id,),
                )
                next_id = memory_id
            conn.commit()
    items = list_managed_memories(
        settings,
        user_id=user_id,
        workspace_id=str(current["workspace_id"]),
        limit=500,
    )
    return next((item for item in items if item["id"] == next_id), None)


def save_message(
    settings,
    *,
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
    metadata: dict[str, Any] | None = None,
    retrieval_ms: float | None = None,
    llm_ms: float | None = None,
    total_ms: float | None = None,
    message_status: str = "completed",
) -> str | None:
    if not postgres_enabled(settings):
        return None

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO messages (
                    conversation_id,
                    user_id,
                    role,
                    content,
                    retrieval_ms,
                    llm_ms,
                    total_ms,
                    metadata,
                    message_status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id::text
                """,
                (
                    conversation_id,
                    user_id,
                    role,
                    content,
                    retrieval_ms,
                    llm_ms,
                    total_ms,
                    psycopg.types.json.Json(metadata or {}),
                    message_status,
                ),
            )
            row = cur.fetchone()
            cur.execute(
                """
                UPDATE conversations
                SET updated_at = NOW(), last_message_at = NOW()
                WHERE id = %s
                """,
                (conversation_id,),
            )
            conn.commit()
            return row["id"] if row else None


def update_streaming_message(
    settings,
    *,
    message_id: str,
    user_id: str,
    content: str,
    message_status: str = "streaming",
    metadata: dict[str, Any] | None = None,
    llm_ms: float | None = None,
    total_ms: float | None = None,
) -> bool:
    """Persist a partial assistant response without exposing another user's row."""
    if not postgres_enabled(settings) or not message_id:
        return False

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE messages
                SET content = %s,
                    message_status = %s,
                    metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                    llm_ms = COALESCE(%s, llm_ms),
                    total_ms = COALESCE(%s, total_ms)
                WHERE id = %s AND user_id = %s AND role = 'assistant'
                RETURNING id::text
                """,
                (
                    content,
                    message_status,
                    psycopg.types.json.Json(metadata or {}),
                    llm_ms,
                    total_ms,
                    message_id,
                    user_id,
                ),
            )
            updated = cur.fetchone() is not None
            conn.commit()
            return updated


def save_retrieval_sources(
    settings,
    *,
    message_id: str,
    sources: list[dict[str, Any]],
) -> None:
    if not postgres_enabled(settings) or not message_id or not sources:
        return

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            for source in sources:
                cur.execute(
                    """
                    INSERT INTO message_retrieval_sources (
                        message_id,
                        source_type,
                        chunk_index,
                        page_number,
                        similarity,
                        preview,
                        source_metadata
                    )
                    VALUES (%s, 'milvus_chunk', %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        message_id,
                        source.get("chunk_index"),
                        source.get("page"),
                        source.get("similarity"),
                        source.get("preview"),
                        psycopg.types.json.Json(
                            {
                                "distance": source.get("distance"),
                                "doc_id": source.get("doc_id"),
                            }
                        ),
                    ),
                )
            conn.commit()


def save_source_intelligence(
    settings,
    *,
    message_id: str,
    sources: list[dict[str, Any]],
) -> None:
    """Persist enriched source identities when the v3 schema is available.

    Older databases keep the same data in message metadata until migration 003
    is applied, so source persistence can never break answer delivery.
    """
    if not postgres_enabled(settings) or not message_id or not sources:
        return

    try:
        with _connect(settings) as conn:
            with conn.cursor() as cur:
                for source in sources:
                    canonical_url = str(source.get("canonical_url") or source.get("url") or "")
                    if not canonical_url.startswith(("http://", "https://")):
                        continue
                    cur.execute(
                        """
                        INSERT INTO sources (
                            canonical_url, domain, title, favicon_url, source_type,
                            verification, trust_score, trust_components, language,
                            license, ownership_key, score_version
                        )
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s, %s, %s, %s)
                        ON CONFLICT (canonical_url) DO UPDATE SET
                            title = EXCLUDED.title,
                            favicon_url = COALESCE(EXCLUDED.favicon_url, sources.favicon_url),
                            verification = EXCLUDED.verification,
                            trust_score = EXCLUDED.trust_score,
                            trust_components = EXCLUDED.trust_components,
                            language = COALESCE(EXCLUDED.language, sources.language),
                            license = COALESCE(EXCLUDED.license, sources.license),
                            score_version = EXCLUDED.score_version,
                            updated_at = NOW()
                        RETURNING id
                        """,
                        (
                            canonical_url,
                            source.get("domain") or "",
                            source.get("title") or "Source",
                            source.get("favicon_url"),
                            source.get("source_type") or "search",
                            psycopg.types.json.Json(source.get("verification") or {}),
                            source.get("trust_score"),
                            psycopg.types.json.Json(source.get("trust_components") or {}),
                            source.get("language"),
                            source.get("license"),
                            source.get("domain"),
                            source.get("score_version") or "source-intelligence-v1",
                        ),
                    )
                    source_row = cur.fetchone() or {}
                    source_id = source_row.get("id")
                    if not source_id:
                        continue
                    freshness = source.get("freshness") or {}
                    cur.execute(
                        """
                        INSERT INTO source_snapshots (
                            source_id, content_hash, title, snippet, published_at,
                            page_updated_at, retrieved_at, metadata
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, COALESCE(%s, NOW()), %s::jsonb)
                        ON CONFLICT (source_id, content_hash) DO UPDATE SET
                            retrieved_at = EXCLUDED.retrieved_at,
                            metadata = EXCLUDED.metadata
                        RETURNING id
                        """,
                        (
                            source_id,
                            source.get("content_hash") or "",
                            source.get("title"),
                            source.get("snippet"),
                            source.get("published_at"),
                            freshness.get("source_date"),
                            source.get("retrieved_at"),
                            psycopg.types.json.Json({
                                "provider": source.get("provider"),
                                "provider_label": source.get("provider_label"),
                            }),
                        ),
                    )
                    snapshot_row = cur.fetchone() or {}
                    cur.execute(
                        """
                        INSERT INTO answer_sources (
                            answer_message_id, source_id, snapshot_id, citation_index,
                            evidence_role, reason_used, confidence_score, influence_score,
                            selected, score_version, metadata
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        ON CONFLICT (answer_message_id, source_id) DO UPDATE SET
                            citation_index = EXCLUDED.citation_index,
                            evidence_role = EXCLUDED.evidence_role,
                            reason_used = EXCLUDED.reason_used,
                            confidence_score = EXCLUDED.confidence_score,
                            influence_score = EXCLUDED.influence_score,
                            selected = EXCLUDED.selected,
                            score_version = EXCLUDED.score_version,
                            metadata = EXCLUDED.metadata
                        """,
                        (
                            message_id,
                            source_id,
                            snapshot_row.get("id"),
                            source.get("citation_index") or 1,
                            source.get("evidence_role") or "background",
                            source.get("reason_used"),
                            source.get("confidence_score"),
                            source.get("influence_score"),
                            source.get("evidence_role") != "ignored",
                            source.get("score_version") or "source-intelligence-v1",
                            psycopg.types.json.Json({
                                "confidence_components": source.get("confidence_components") or {},
                                "freshness": freshness,
                                "cross_verification": source.get("cross_verification") or {},
                            }),
                        ),
                    )
            conn.commit()
    except Exception as exc:  # pragma: no cover - compatibility with pre-v3 databases
        logger.warning("Source Intelligence persistence skipped: %s", exc)


def update_message_feedback(
    settings,
    *,
    message_id: str,
    user_id: str,
    rating: str | None = None,
    report_reason: str | None = None,
    report_details: str | None = None,
    failure_type: str | None = None,
    regression_candidate: dict[str, Any] | None = None,
) -> bool:
    if not postgres_enabled(settings):
        return False

    feedback: dict[str, Any] = {
        "rating": rating,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    if report_reason:
        feedback.update(
            {
                "report_reason": report_reason,
                "report_details": report_details or "",
                "reported_at": datetime.now(UTC).isoformat(),
            }
        )
        if failure_type:
            feedback["failure_type"] = failure_type
        if regression_candidate:
            feedback["regression_candidate"] = regression_candidate

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE messages
                SET metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{feedback}',
                    COALESCE(metadata->'feedback', '{}'::jsonb) || %s::jsonb,
                    TRUE
                )
                WHERE id = %s AND user_id = %s AND role = 'assistant'
                RETURNING id::text
                """,
                (
                    psycopg.types.json.Json(feedback),
                    message_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row is not None


def list_recent_conversations(
    settings,
    *,
    user_id: str,
    limit: int = 12,
    include_archived: bool = False,
    status: str | None = None,
    workspace_id: str | None = None,
    project_id: str | None = None,
    conversation_type: str | None = "artifact_chat",
) -> list[dict[str, Any]]:
    if not postgres_enabled(settings):
        return []

    ensure_conversation_controls(settings)
    if status == "archived":
        status_filter = "AND c.status = 'archived'"
    elif status == "active":
        status_filter = "AND c.status = 'active'"
    elif include_archived:
        status_filter = ""
    else:
        status_filter = "AND c.status = 'active'"
    workspace_filter = "AND c.workspace_id = %s" if workspace_id else ""
    project_filter = "AND c.project_id = %s" if project_id else ""
    type_filter = "AND c.conversation_type = %s" if conversation_type else ""
    params: tuple[Any, ...] = (
        user_id,
        *((workspace_id,) if workspace_id else ()),
        *((project_id,) if project_id else ()),
        *((conversation_type,) if conversation_type else ()),
        limit,
    )

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    c.id::text AS id,
                    c.workspace_id::text AS workspace_id,
                    COALESCE(NULLIF(c.title, ''), 'Untitled chat') AS title,
                    c.updated_at,
                    c.last_message_at,
                    c.is_pinned,
                    c.status,
                    COUNT(m.id)::int AS message_count,
                    MAX(m.content) FILTER (WHERE m.created_at = (
                        SELECT MAX(m2.created_at)
                        FROM messages m2
                        WHERE m2.conversation_id = c.id
                    )) AS last_message
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                WHERE c.user_id = %s AND c.status <> 'deleted'
                    {status_filter}
                    {workspace_filter}
                    {project_filter}
                    {type_filter}
                GROUP BY c.id
                ORDER BY c.is_pinned DESC, COALESCE(c.last_message_at, c.updated_at) DESC
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()
            return list(rows)


def update_conversation(
    settings,
    *,
    conversation_id: str,
    user_id: str,
    action: str,
    title: str | None = None,
) -> dict[str, Any] | None:
    if not postgres_enabled(settings):
        return None

    if action == "rename":
        normalized_title = (title or "").strip()[:120]
        if not normalized_title:
            raise ValueError("A conversation title is required.")
        statement = "UPDATE conversations SET title = %s, updated_at = NOW() WHERE id = %s AND user_id = %s AND status <> 'deleted'"
        params = (normalized_title, conversation_id, user_id)
    elif action in {"pin", "unpin"}:
        statement = "UPDATE conversations SET is_pinned = %s, updated_at = NOW() WHERE id = %s AND user_id = %s AND status <> 'deleted'"
        params = (action == "pin", conversation_id, user_id)
    elif action == "archive":
        statement = "UPDATE conversations SET status = 'archived', updated_at = NOW() WHERE id = %s AND user_id = %s AND status <> 'deleted'"
        params = (conversation_id, user_id)
    elif action == "unarchive":
        statement = "UPDATE conversations SET status = 'active', updated_at = NOW() WHERE id = %s AND user_id = %s AND status = 'archived'"
        params = (conversation_id, user_id)
    elif action == "delete":
        statement = "UPDATE conversations SET status = 'deleted', updated_at = NOW() WHERE id = %s AND user_id = %s"
        params = (conversation_id, user_id)
    else:
        raise ValueError("Unsupported conversation action.")

    ensure_conversation_controls(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(statement, params)
            if cur.rowcount == 0:
                conn.rollback()
                return None
            conn.commit()

    if action == "delete":
        return {"id": conversation_id, "status": "deleted"}

    items = list_recent_conversations(settings, user_id=user_id, limit=50, include_archived=True)
    return next((item for item in items if item["id"] == conversation_id), None)


def save_artifact(
    settings,
    *,
    artifact_id: str,
    user_id: str,
    filename: str,
    storage_path: str,
    mime_type: str,
    file_size_bytes: int,
    page_count: int | None,
    title: str | None = None,
    workspace_id: str | None = None,
    project_id: str | None = None,
) -> None:
    if not postgres_enabled(settings):
        return

    artifact_title = (
        (title or "").strip()
        or filename.rsplit(".", 1)[0].replace("_", " ").strip()
        or "Untitled artifact"
    )[:160]
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO artifacts (
                    id,
                    user_id,
                    workspace_id,
                    project_id,
                    title,
                    original_filename,
                    storage_path,
                    mime_type,
                    file_size_bytes,
                    page_count,
                    source_type,
                    status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'upload', 'uploaded')
                ON CONFLICT (id)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    workspace_id = EXCLUDED.workspace_id,
                    project_id = EXCLUDED.project_id,
                    original_filename = EXCLUDED.original_filename,
                    storage_path = EXCLUDED.storage_path,
                    mime_type = EXCLUDED.mime_type,
                    file_size_bytes = EXCLUDED.file_size_bytes,
                    page_count = EXCLUDED.page_count,
                    updated_at = NOW()
                """,
                (
                    artifact_id,
                    user_id,
                    workspace_id,
                    project_id,
                    artifact_title,
                    filename,
                    storage_path,
                    mime_type,
                    file_size_bytes,
                    page_count,
                ),
            )
            conn.commit()


def list_recent_artifacts(
    settings,
    *,
    user_id: str,
    limit: int = 12,
    workspace_id: str | None = None,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    if not postgres_enabled(settings):
        return []

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text AS id,
                    title,
                    original_filename AS filename,
                    mime_type,
                    file_size_bytes AS size_bytes,
                    page_count,
                    source_type,
                    status,
                    created_at,
                    updated_at
                FROM artifacts
                WHERE user_id = %s AND status <> 'archived'
                  AND (%s::uuid IS NULL OR workspace_id = %s::uuid)
                  AND (%s::uuid IS NULL OR project_id = %s::uuid)
                ORDER BY updated_at DESC, created_at DESC
                LIMIT %s
                """,
                (
                    user_id,
                    workspace_id,
                    workspace_id,
                    project_id,
                    project_id,
                    limit,
                ),
            )
            rows = cur.fetchall()
            return list(rows)


def get_artifact_for_user(
    settings,
    *,
    artifact_id: str,
    user_id: str,
) -> dict[str, Any] | None:
    """Return one artifact only when it belongs to the authenticated user."""
    if not postgres_enabled(settings):
        return None

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text AS id,
                    title,
                    original_filename AS filename,
                    storage_path,
                    mime_type,
                    file_size_bytes AS size_bytes,
                    page_count
                FROM artifacts
                WHERE id = %s AND user_id = %s AND status <> 'archived'
                """,
                (artifact_id, user_id),
            )
            return cur.fetchone()


def load_conversation_messages(
    settings,
    *,
    user_id: str,
    conversation_id: str,
) -> list[dict[str, Any]]:
    if not postgres_enabled(settings):
        return []

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    m.id::text AS id,
                    m.role,
                    m.content,
                    m.created_at,
                    m.metadata,
                    m.retrieval_ms,
                    m.llm_ms,
                    m.total_ms,
                    m.message_status
                FROM messages m
                JOIN conversations c ON c.id = m.conversation_id
                WHERE c.user_id = %s AND c.id = %s
                ORDER BY m.created_at ASC, m.id ASC
                """,
                (user_id, conversation_id),
            )
            rows = cur.fetchall()
            return list(rows)


def ensure_coding_task_schema(settings) -> None:
    """Apply the additive coding-task schema for existing installations."""
    if not postgres_enabled(settings):
        return
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS coding_tasks (
                    id UUID PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
                    repository_full_name TEXT NOT NULL,
                    branch TEXT NOT NULL DEFAULT 'main',
                    task_type TEXT NOT NULL CHECK (
                        task_type IN ('explain', 'review', 'analyze', 'implement')
                    ),
                    goal TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'planning' CHECK (
                        status IN (
                            'planning', 'running', 'waiting_approval', 'testing',
                            'completed', 'failed', 'cancelled'
                        )
                    ),
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
                  CREATE TABLE IF NOT EXISTS coding_agent_runs (
                      id UUID PRIMARY KEY,
                      task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
                      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                      idempotency_key TEXT NOT NULL,
                      status TEXT NOT NULL DEFAULT 'queued' CHECK (
                          status IN (
                              'queued', 'running', 'waiting_approval',
                              'completed', 'failed', 'cancelled'
                          )
                      ),
                      model TEXT NOT NULL,
                      request JSONB NOT NULL DEFAULT '{}'::jsonb,
                      phase TEXT NOT NULL DEFAULT 'queued',
                      checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
                      lease_owner TEXT,
                      lease_expires_at TIMESTAMPTZ,
                      cancel_requested_at TIMESTAMPTZ,
                      error TEXT NOT NULL DEFAULT '',
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      started_at TIMESTAMPTZ,
                      completed_at TIMESTAMPTZ,
                      UNIQUE(task_id, idempotency_key)
                  );
                  CREATE TABLE IF NOT EXISTS coding_agent_output_events (
                      sequence BIGSERIAL PRIMARY KEY,
                      id UUID NOT NULL,
                      run_id UUID NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE,
                      event_type TEXT NOT NULL,
                      payload JSONB NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      UNIQUE(run_id, id)
                  );
                  CREATE TABLE IF NOT EXISTS coding_agent_messages (
                      id UUID PRIMARY KEY,
                      task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
                      run_id UUID NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE,
                      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                      content TEXT NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      UNIQUE(run_id, role)
                  );
                  CREATE TABLE IF NOT EXISTS coding_agent_steps (
                      id UUID PRIMARY KEY,
                      run_id UUID NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE,
                      step_key TEXT NOT NULL,
                      position INTEGER NOT NULL DEFAULT 0,
                      title TEXT NOT NULL DEFAULT '',
                      tool TEXT NOT NULL DEFAULT '',
                      reason TEXT NOT NULL DEFAULT '',
                      status TEXT NOT NULL DEFAULT 'pending',
                      attempt INTEGER NOT NULL DEFAULT 0,
                      max_attempts INTEGER NOT NULL DEFAULT 1,
                      result JSONB NOT NULL DEFAULT '{}'::jsonb,
                      error TEXT NOT NULL DEFAULT '',
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      started_at TIMESTAMPTZ,
                      completed_at TIMESTAMPTZ,
                      UNIQUE(run_id, step_key)
                  );
                  CREATE TABLE IF NOT EXISTS coding_agent_checkpoints (
                      id UUID PRIMARY KEY,
                      run_id UUID NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE,
                      output_sequence BIGINT REFERENCES coding_agent_output_events(sequence)
                          ON DELETE SET NULL,
                      phase TEXT NOT NULL,
                      checkpoint_type TEXT NOT NULL,
                      state JSONB NOT NULL DEFAULT '{}'::jsonb,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                  );
                  CREATE TABLE IF NOT EXISTS coding_worker_heartbeats (
                      worker_id TEXT PRIMARY KEY,
                      hostname TEXT NOT NULL DEFAULT '',
                      process_id INTEGER,
                      status TEXT NOT NULL DEFAULT 'idle',
                      current_task_id UUID,
                      current_run_id UUID,
                      phase TEXT NOT NULL DEFAULT 'idle',
                      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                  );
                CREATE TABLE IF NOT EXISTS coding_approvals (
                    id UUID PRIMARY KEY,
                    task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    action TEXT NOT NULL CHECK (
                        action IN (
                            'run_command', 'apply_patch', 'run_tests',
                            'create_commit', 'create_pull_request',
                            'start_preview'
                        )
                    ),
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    payload_hash TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK (
                        status IN (
                            'pending', 'approved', 'rejected',
                            'consumed', 'expired'
                        )
                    ),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    resolved_at TIMESTAMPTZ,
                    consumed_at TIMESTAMPTZ
                );
                ALTER TABLE coding_approvals
                    DROP CONSTRAINT IF EXISTS coding_approvals_action_check;
                ALTER TABLE coding_approvals
                    ADD CONSTRAINT coding_approvals_action_check CHECK (
                        action IN (
                            'run_command', 'apply_patch', 'run_tests',
                            'create_commit', 'create_pull_request',
                            'start_preview'
                        )
                    );
                CREATE TABLE IF NOT EXISTS coding_previews (
                    id UUID PRIMARY KEY,
                    task_id UUID NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL UNIQUE,
                    port INTEGER NOT NULL CHECK (port BETWEEN 1024 AND 65535),
                    command TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'running' CHECK (
                        status IN ('running', 'stopped', 'expired')
                    ),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    stopped_at TIMESTAMPTZ
                );
                CREATE INDEX IF NOT EXISTS idx_coding_tasks_scope
                    ON coding_tasks(user_id, workspace_id, project_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_coding_tasks_repository
                    ON coding_tasks(user_id, repository_full_name, updated_at DESC);
                  CREATE INDEX IF NOT EXISTS idx_coding_task_events_task
                      ON coding_task_events(task_id, created_at ASC);
                  CREATE INDEX IF NOT EXISTS idx_coding_agent_runs_task
                      ON coding_agent_runs(task_id, created_at DESC);
                  CREATE INDEX IF NOT EXISTS idx_coding_agent_runs_lease
                      ON coding_agent_runs(status, lease_expires_at);
                  CREATE INDEX IF NOT EXISTS idx_coding_agent_output_run
                      ON coding_agent_output_events(run_id, sequence ASC);
                  CREATE INDEX IF NOT EXISTS idx_coding_agent_messages_task
                      ON coding_agent_messages(task_id, created_at ASC);
                  CREATE INDEX IF NOT EXISTS idx_coding_agent_steps_run
                      ON coding_agent_steps(run_id, position ASC, created_at ASC);
                CREATE INDEX IF NOT EXISTS idx_coding_agent_checkpoints_run
                      ON coding_agent_checkpoints(run_id, created_at DESC);
                  CREATE INDEX IF NOT EXISTS idx_coding_worker_heartbeats_seen
                      ON coding_worker_heartbeats(last_seen_at DESC);
                CREATE INDEX IF NOT EXISTS idx_coding_approvals_task
                    ON coding_approvals(task_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_coding_approvals_pending
                    ON coding_approvals(user_id, status, expires_at);
                CREATE INDEX IF NOT EXISTS idx_coding_previews_task
                    ON coding_previews(task_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_coding_previews_token
                    ON coding_previews(token_hash, expires_at);
                """
            )
            cur.execute(
                """
                ALTER TABLE coding_worker_heartbeats
                    ADD COLUMN IF NOT EXISTS current_task_id UUID
                """
            )
            cur.execute(
                """
                ALTER TABLE coding_tasks
                    ADD COLUMN IF NOT EXISTS source JSONB NOT NULL DEFAULT '{}'::jsonb,
                    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'ask',
                    ADD COLUMN IF NOT EXISTS effort_profile TEXT NOT NULL DEFAULT 'fast',
                    ADD COLUMN IF NOT EXISTS goal_spec JSONB NOT NULL DEFAULT '{}'::jsonb;
                UPDATE coding_tasks
                SET source = CASE
                    WHEN repository_full_name LIKE 'local:%' THEN jsonb_build_object(
                        'kind', 'local_git', 'workspaceSlug', substring(repository_full_name FROM 7),
                        'branch', branch, 'snapshotId', ''
                    )
                    ELSE jsonb_build_object(
                        'kind', 'github', 'fullName', repository_full_name, 'branch', branch
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
                """
            )
            conn.commit()


def get_coding_preferences(settings, *, user_id: str) -> dict[str, Any]:
    defaults = {
        "onboardingVersion": 0,
        "defaultInteractionMode": "plan",
        "defaultEffortProfile": "balanced",
        "lastSource": None,
        "onboardingPersona": None,
        "onboardingHeardAbout": None,
        "onboardingUseCase": None,
        "onboardingWorkspaceName": None,
        "onboardingStep": None,
    }
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(preferences -> 'coding', '{}'::jsonb) AS coding
                FROM user_profiles
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone() or {}
    stored = row.get("coding") or {}
    return {**defaults, **stored}


def update_coding_preferences(
    settings,
    *,
    user_id: str,
    preferences: dict[str, Any],
) -> dict[str, Any]:
    current = get_coding_preferences(settings, user_id=user_id)
    updated = {**current, **preferences}
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_profiles (user_id, preferences)
                VALUES (%s, jsonb_build_object('coding', %s::jsonb))
                ON CONFLICT (user_id) DO UPDATE SET
                    preferences = jsonb_set(
                        COALESCE(user_profiles.preferences, '{}'::jsonb),
                        '{coding}',
                        %s::jsonb,
                        TRUE
                    ),
                    updated_at = NOW()
                """,
                (user_id, json.dumps(updated), json.dumps(updated)),
            )
            conn.commit()
    return updated


def upsert_coding_worker_heartbeat(
    settings,
    *,
    worker_id: str,
    hostname: str,
    process_id: int,
    status: str = "idle",
    current_task_id: str | None = None,
    current_run_id: str | None = None,
    phase: str = "idle",
) -> dict[str, Any] | None:
    """Publish a worker heartbeat so the API and UI can report execution capacity."""
    if not postgres_enabled(settings):
        return None
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO coding_worker_heartbeats (
                    worker_id, hostname, process_id, status,
                    current_task_id, current_run_id, phase
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (worker_id) DO UPDATE SET
                    hostname = EXCLUDED.hostname,
                    process_id = EXCLUDED.process_id,
                    status = EXCLUDED.status,
                    current_task_id = EXCLUDED.current_task_id,
                    current_run_id = EXCLUDED.current_run_id,
                    phase = EXCLUDED.phase,
                    last_seen_at = NOW()
                RETURNING worker_id, hostname, process_id, status,
                          current_task_id::text, current_run_id::text,
                          phase, started_at, last_seen_at
                """,
                (
                    worker_id[:160], hostname[:255], process_id, status[:40],
                    current_task_id, current_run_id, phase[:80],
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def list_coding_worker_heartbeats(
    settings,
    *,
    stale_after_seconds: int = 20,
) -> list[dict[str, Any]]:
    if not postgres_enabled(settings):
        return []
    bounded = max(5, min(stale_after_seconds, 120))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT worker_id, hostname, process_id, status,
                       current_task_id::text, current_run_id::text,
                       phase, started_at, last_seen_at,
                       last_seen_at >= NOW() - (%s * INTERVAL '1 second') AS connected
                FROM coding_worker_heartbeats
                ORDER BY connected DESC, last_seen_at DESC
                """,
                (bounded,),
            )
            return [dict(row) for row in cur.fetchall()]


def create_coding_task(
    settings,
    *,
    user_id: str,
    workspace_id: str,
    project_id: str | None,
    repository_full_name: str,
    branch: str,
    task_type: str,
    goal: str,
    source: dict[str, Any] | None = None,
    interaction_mode: str = "ask",
    effort_profile: str = "fast",
    goal_spec: dict[str, Any] | None = None,
) -> dict[str, Any]:
    task_id = str(uuid4())
    event_id = str(uuid4())
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM workspaces WHERE id = %s AND owner_user_id = %s",
                (workspace_id, user_id),
            )
            if not cur.fetchone():
                raise ValueError("Workspace was not found.")
            if project_id:
                cur.execute(
                    """
                    SELECT 1 FROM projects
                    WHERE id = %s AND workspace_id = %s
                      AND owner_user_id = %s AND status = 'active'
                    """,
                    (project_id, workspace_id, user_id),
                )
                if not cur.fetchone():
                    raise ValueError("Project was not found.")
            cur.execute(
                """
                INSERT INTO coding_tasks (
                    id, user_id, workspace_id, project_id,
                    repository_full_name, branch, task_type, goal,
                    source, interaction_mode, effort_profile, goal_spec
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb)
                RETURNING
                    id::text, workspace_id::text, project_id::text,
                    repository_full_name, branch, task_type, goal, status,
                    source, interaction_mode, effort_profile, goal_spec,
                    result, error, created_at, updated_at, started_at, completed_at
                """,
                (
                    task_id,
                    user_id,
                    workspace_id,
                    project_id,
                    repository_full_name[:240],
                    branch[:255] or "main",
                    task_type,
                    goal[:4_000],
                    json.dumps(source or {}),
                    interaction_mode,
                    effort_profile,
                    json.dumps(goal_spec or {}),
                ),
            )
            task = dict(cur.fetchone())
            cur.execute(
                """
                INSERT INTO coding_task_events (
                    id, task_id, event_type, phase, message, metadata
                )
                VALUES (%s, %s, 'task_created', 'planning', %s, '{}'::jsonb)
                """,
                (event_id, task_id, goal[:1_000]),
            )
            conn.commit()
            return task


def list_coding_tasks(
    settings,
    *,
    user_id: str,
    workspace_id: str,
    project_id: str | None = None,
    repository_full_name: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    bounded = max(1, min(limit, 100))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, workspace_id::text, project_id::text,
                    repository_full_name, branch, task_type, goal, status,
                    source, interaction_mode, effort_profile, goal_spec,
                    result, error, created_at, updated_at, started_at, completed_at
                FROM coding_tasks
                WHERE user_id = %s AND workspace_id = %s
                  AND (%s::uuid IS NULL OR project_id = %s::uuid)
                  AND (%s::text IS NULL OR repository_full_name = %s::text)
                ORDER BY updated_at DESC
                LIMIT %s
                """,
                (
                    user_id,
                    workspace_id,
                    project_id,
                    project_id,
                    repository_full_name,
                    repository_full_name,
                    bounded,
                ),
            )
            return [dict(row) for row in cur.fetchall()]


def get_coding_task(
    settings,
    *,
    user_id: str,
    task_id: str,
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, workspace_id::text, project_id::text,
                    repository_full_name, branch, task_type, goal, status,
                    source, interaction_mode, effort_profile, goal_spec,
                    result, error, created_at, updated_at, started_at, completed_at
                FROM coding_tasks
                WHERE id = %s AND user_id = %s
                """,
                (task_id, user_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            task = dict(row)
            cur.execute(
                """
                SELECT
                    id::text, event_type, phase, message, metadata, created_at
                FROM coding_task_events
                WHERE task_id = %s
                ORDER BY created_at ASC, id ASC
                """,
                (task_id,),
            )
            task["events"] = [dict(event) for event in cur.fetchall()]
            return task


def append_coding_task_event(
    settings,
    *,
    user_id: str,
    task_id: str,
    event_type: str,
    phase: str = "",
    message: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event_id = str(uuid4())
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM coding_tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            if not cur.fetchone():
                raise ValueError("Coding task was not found.")
            cur.execute(
                """
                INSERT INTO coding_task_events (
                    id, task_id, event_type, phase, message, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id::text, event_type, phase, message, metadata, created_at
                """,
                (
                    event_id,
                    task_id,
                    event_type[:80],
                    phase[:80],
                    message[:4_000],
                    json.dumps(metadata or {}),
                ),
            )
            event = dict(cur.fetchone())
            cur.execute(
                "UPDATE coding_tasks SET updated_at = NOW() WHERE id = %s",
                (task_id,),
            )
            conn.commit()
            return event


def update_coding_task(
    settings,
    *,
    user_id: str,
    task_id: str,
    status: str,
    result: str = "",
    error: str = "",
) -> dict[str, Any] | None:
    if status not in _CODING_TASK_STATUSES:
        raise ValueError("Invalid coding task status.")
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_tasks
                SET status = %s,
                    result = CASE WHEN %s <> '' THEN %s ELSE result END,
                    error = CASE WHEN %s <> '' THEN %s ELSE error END,
                    started_at = CASE
                        WHEN %s = 'running' THEN COALESCE(started_at, NOW())
                        ELSE started_at
                    END,
                    completed_at = CASE
                        WHEN %s IN ('completed', 'failed', 'cancelled') THEN NOW()
                        ELSE completed_at
                    END,
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s
                RETURNING
                    id::text, workspace_id::text, project_id::text,
                    repository_full_name, branch, task_type, goal, status,
                    source, interaction_mode, effort_profile, goal_spec,
                    result, error, created_at, updated_at, started_at, completed_at
                """,
                (
                    status,
                    result,
                    result[:100_000],
                    error,
                    error[:4_000],
                    status,
                    status,
                    task_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def configure_coding_task(
    settings,
    *,
    user_id: str,
    task_id: str,
    interaction_mode: str,
    effort_profile: str,
    goal_spec: dict[str, Any],
) -> dict[str, Any] | None:
    if interaction_mode not in {"ask", "plan", "build"}:
        raise ValueError("Invalid coding interaction mode.")
    if effort_profile not in {"fast", "balanced", "deep"}:
        raise ValueError("Invalid coding effort profile.")
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_tasks
                SET interaction_mode = %s,
                    effort_profile = %s,
                    goal_spec = %s::jsonb,
                    goal = COALESCE(NULLIF(%s, ''), goal),
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s
                RETURNING
                    id::text, workspace_id::text, project_id::text,
                    repository_full_name, branch, task_type, goal, status,
                    source, interaction_mode, effort_profile, goal_spec,
                    result, error, created_at, updated_at, started_at, completed_at
                """,
                (
                    interaction_mode,
                    effort_profile,
                    json.dumps(goal_spec),
                    str(goal_spec.get("objective") or "")[:4_000],
                    task_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def create_or_get_coding_agent_run(
    settings,
    *,
    user_id: str,
    task_id: str,
    idempotency_key: str,
    model: str,
    request: dict[str, Any],
    source: dict[str, Any] | None = None,
    interaction_mode: str = "ask",
    effort_profile: str = "fast",
    goal_spec: dict[str, Any] | None = None,
    parent_run_id: str | None = None,
    orchestration_role: str = "orchestrator",
) -> dict[str, Any]:
    """Create one durable run for a client request, or return its existing run."""
    run_id = str(uuid4())
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM coding_tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            if not cur.fetchone():
                raise ValueError("Coding task was not found.")
            cur.execute(
                """
                INSERT INTO coding_agent_runs (
                    id, task_id, user_id, idempotency_key, model, request,
                    source, interaction_mode, effort_profile, goal_spec,
                    parent_run_id, orchestration_role
                )
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (task_id, idempotency_key) DO NOTHING
                RETURNING
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    source, interaction_mode, effort_profile, goal_spec,
                    parent_run_id::text, orchestration_role,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                """,
                (
                    run_id,
                    task_id,
                    user_id,
                    idempotency_key[:128],
                    model[:160],
                    json.dumps(request),
                    json.dumps(source or {}),
                    interaction_mode,
                    effort_profile,
                    json.dumps(goal_spec or {}),
                    parent_run_id,
                    orchestration_role[:80],
                ),
            )
            row = cur.fetchone()
            created = row is not None
            if row is None:
                cur.execute(
                    """
                    SELECT
                        id::text, task_id::text, idempotency_key, status, model,
                        request, phase, checkpoint, lease_owner, lease_expires_at,
                        source, interaction_mode, effort_profile, goal_spec,
                        parent_run_id::text, orchestration_role,
                        cancel_requested_at, error, created_at, updated_at,
                        started_at, completed_at
                    FROM coding_agent_runs
                    WHERE task_id = %s AND user_id = %s AND idempotency_key = %s
                    """,
                    (task_id, user_id, idempotency_key[:128]),
                )
                row = cur.fetchone()
            conn.commit()
            if row is None:
                raise RuntimeError("The coding agent run could not be created.")
            run = dict(row)
            run["created"] = created
            run["request_matches"] = (
                str(run.get("model") or "") == model[:160]
                and (run.get("request") or {}) == request
            )
            prompt = str(request.get("prompt") or "").strip()
            cur.execute(
                """
                INSERT INTO coding_agent_messages (
                    id, task_id, run_id, user_id, role, content
                )
                SELECT
                    %s, tasks.id, runs.id, runs.user_id, 'user',
                    COALESCE(NULLIF(%s, ''), tasks.goal)
                FROM coding_agent_runs AS runs
                JOIN coding_tasks AS tasks ON tasks.id = runs.task_id
                WHERE runs.id = %s AND runs.user_id = %s
                ON CONFLICT (run_id, role) DO NOTHING
                """,
                (str(uuid4()), prompt[:4_000], run["id"], user_id),
            )
            conn.commit()
            return run


def get_coding_agent_run(
    settings,
    *,
    user_id: str,
    task_id: str,
    run_id: str,
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    source, interaction_mode, effort_profile, goal_spec,
                    parent_run_id::text, orchestration_role,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                FROM coding_agent_runs
                WHERE id = %s AND task_id = %s AND user_id = %s
                """,
                (run_id, task_id, user_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def list_coding_agent_runs(
    settings,
    *,
    user_id: str,
    task_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return a task's durable agent runs in conversation order."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, source, interaction_mode,
                    effort_profile, goal_spec, parent_run_id::text,
                    orchestration_role, error, created_at, updated_at,
                    started_at, completed_at
                FROM coding_agent_runs
                WHERE task_id = %s AND user_id = %s
                ORDER BY created_at ASC, id ASC
                LIMIT %s
                """,
                (task_id, user_id, max(1, min(limit, 200))),
            )
            return [dict(row) for row in cur.fetchall()]


def list_coding_agent_task_outputs(
    settings,
    *,
    user_id: str,
    task_id: str,
    after_sequence: int = 0,
    limit: int = 5_000,
) -> list[dict[str, Any]]:
    """Return ordered stream events for every run owned by one task."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    output.sequence, output.id::text, output.run_id::text,
                    output.event_type, output.payload, output.created_at
                FROM coding_agent_output_events AS output
                JOIN coding_agent_runs AS runs ON runs.id = output.run_id
                WHERE runs.task_id = %s AND runs.user_id = %s
                  AND output.sequence > %s
                ORDER BY output.sequence ASC
                LIMIT %s
                """,
                (
                    task_id,
                    user_id,
                    max(0, after_sequence),
                    max(1, min(limit, 10_000)),
                ),
            )
            return [dict(row) for row in cur.fetchall()]


def append_coding_agent_message(
    settings,
    *,
    user_id: str,
    task_id: str,
    run_id: str,
    role: str,
    content: str,
) -> dict[str, Any]:
    if role not in {"user", "assistant"}:
        raise ValueError("Invalid coding agent message role.")
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO coding_agent_messages (
                    id, task_id, run_id, user_id, role, content
                )
                SELECT %s, runs.task_id, runs.id, runs.user_id, %s, %s
                FROM coding_agent_runs AS runs
                WHERE runs.id = %s AND runs.task_id = %s AND runs.user_id = %s
                ON CONFLICT (run_id, role)
                DO UPDATE SET content = EXCLUDED.content
                RETURNING
                    id::text, task_id::text, run_id::text, role, content, created_at
                """,
                (
                    str(uuid4()),
                    role,
                    content[:100_000],
                    run_id,
                    task_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Coding agent run was not found.")
            conn.commit()
            return dict(row)


def list_coding_agent_messages(
    settings,
    *,
    user_id: str,
    task_id: str,
    limit: int = 400,
) -> list[dict[str, Any]]:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    messages.id::text, messages.task_id::text,
                    messages.run_id::text, messages.role,
                    messages.content, messages.created_at
                FROM coding_agent_messages AS messages
                WHERE messages.task_id = %s AND messages.user_id = %s
                ORDER BY messages.created_at ASC, messages.id ASC
                LIMIT %s
                """,
                (task_id, user_id, max(1, min(limit, 2_000))),
            )
            return [dict(row) for row in cur.fetchall()]


def acquire_coding_agent_run_lease(
    settings,
    *,
    user_id: str,
    task_id: str,
    run_id: str,
    lease_owner: str,
    lease_seconds: int = 30,
) -> dict[str, Any] | None:
    """Atomically claim a queued run or an expired execution lease."""
    bounded_lease = max(10, min(lease_seconds, 300))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_agent_runs
                SET status = 'running',
                    phase = CASE WHEN phase = 'queued' THEN 'retrieving' ELSE phase END,
                    lease_owner = %s,
                    lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                    started_at = COALESCE(started_at, NOW()),
                    updated_at = NOW()
                WHERE id = %s AND task_id = %s AND user_id = %s
                  AND cancel_requested_at IS NULL
                  AND status IN ('queued', 'running')
                  AND (
                      status = 'queued'
                      OR lease_expires_at IS NULL
                      OR lease_expires_at <= NOW()
                      OR lease_owner = %s
                  )
                RETURNING
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    source, interaction_mode, effort_profile, goal_spec,
                    parent_run_id::text, orchestration_role,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                """,
                (
                    lease_owner[:160],
                    bounded_lease,
                    run_id,
                    task_id,
                    user_id,
                    lease_owner[:160],
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def claim_next_coding_agent_run(
    settings,
    *,
    lease_owner: str,
    lease_seconds: int = 30,
) -> dict[str, Any] | None:
    """Claim the oldest runnable agent job for a dedicated worker process."""
    bounded_lease = max(10, min(lease_seconds, 300))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH candidate AS (
                    SELECT runs.id
                    FROM coding_agent_runs AS runs
                    WHERE runs.status IN ('queued', 'running')
                      AND runs.cancel_requested_at IS NULL
                      AND (
                          runs.status = 'queued'
                          OR runs.lease_expires_at IS NULL
                          OR runs.lease_expires_at <= NOW()
                      )
                    ORDER BY
                        CASE WHEN runs.status = 'queued' THEN 0 ELSE 1 END,
                        runs.created_at ASC,
                        runs.id ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE coding_agent_runs AS runs
                SET status = 'running',
                    phase = CASE WHEN runs.phase = 'queued' THEN 'retrieving' ELSE runs.phase END,
                    lease_owner = %s,
                    lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                    started_at = COALESCE(runs.started_at, NOW()),
                    updated_at = NOW()
                FROM candidate
                JOIN coding_agent_runs AS source ON source.id = candidate.id
                JOIN coding_tasks AS tasks ON tasks.id = source.task_id
                WHERE runs.id = candidate.id
                RETURNING
                    runs.id::text, runs.task_id::text, runs.user_id::text,
                    runs.idempotency_key, runs.status, runs.model, runs.request,
                    runs.phase, runs.checkpoint, runs.lease_owner,
                    runs.source, runs.interaction_mode, runs.effort_profile,
                    runs.goal_spec, runs.parent_run_id::text,
                    runs.orchestration_role,
                    runs.lease_expires_at, runs.cancel_requested_at, runs.error,
                    runs.created_at, runs.updated_at, runs.started_at,
                    runs.completed_at,
                    tasks.repository_full_name, tasks.branch, tasks.task_type,
                    tasks.goal, tasks.workspace_id::text AS workspace_id,
                    tasks.project_id::text AS project_id
                """,
                (
                    lease_owner[:160],
                    bounded_lease,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def renew_coding_agent_run_lease(
    settings,
    *,
    user_id: str,
    run_id: str,
    lease_owner: str,
    lease_seconds: int = 30,
) -> bool:
    bounded_lease = max(10, min(lease_seconds, 300))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_agent_runs
                SET lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s AND lease_owner = %s
                  AND status = 'running' AND cancel_requested_at IS NULL
                """,
                (bounded_lease, run_id, user_id, lease_owner[:160]),
            )
            renewed = cur.rowcount == 1
            conn.commit()
            return renewed


def update_coding_agent_run(
    settings,
    *,
    user_id: str,
    run_id: str,
    status: str,
    phase: str,
    checkpoint: dict[str, Any] | None = None,
    error: str = "",
    lease_owner: str | None = None,
) -> dict[str, Any] | None:
    if status not in _CODING_AGENT_RUN_STATUSES:
        raise ValueError("Invalid coding agent run status.")
    terminal = status in {"completed", "failed", "cancelled"}
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_agent_runs
                SET status = %s,
                    phase = %s,
                    checkpoint = CASE
                        WHEN %s::jsonb <> '{}'::jsonb THEN %s::jsonb
                        ELSE checkpoint
                    END,
                    error = CASE WHEN %s <> '' THEN %s ELSE error END,
                    lease_owner = CASE WHEN %s THEN NULL ELSE lease_owner END,
                    lease_expires_at = CASE WHEN %s THEN NULL ELSE lease_expires_at END,
                    completed_at = CASE WHEN %s THEN NOW() ELSE completed_at END,
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s
                  AND (%s::text IS NULL OR lease_owner = %s::text)
                RETURNING
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    source, interaction_mode, effort_profile, goal_spec,
                    parent_run_id::text, orchestration_role,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                """,
                (
                    status,
                    phase[:80],
                    json.dumps(checkpoint or {}),
                    json.dumps(checkpoint or {}),
                    error,
                    error[:4_000],
                    terminal,
                    terminal,
                    terminal,
                    run_id,
                    user_id,
                    lease_owner,
                    lease_owner,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def request_coding_agent_run_cancel(
    settings,
    *,
    user_id: str,
    task_id: str,
    run_id: str,
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_agent_runs
                SET cancel_requested_at = COALESCE(cancel_requested_at, NOW()),
                    status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
                    phase = CASE WHEN status = 'queued' THEN 'cancelled' ELSE phase END,
                    completed_at = CASE
                        WHEN status = 'queued' THEN COALESCE(completed_at, NOW())
                        ELSE completed_at
                    END,
                    updated_at = NOW()
                WHERE id = %s AND task_id = %s AND user_id = %s
                  AND status NOT IN ('completed', 'failed', 'cancelled')
                RETURNING
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                """,
                (run_id, task_id, user_id),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def append_coding_agent_output(
    settings,
    *,
    user_id: str,
    run_id: str,
    event_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Append one idempotent SSE payload to the durable ordered run log."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO coding_agent_output_events (
                    id, run_id, event_type, payload
                )
                SELECT %s, runs.id, %s, %s::jsonb
                FROM coding_agent_runs AS runs
                WHERE runs.id = %s AND runs.user_id = %s
                ON CONFLICT (run_id, id) DO UPDATE SET event_type = EXCLUDED.event_type
                RETURNING sequence, id::text, run_id::text, event_type, payload, created_at
                """,
                (
                    event_id,
                    event_type[:120],
                    json.dumps(payload),
                    run_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Coding agent run was not found.")
            conn.commit()
            return dict(row)


def list_coding_agent_outputs(
    settings,
    *,
    user_id: str,
    run_id: str,
    after_sequence: int = 0,
    limit: int = 250,
) -> list[dict[str, Any]]:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    output.sequence, output.id::text, output.run_id::text,
                    output.event_type, output.payload, output.created_at
                FROM coding_agent_output_events AS output
                JOIN coding_agent_runs AS runs ON runs.id = output.run_id
                WHERE output.run_id = %s AND runs.user_id = %s
                  AND output.sequence > %s
                ORDER BY output.sequence ASC
                LIMIT %s
                """,
                (run_id, user_id, max(0, after_sequence), max(1, min(limit, 1_000))),
            )
            return [dict(row) for row in cur.fetchall()]


def upsert_coding_agent_step(
    settings,
    *,
    user_id: str,
    run_id: str,
    step: dict[str, Any],
    result: dict[str, Any] | None = None,
    error: str = "",
) -> dict[str, Any]:
    step_key = str(step.get("id") or "").strip()
    if not step_key:
        raise ValueError("A coding agent step id is required.")
    step_id = str(uuid4())
    status = str(step.get("status") or "pending")[:40]
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO coding_agent_steps (
                    id, run_id, step_key, position, title, tool, reason,
                    status, attempt, max_attempts, result, error,
                    orchestration_role, dependencies,
                    started_at, completed_at
                )
                SELECT
                    %s, runs.id, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s::jsonb, %s, %s, %s::jsonb,
                    CASE WHEN %s = 'running' THEN NOW() ELSE NULL END,
                    CASE WHEN %s IN ('completed', 'failed') THEN NOW() ELSE NULL END
                FROM coding_agent_runs AS runs
                WHERE runs.id = %s AND runs.user_id = %s
                ON CONFLICT (run_id, step_key) DO UPDATE SET
                    position = EXCLUDED.position,
                    title = EXCLUDED.title,
                    tool = EXCLUDED.tool,
                    reason = EXCLUDED.reason,
                    status = EXCLUDED.status,
                    attempt = EXCLUDED.attempt,
                    max_attempts = EXCLUDED.max_attempts,
                    result = CASE
                        WHEN EXCLUDED.result <> '{}'::jsonb THEN EXCLUDED.result
                        ELSE coding_agent_steps.result
                    END,
                    error = CASE
                        WHEN EXCLUDED.error <> '' THEN EXCLUDED.error
                        ELSE coding_agent_steps.error
                    END,
                    orchestration_role = EXCLUDED.orchestration_role,
                    dependencies = EXCLUDED.dependencies,
                    started_at = COALESCE(coding_agent_steps.started_at, EXCLUDED.started_at),
                    completed_at = COALESCE(EXCLUDED.completed_at, coding_agent_steps.completed_at),
                    updated_at = NOW()
                RETURNING
                    id::text, run_id::text, step_key, position, title, tool,
                    reason, status, attempt, max_attempts, result, error,
                    orchestration_role, dependencies,
                    created_at, updated_at, started_at, completed_at
                """,
                (
                    step_id,
                    step_key[:160],
                    max(0, int(step.get("position") or 0)),
                    str(step.get("title") or "")[:300],
                    str(step.get("tool") or "")[:100],
                    str(step.get("reason") or "")[:2_000],
                    status,
                    max(0, int(step.get("attempt") or 0)),
                    max(1, int(step.get("max_attempts") or 1)),
                    json.dumps(result or {}),
                    error[:4_000],
                    str(step.get("orchestration_role") or "orchestrator")[:80],
                    json.dumps(step.get("dependencies") or []),
                    status,
                    status,
                    run_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Coding agent run was not found.")
            conn.commit()
            return dict(row)


def append_coding_agent_checkpoint(
    settings,
    *,
    user_id: str,
    run_id: str,
    output_sequence: int | None,
    phase: str,
    checkpoint_type: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    checkpoint_id = str(uuid4())
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO coding_agent_checkpoints (
                    id, run_id, output_sequence, phase, checkpoint_type, state
                )
                SELECT %s, runs.id, %s, %s, %s, %s::jsonb
                FROM coding_agent_runs AS runs
                WHERE runs.id = %s AND runs.user_id = %s
                RETURNING
                    id::text, run_id::text, output_sequence, phase,
                    checkpoint_type, state, created_at
                """,
                (
                    checkpoint_id,
                    output_sequence,
                    phase[:80],
                    checkpoint_type[:120],
                    json.dumps(state),
                    run_id,
                    user_id,
                ),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Coding agent run was not found.")
            conn.commit()
            return dict(row)


def create_coding_approval(
    settings,
    *,
    user_id: str,
    task_id: str,
    action: str,
    title: str,
    description: str,
    payload: dict[str, Any],
    payload_hash: str,
    expires_in_seconds: int = 900,
) -> dict[str, Any]:
    approval_id = str(uuid4())
    bounded_expiry = max(60, min(expires_in_seconds, 3_600))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM coding_tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            if not cur.fetchone():
                raise ValueError("Coding task was not found.")
            cur.execute(
                """
                INSERT INTO coding_approvals (
                    id, task_id, user_id, action, title, description,
                    payload, payload_hash, expires_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s::jsonb, %s,
                    NOW() + (%s * INTERVAL '1 second')
                )
                RETURNING
                    id::text, task_id::text, action, title, description,
                    payload, status, created_at, expires_at, resolved_at,
                    consumed_at
                """,
                (
                    approval_id,
                    task_id,
                    user_id,
                    action,
                    title[:200],
                    description[:2_000],
                    json.dumps(payload),
                    payload_hash,
                    bounded_expiry,
                ),
            )
            approval = dict(cur.fetchone())
            cur.execute(
                """
                UPDATE coding_tasks
                SET status = 'waiting_approval', updated_at = NOW()
                WHERE id = %s
                """,
                (task_id,),
            )
            conn.commit()
            return approval


def decide_coding_approval(
    settings,
    *,
    user_id: str,
    task_id: str,
    approval_id: str,
    approved: bool,
) -> dict[str, Any] | None:
    status = "approved" if approved else "rejected"
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_approvals
                SET status = CASE
                        WHEN expires_at <= NOW() THEN 'expired'
                        ELSE %s
                    END,
                    resolved_at = NOW()
                WHERE id = %s AND task_id = %s AND user_id = %s
                  AND status = 'pending'
                RETURNING
                    id::text, task_id::text, action, title, description,
                    payload, status, created_at, expires_at, resolved_at,
                    consumed_at
                """,
                (status, approval_id, task_id, user_id),
            )
            row = cur.fetchone()
            if row:
                approval = dict(row)
                next_task_status = {
                    "approved": "running",
                    "rejected": "planning",
                }.get(approval["status"], "waiting_approval")
                cur.execute(
                    """
                    UPDATE coding_tasks
                    SET status = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (next_task_status, task_id),
                )
            conn.commit()
            return approval if row else None


def consume_coding_approval(
    settings,
    *,
    user_id: str,
    task_id: str,
    approval_id: str,
    action: str,
    payload_hash: str,
) -> dict[str, Any] | None:
    """Atomically consume one unexpired approval for the exact action payload."""
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_approvals
                SET status = 'consumed', consumed_at = NOW()
                WHERE id = %s AND task_id = %s AND user_id = %s
                  AND action = %s AND payload_hash = %s
                  AND status = 'approved' AND expires_at > NOW()
                RETURNING
                    id::text, task_id::text, action, title, description,
                    payload, status, created_at, expires_at, resolved_at,
                    consumed_at
                """,
                (
                    approval_id,
                    task_id,
                    user_id,
                    action,
                    payload_hash,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None


def create_or_get_approved_coding_operation_run(
    settings,
    *,
    user_id: str,
    task_id: str,
    approval_id: str,
    action: str,
    payload: dict[str, Any],
    payload_hash: str,
) -> dict[str, Any] | None:
    """Atomically consume an approval and enqueue its durable worker operation."""
    run_id = str(uuid4())
    idempotency_key = f"approval:{approval_id}"[:128]
    request = {
        "kind": "runtime_operation",
        "action": action,
        "approval_id": approval_id,
        "payload": payload,
    }
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, action, payload, payload_hash, status, expires_at
                FROM coding_approvals
                WHERE id = %s AND task_id = %s AND user_id = %s
                FOR UPDATE
                """,
                (approval_id, task_id, user_id),
            )
            approval_row = cur.fetchone()
            if approval_row is None:
                conn.rollback()
                return None
            approval = dict(approval_row)

            cur.execute(
                """
                SELECT
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                FROM coding_agent_runs
                WHERE task_id = %s AND user_id = %s AND idempotency_key = %s
                """,
                (task_id, user_id, idempotency_key),
            )
            existing_row = cur.fetchone()
            if existing_row is not None:
                existing = dict(existing_row)
                if (
                    approval.get("status") != "consumed"
                    or existing.get("request") != request
                ):
                    conn.rollback()
                    return None
                conn.commit()
                existing["created"] = False
                existing["request_matches"] = True
                return existing

            cur.execute(
                """
                UPDATE coding_approvals
                SET status = 'consumed', consumed_at = NOW()
                WHERE id = %s AND task_id = %s AND user_id = %s
                  AND action = %s AND payload_hash = %s
                  AND status = 'approved' AND expires_at > NOW()
                RETURNING id
                """,
                (
                    approval_id,
                    task_id,
                    user_id,
                    action,
                    payload_hash,
                ),
            )
            if cur.fetchone() is None:
                conn.rollback()
                return None

            cur.execute(
                """
                INSERT INTO coding_agent_runs (
                    id, task_id, user_id, idempotency_key, model, request
                )
                VALUES (%s, %s, %s, %s, 'system/runtime-operation', %s::jsonb)
                RETURNING
                    id::text, task_id::text, idempotency_key, status, model,
                    request, phase, checkpoint, lease_owner, lease_expires_at,
                    cancel_requested_at, error, created_at, updated_at,
                    started_at, completed_at
                """,
                (
                    run_id,
                    task_id,
                    user_id,
                    idempotency_key,
                    json.dumps(request),
                ),
            )
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                raise RuntimeError("The approved coding operation could not be queued.")
            conn.commit()
            run = dict(row)
            run["created"] = True
            run["request_matches"] = True
            return run


def create_coding_preview(
    settings,
    *,
    user_id: str,
    task_id: str,
    token_hash: str,
    port: int,
    command: str,
    expires_in_seconds: int = 3_600,
) -> dict[str, Any]:
    preview_id = str(uuid4())
    bounded_expiry = max(300, min(expires_in_seconds, 86_400))
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM coding_tasks WHERE id = %s AND user_id = %s",
                (task_id, user_id),
            )
            if not cur.fetchone():
                raise ValueError("Coding task was not found.")
            cur.execute(
                """
                UPDATE coding_previews
                SET status = 'stopped', stopped_at = NOW()
                WHERE task_id = %s AND user_id = %s AND status = 'running'
                """,
                (task_id, user_id),
            )
            cur.execute(
                """
                INSERT INTO coding_previews (
                    id, task_id, user_id, token_hash, port, command, expires_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s,
                    NOW() + (%s * INTERVAL '1 second')
                )
                RETURNING
                    id::text, task_id::text, port, command, status,
                    created_at, expires_at, stopped_at
                """,
                (
                    preview_id,
                    task_id,
                    user_id,
                    token_hash,
                    port,
                    command[:2_000],
                    bounded_expiry,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row)


def get_coding_preview_by_token(
    settings,
    *,
    token_hash: str,
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    p.id::text, p.task_id::text, p.user_id::text,
                    p.port, p.command, p.status, p.created_at, p.expires_at,
                    t.repository_full_name
                FROM coding_previews p
                JOIN coding_tasks t ON t.id = p.task_id
                WHERE p.token_hash = %s
                  AND p.status = 'running' AND p.expires_at > NOW()
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def stop_coding_preview(
    settings,
    *,
    user_id: str,
    task_id: str,
    preview_id: str,
) -> dict[str, Any] | None:
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE coding_previews
                SET status = 'stopped', stopped_at = NOW()
                WHERE id = %s AND task_id = %s AND user_id = %s
                  AND status = 'running'
                RETURNING
                    id::text, task_id::text, port, command, status,
                    created_at, expires_at, stopped_at
                """,
                (preview_id, task_id, user_id),
            )
            row = cur.fetchone()
            conn.commit()
            return dict(row) if row else None
