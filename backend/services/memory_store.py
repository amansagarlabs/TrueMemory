"""Lightweight SQLite-backed memory store for conversations and profile facts."""

from __future__ import annotations

import re
import sqlite3
import mimetypes
from datetime import UTC, datetime
from pathlib import Path


PROFILE_TRIGGER_PATTERN = re.compile(
    r"\b(i am|i'm|my name is|my company is|i prefer|i like|"
    r"i work(?:ed)?(?: at| for)?|my role(?:\s+is|\s*:)?\s+[a-z][a-z-]*|"
    r"my skills? (?:are|include)|i have \d+ years?)\b",
    re.IGNORECASE,
)


def _db_path(settings) -> Path:
    configured = Path(settings.memory_db_path).expanduser()
    if configured.is_absolute():
        return configured
    project_root = Path(__file__).resolve().parents[2]
    return (project_root / configured).resolve()


def init_memory_store(settings) -> None:
    path = _db_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS profile_memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                memory_key TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                valid_from TEXT,
                valid_until TEXT,
                confidence REAL NOT NULL DEFAULT 0.75,
                revision INTEGER NOT NULL DEFAULT 1,
                UNIQUE(user_id, doc_id, memory_key)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_conversation_messages_lookup
            ON conversation_messages (conversation_id, created_at)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_profile_memories_lookup
            ON profile_memories (user_id, doc_id, updated_at)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS profile_memory_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL, doc_id TEXT NOT NULL, memory_key TEXT NOT NULL,
                content TEXT NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL,
                valid_from TEXT, valid_until TEXT, confidence REAL NOT NULL, revision INTEGER NOT NULL
            )
            """
        )
        _ensure_local_artifacts_table(conn)
        _ensure_profile_memory_columns(conn)
        conn.commit()


def _connect(settings) -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(settings))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_local_artifacts_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS local_artifacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            page_count INTEGER,
            source_type TEXT NOT NULL DEFAULT 'upload',
            status TEXT NOT NULL DEFAULT 'uploaded',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_local_artifacts_user
        ON local_artifacts (user_id, updated_at DESC)
        """
    )


def _ensure_profile_memory_columns(conn: sqlite3.Connection) -> None:
    columns = {
        str(row[1]) for row in conn.execute("PRAGMA table_info(profile_memories)").fetchall()
    }
    additions = {
        "valid_from": "TEXT",
        "valid_until": "TEXT",
        "confidence": "REAL NOT NULL DEFAULT 0.75",
        "revision": "INTEGER NOT NULL DEFAULT 1",
    }
    for name, definition in additions.items():
        if name not in columns:
            conn.execute(f"ALTER TABLE profile_memories ADD COLUMN {name} {definition}")
def save_local_artifact(
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
) -> None:
    timestamp = datetime.now(UTC).isoformat()
    artifact_title = (
        (title or "").strip()
        or filename.rsplit(".", 1)[0].replace("_", " ").strip()
        or "Untitled artifact"
    )[:160]
    with _connect(settings) as conn:
        _ensure_local_artifacts_table(conn)
        conn.execute(
            """
            INSERT INTO local_artifacts (
                id, user_id, title, original_filename, storage_path, mime_type,
                file_size_bytes, page_count, source_type, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upload', 'uploaded', ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                original_filename = excluded.original_filename,
                storage_path = excluded.storage_path,
                mime_type = excluded.mime_type,
                file_size_bytes = excluded.file_size_bytes,
                page_count = excluded.page_count,
                status = 'uploaded',
                updated_at = excluded.updated_at
            """,
            (
                artifact_id,
                user_id,
                artifact_title,
                filename,
                storage_path,
                mime_type,
                file_size_bytes,
                page_count,
                timestamp,
                timestamp,
            ),
        )
        conn.commit()


def list_local_artifacts(settings, *, user_id: str, limit: int = 12) -> list[dict]:
    _backfill_local_artifacts_from_chat(settings, user_id=user_id)
    with _connect(settings) as conn:
        _ensure_local_artifacts_table(conn)
        rows = conn.execute(
            """
            SELECT
                id,
                title,
                original_filename AS filename,
                storage_path,
                mime_type,
                file_size_bytes AS size_bytes,
                page_count,
                source_type,
                status,
                created_at,
                updated_at
            FROM local_artifacts
            WHERE user_id = ? AND status <> 'archived'
            ORDER BY updated_at DESC, created_at DESC
            LIMIT ?
            """,
            (user_id, max(1, min(limit, 500))),
        ).fetchall()
        return [dict(row) for row in rows]


def _backfill_local_artifacts_from_chat(settings, *, user_id: str) -> None:
    """Index pre-migration uploads only when chat history proves user ownership."""
    from services.pdf_upload import get_uploads_dir

    with _connect(settings) as conn:
        _ensure_local_artifacts_table(conn)
        try:
            document_rows = conn.execute(
                """
                SELECT DISTINCT doc_id
                FROM conversation_messages
                WHERE user_id = ? AND doc_id <> 'general'
                """,
                (user_id,),
            ).fetchall()
        except sqlite3.OperationalError:
            return
        known_ids = {
            row["id"]
            for row in conn.execute(
                "SELECT id FROM local_artifacts WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        }

    if not document_rows:
        return
    uploads_dir = get_uploads_dir(getattr(settings, "uploads_dir", "uploads"))
    for row in document_rows:
        artifact_id = str(row["doc_id"] or "")
        if artifact_id in known_ids or not re.fullmatch(r"[0-9a-fA-F-]{36}", artifact_id):
            continue
        path = next(uploads_dir.glob(f"{artifact_id}_*"), None)
        if not path or not path.is_file():
            continue
        prefix = f"{artifact_id}_"
        filename = path.name[len(prefix):] if path.name.startswith(prefix) else path.name
        save_local_artifact(
            settings,
            artifact_id=artifact_id,
            user_id=user_id,
            filename=filename,
            storage_path=str(path.relative_to(uploads_dir.parent)),
            mime_type=mimetypes.guess_type(filename)[0] or "application/octet-stream",
            file_size_bytes=path.stat().st_size,
            page_count=1,
        )


def get_local_artifact(settings, *, artifact_id: str, user_id: str) -> dict | None:
    with _connect(settings) as conn:
        _ensure_local_artifacts_table(conn)
        row = conn.execute(
            """
            SELECT
                id,
                title,
                original_filename AS filename,
                storage_path,
                mime_type,
                file_size_bytes AS size_bytes,
                page_count
            FROM local_artifacts
            WHERE id = ? AND user_id = ? AND status <> 'archived'
            """,
            (artifact_id, user_id),
        ).fetchone()
        return dict(row) if row else None


def save_message(
    settings,
    *,
    conversation_id: str,
    user_id: str,
    doc_id: str,
    role: str,
    content: str,
) -> int:
    timestamp = datetime.now(UTC).isoformat()
    with _connect(settings) as conn:
        conn.execute(
            """
            INSERT INTO conversation_messages (
                conversation_id, user_id, doc_id, role, content, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (conversation_id, user_id, doc_id, role, content, timestamp),
        )
        conn.commit()
        return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def update_message(
    settings,
    *,
    message_id: int,
    user_id: str,
    content: str,
) -> bool:
    with _connect(settings) as conn:
        cursor = conn.execute(
            """
            UPDATE conversation_messages
            SET content = ?
            WHERE id = ? AND user_id = ? AND role = 'assistant'
            """,
            (content, message_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def get_recent_messages(
    settings,
    *,
    conversation_id: str,
    limit: int,
) -> list[dict]:
    with _connect(settings) as conn:
        rows = conn.execute(
            """
            SELECT role, content
            FROM conversation_messages
            WHERE conversation_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (conversation_id, limit),
        ).fetchall()

    items = [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]
    return items


def get_profile_memories(
    settings,
    *,
    user_id: str,
    doc_id: str,
    limit: int,
    include_history: bool = False,
) -> list[dict]:
    with _connect(settings) as conn:
        if include_history:
            rows = conn.execute(
                """SELECT memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision
                   FROM profile_memory_revisions WHERE user_id = ? AND doc_id = ?
                   ORDER BY updated_at DESC, id DESC LIMIT ?""", (user_id, doc_id, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision
                   FROM profile_memories WHERE user_id = ? AND doc_id = ?
                   ORDER BY updated_at DESC, id DESC LIMIT ?""", (user_id, doc_id, limit)
            ).fetchall()

    return [
        {
            "id": f"profile:{doc_id}:{row['memory_key']}",
            "key": row["memory_key"],
            "content": row["content"],
            "source": row["source"],
            "updated_at": row["updated_at"],
            "valid_from": row["valid_from"],
            "valid_until": row["valid_until"],
            "confidence": row["confidence"],
            "revision": row["revision"],
        }
        for row in rows
    ]


def count_profile_memories(settings, *, user_id: str, doc_id: str) -> int:
    with _connect(settings) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM profile_memories WHERE user_id = ? AND doc_id = ?",
            (user_id, doc_id),
        ).fetchone()
    return int(row["count"] if row else 0)


def search_profile_memories(settings, *, user_id: str, doc_id: str, query: str, limit: int) -> list[dict]:
    """Fast structured/text recall path before semantic retrieval tiers."""
    needle = " ".join(query.split()).strip().lower()
    if not needle:
        return get_profile_memories(settings, user_id=user_id, doc_id=doc_id, limit=limit)
    pattern = f"%{needle}%"
    with _connect(settings) as conn:
        rows = conn.execute(
            """
            SELECT memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision
            FROM profile_memories
            WHERE user_id = ? AND doc_id = ?
              AND (LOWER(memory_key) LIKE ? OR LOWER(content) LIKE ?)
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
            """,
            (user_id, doc_id, pattern, pattern, max(1, min(limit, 500))),
        ).fetchall()
    return [
        {
            "id": f"profile:{doc_id}:{row['memory_key']}",
            "key": row["memory_key"],
            "content": row["content"],
            "source": row["source"],
            "updated_at": row["updated_at"],
            "valid_from": row["valid_from"],
            "valid_until": row["valid_until"],
            "confidence": row["confidence"],
            "revision": row["revision"],
        }
        for row in rows
    ]


def update_profile_memory(settings, *, user_id: str, doc_id: str, memory_key: str, content: str, source: str, valid_from: str | None = None, valid_until: str | None = None, confidence: float = 0.75) -> bool:
    with _connect(settings) as conn:
        current = conn.execute(
            "SELECT memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision FROM profile_memories WHERE user_id = ? AND doc_id = ? AND memory_key = ?",
            (user_id, doc_id, memory_key),
        ).fetchone()
        if current:
            conn.execute(
                "INSERT INTO profile_memory_revisions (user_id, doc_id, memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, doc_id, current["memory_key"], current["content"], current["source"], current["updated_at"], current["valid_from"], current["valid_until"], current["confidence"], current["revision"]),
            )
        cursor = conn.execute(
            """
            UPDATE profile_memories
            SET content = ?, source = ?, updated_at = ?,
                valid_from = COALESCE(?, valid_from),
                valid_until = COALESCE(?, valid_until),
                confidence = ?, revision = revision + 1
            WHERE user_id = ? AND doc_id = ? AND memory_key = ?
            """,
            (content, source, datetime.now(UTC).isoformat(), valid_from, valid_until,
             max(0.0, min(confidence, 1.0)), user_id, doc_id, memory_key),
        )
        conn.commit()
        return cursor.rowcount > 0


def forget_profile_memory(settings, *, user_id: str, doc_id: str, memory_key: str) -> bool:
    with _connect(settings) as conn:
        cursor = conn.execute(
            "DELETE FROM profile_memories WHERE user_id = ? AND doc_id = ? AND memory_key = ?",
            (user_id, doc_id, memory_key),
        )
        conn.execute(
            "DELETE FROM profile_memory_revisions WHERE user_id = ? AND doc_id = ? AND memory_key = ?",
            (user_id, doc_id, memory_key),
        )
        conn.commit()
        return cursor.rowcount > 0


def maybe_store_profile_memory(
    settings,
    *,
    user_id: str,
    doc_id: str,
    question: str,
    answer: str,
) -> None:
    if not PROFILE_TRIGGER_PATTERN.search(question):
        return

    del answer
    declared_fact = " ".join(question.split()).strip()
    if not declared_fact:
        return

    memory_key = classify_profile_memory(question)
    upsert_profile_memory(
        settings,
        user_id=user_id,
        doc_id=doc_id,
        memory_key=memory_key,
        content=declared_fact[:2000],
        source="user-declared",
    )


def classify_profile_memory(question: str) -> str:
    lowered = question.lower()
    if "role" in lowered or "job title" in lowered or "my job" in lowered:
        return "role"
    if "company" in lowered or "work at" in lowered or "work for" in lowered:
        return "company"
    if "experience" in lowered:
        return "experience_summary"
    if "skill" in lowered or "tech" in lowered:
        return "skills_summary"
    if "who is" in lowered or "about" in lowered or "profile" in lowered:
        return "profile_summary"
    return "document_summary"


def upsert_profile_memory(
    settings,
    *,
    user_id: str,
    doc_id: str,
    memory_key: str,
    content: str,
    source: str,
    valid_from: str | None = None,
    valid_until: str | None = None,
    confidence: float = 0.75,
) -> None:
    timestamp = datetime.now(UTC).isoformat()
    with _connect(settings) as conn:
        current = conn.execute(
            "SELECT memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision FROM profile_memories WHERE user_id = ? AND doc_id = ? AND memory_key = ?",
            (user_id, doc_id, memory_key),
        ).fetchone()
        if current:
            conn.execute(
                "INSERT INTO profile_memory_revisions (user_id, doc_id, memory_key, content, source, updated_at, valid_from, valid_until, confidence, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, doc_id, current["memory_key"], current["content"], current["source"], current["updated_at"], current["valid_from"], current["valid_until"], current["confidence"], current["revision"]),
            )
        conn.execute(
            """
            INSERT INTO profile_memories (
                user_id, doc_id, memory_key, content, source, created_at, updated_at,
                valid_from, valid_until, confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, doc_id, memory_key)
            DO UPDATE SET
                content = excluded.content,
                source = excluded.source,
                valid_from = COALESCE(excluded.valid_from, profile_memories.valid_from),
                valid_until = excluded.valid_until,
                confidence = excluded.confidence,
                revision = profile_memories.revision + 1,
                updated_at = excluded.updated_at
            """,
            (user_id, doc_id, memory_key, content, source, timestamp, timestamp,
             valid_from, valid_until, max(0.0, min(confidence, 1.0))),
        )
        conn.commit()


def sync_account_profile_memories(
    settings,
    *,
    user_id: str,
    profile: dict,
) -> None:
    """Mirror public account-profile fields into the durable general memory scope."""
    fields = {
        "full_name": profile.get("full_name"),
        "username": profile.get("username"),
        "bio": profile.get("bio"),
        "company": profile.get("company"),
        "location": profile.get("location"),
        "website": profile.get("website"),
    }
    full_name = str(fields["full_name"] or "").strip().casefold()
    username = str(fields["username"] or "").strip().casefold()
    if full_name and username == full_name:
        fields["username"] = None
    timestamp = datetime.now(UTC).isoformat()
    with _connect(settings) as conn:
        for field, value in fields.items():
            memory_key = f"account_{field}"
            normalized = str(value).strip() if value is not None else ""
            if not normalized:
                conn.execute(
                    """
                    DELETE FROM profile_memories
                    WHERE user_id = ? AND doc_id = 'general' AND memory_key = ?
                    """,
                    (user_id, memory_key),
                )
                continue
            conn.execute(
                """
                INSERT INTO profile_memories (
                    user_id, doc_id, memory_key, content, source, created_at, updated_at
                ) VALUES (?, 'general', ?, ?, 'account-profile', ?, ?)
                ON CONFLICT(user_id, doc_id, memory_key)
                DO UPDATE SET
                    content = excluded.content,
                    source = excluded.source,
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    memory_key,
                    normalized[:1000],
                    timestamp,
                    timestamp,
                ),
            )
        conn.commit()
