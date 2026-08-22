"""Database persistence for user-owned connector credentials."""

from __future__ import annotations

from typing import Any

from services.github_oauth import decrypt_github_token, encrypt_github_token
from services.postgres_store import _connect, postgres_enabled, psycopg


def _ensure_table(settings: Any) -> None:
    if not postgres_enabled(settings):
        return
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS connector_connections (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    connector_id TEXT NOT NULL,
                    access_token_encrypted TEXT NOT NULL,
                    account_id TEXT,
                    account_login TEXT,
                    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
                    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (user_id, connector_id)
                )
                """
            )
        conn.commit()


def save_github_connection(
    settings: Any,
    *,
    user_id: str,
    access_token: str,
    account_id: str,
    account_login: str,
    scopes: list[str],
) -> None:
    if not postgres_enabled(settings):
        raise RuntimeError("postgres_required_for_connector")
    _ensure_table(settings)
    encrypted = encrypt_github_token(settings, access_token)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO connector_connections (
                    user_id, connector_id, access_token_encrypted,
                    account_id, account_login, scopes
                )
                VALUES (%s, 'github', %s, %s, %s, %s)
                ON CONFLICT (user_id, connector_id) DO UPDATE SET
                    access_token_encrypted = EXCLUDED.access_token_encrypted,
                    account_id = EXCLUDED.account_id,
                    account_login = EXCLUDED.account_login,
                    scopes = EXCLUDED.scopes,
                    updated_at = NOW()
                """,
                (
                    user_id,
                    encrypted,
                    account_id,
                    account_login,
                    psycopg.types.json.Json(scopes),
                ),
            )
        conn.commit()


def get_github_connection(settings: Any, *, user_id: str) -> dict[str, Any] | None:
    if not postgres_enabled(settings):
        return None
    _ensure_table(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT access_token_encrypted, account_id, account_login, scopes,
                       connected_at, updated_at
                FROM connector_connections
                WHERE user_id = %s AND connector_id = 'github'
                """,
                (user_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "access_token": decrypt_github_token(settings, str(row["access_token_encrypted"])),
        "account_id": str(row.get("account_id") or ""),
        "account_login": str(row.get("account_login") or ""),
        "scopes": row.get("scopes") or [],
        "connected_at": row.get("connected_at").isoformat() if row.get("connected_at") else None,
        "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
    }


def github_connection_status(settings: Any, *, user_id: str) -> dict[str, Any]:
    connection = get_github_connection(settings, user_id=user_id)
    if not connection:
        return {"connected": False, "connector_id": "github"}
    return {
        "connected": True,
        "connector_id": "github",
        "user": connection["account_login"],
        "scopes": connection["scopes"],
        "connected_at": connection["connected_at"],
    }


def get_github_access_token(settings: Any, *, user_id: str) -> str | None:
    connection = get_github_connection(settings, user_id=user_id)
    return connection["access_token"] if connection else None


def delete_github_connection(settings: Any, *, user_id: str) -> bool:
    if not postgres_enabled(settings):
        return False
    _ensure_table(settings)
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM connector_connections WHERE user_id = %s AND connector_id = 'github'",
                (user_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted
