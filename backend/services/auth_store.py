"""Email/password auth helpers backed by Postgres."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from services.postgres_store import _connect, postgres_enabled
from services.validation import validate_workspace_name


def _hash_password(password: str, salt: str) -> str:
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    )
    return base64.b64encode(derived).decode("utf-8")


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_api_token(
    settings: Any,
    *,
    user_id: str,
    token_name: str,
    scopes: list[str],
    expires_days: int | None = None,
    tenant_id: str | None = None,
    workspace_id: str | None = None,
    agent_id: str | None = None,
) -> dict[str, Any]:
    """Create token; raw secret returned once, only hash stored."""
    if not postgres_enabled(settings):
        raise ValueError("Postgres is not configured.")
    raw_token = f"knt_{secrets.token_urlsafe(48)}"
    expires_at = (
        datetime.now(UTC) + timedelta(days=expires_days)
        if expires_days is not None else None
    )
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO api_tokens (
                    user_id, token_name, token_hash, scopes, tenant_id,
                    workspace_id, agent_id, expires_at
                )
                VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s)
                RETURNING id::text, token_name, scopes, tenant_id,
                          workspace_id, agent_id, expires_at, created_at
                """,
                (
                    user_id, token_name.strip()[:120], _hash_token(raw_token),
                    json.dumps(sorted(set(scopes))), tenant_id, workspace_id,
                    agent_id, expires_at,
                ),
            )
            record = cur.fetchone()
            conn.commit()
    return {**dict(record), "token": raw_token}


def get_user_from_api_token(settings: Any, token: str) -> dict[str, Any] | None:
    """Validate API token hash, expiry, revocation, and return bindings."""
    if not postgres_enabled(settings) or not token:
        return None
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id::text AS id, u.email, u.username, u.status, u.plan,
                       p.full_name, p.bio, p.company, p.location, p.website,
                       p.timezone, p.locale, p.preferences,
                       t.id::text AS api_token_id, t.scopes,
                       t.tenant_id, t.workspace_id, t.agent_id
                FROM api_tokens t
                JOIN users u ON u.id = t.user_id
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE t.token_hash = %s
                  AND t.revoked_at IS NULL
                  AND (t.expires_at IS NULL OR t.expires_at > NOW())
                  AND u.status = 'active'
                LIMIT 1
                """,
                (_hash_token(token),),
            )
            user = cur.fetchone()
            if not user:
                return None
            cur.execute(
                "UPDATE api_tokens SET last_used_at = NOW() WHERE id = %s",
                (user["api_token_id"],),
            )
            conn.commit()
            return user


def revoke_api_token(settings: Any, *, user_id: str, token_id: str) -> bool:
    if not postgres_enabled(settings):
        return False
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE api_tokens SET revoked_at = NOW()
                WHERE id = %s AND user_id = %s AND revoked_at IS NULL
                RETURNING id
                """,
                (token_id, user_id),
            )
            row = cur.fetchone()
            conn.commit()
            return bool(row)


def create_user_with_password(
    settings: Any,
    *,
    email: str,
    password: str,
    username: str | None = None,
    full_name: str | None = None,
) -> dict[str, Any]:
    if not postgres_enabled(settings):
        raise ValueError("Postgres is not configured.")

    normalized_email = email.strip().lower()
    normalized_username = username.strip().lower() if username else None

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (normalized_email,))
            if cur.fetchone():
                raise ValueError("An account with this email already exists.")

            cur.execute(
                """
                INSERT INTO users (email, username, status, is_email_verified)
                VALUES (%s, %s, 'active', FALSE)
                RETURNING id::text, email, username, created_at
                """,
                (normalized_email, normalized_username),
            )
            user = cur.fetchone()
            user_id = user["id"]

            cur.execute(
                """
                INSERT INTO user_profiles (user_id, full_name, onboarding_completed)
                VALUES (%s, %s, FALSE)
                ON CONFLICT (user_id) DO NOTHING
                """,
                (user_id, full_name or normalized_email.split("@")[0]),
            )

            salt = secrets.token_hex(16)
            password_hash = _hash_password(password, salt)
            cur.execute(
                """
                INSERT INTO auth_identities (
                    user_id, provider, provider_user_id, password_hash, password_salt, password_updated_at
                )
                VALUES (%s, 'password', %s, %s, %s, NOW())
                """,
                (user_id, normalized_email, password_hash, salt),
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
            return user


def authenticate_user(
    settings: Any,
    *,
    email: str,
    password: str,
) -> dict[str, Any] | None:
    if not postgres_enabled(settings):
        raise ValueError("Postgres is not configured.")

    normalized_email = email.strip().lower()

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.id::text AS id,
                    u.email,
                    u.username,
                    u.status,
                    u.plan,
                    p.full_name,
                    ai.password_hash,
                    ai.password_salt
                FROM users u
                JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'password'
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE u.email = %s
                LIMIT 1
                """,
                (normalized_email,),
            )
            user = cur.fetchone()
            if not user or user["status"] != "active":
                return None

            expected_hash = _hash_password(password, user["password_salt"])
            if not secrets.compare_digest(expected_hash, user["password_hash"]):
                return None

            cur.execute(
                "UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = %s",
                (user["id"],),
            )
            conn.commit()
            return user


def create_session(
    settings: Any,
    *,
    user_id: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
    days_valid: int = 14,
) -> dict[str, Any]:
    if not postgres_enabled(settings):
        raise ValueError("Postgres is not configured.")

    raw_token = secrets.token_urlsafe(48)
    refresh_token = secrets.token_urlsafe(48)
    token_hash = _hash_token(raw_token)
    refresh_token_hash = _hash_token(refresh_token)
    expires_at = datetime.now(UTC) + timedelta(days=days_valid)

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_sessions (
                    user_id, session_token_hash, refresh_token_hash, user_agent, ip_address, expires_at, last_seen_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING id::text, expires_at
                """,
                (user_id, token_hash, refresh_token_hash, user_agent, ip_address, expires_at),
            )
            session = cur.fetchone()
            conn.commit()

    return {
        "session_id": session["id"],
        "access_token": raw_token,
        "refresh_token": refresh_token,
        "expires_at": session["expires_at"],
    }


def get_user_from_token(settings: Any, token: str) -> dict[str, Any] | None:
    if not postgres_enabled(settings) or not token:
        return None

    token_hash = _hash_token(token)

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.id::text AS id,
                    u.email,
                    u.username,
                    u.status,
                    u.plan,
                    p.full_name,
                    p.bio,
                    p.company,
                    p.location,
                    p.website,
                    p.timezone,
                    p.locale,
                    p.preferences,
                    s.id::text AS session_id
                FROM user_sessions s
                JOIN users u ON u.id = s.user_id
                LEFT JOIN user_profiles p ON p.user_id = u.id
                WHERE s.session_token_hash = %s
                  AND s.revoked_at IS NULL
                  AND s.expires_at > NOW()
                LIMIT 1
                """,
                (token_hash,),
            )
            user = cur.fetchone()
            if not user:
                return None

            cur.execute(
                "UPDATE user_sessions SET last_seen_at = NOW() WHERE id = %s",
                (user["session_id"],),
            )
            conn.commit()
            return user


def update_user_profile(
    settings: Any,
    *,
    user_id: str,
    username: str | None,
    full_name: str | None,
    bio: str | None,
    company: str | None,
    location: str | None,
    website: str | None,
    preferences: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not postgres_enabled(settings):
        raise ValueError("Postgres is not configured.")
    onboarding_preferences = dict(preferences or {})
    if "workspaceName" in onboarding_preferences:
        onboarding_preferences["workspaceName"] = validate_workspace_name(
            onboarding_preferences.get("workspaceName")
        )
    values = {
        "username": username.strip().lower() if username else None,
        "full_name": full_name.strip() if full_name else None,
        "bio": bio.strip() if bio else None,
        "company": company.strip() if company else None,
        "location": location.strip() if location else None,
        "website": website.strip() if website else None,
        "preferences": onboarding_preferences,
    }
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "UPDATE users SET username = %s, updated_at = NOW() WHERE id = %s",
                    (values["username"], user_id),
                )
                cur.execute(
                    """
                    INSERT INTO user_profiles (
                        user_id, full_name, bio, company, location, website, preferences, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
                    ON CONFLICT (user_id) DO UPDATE SET
                        full_name = EXCLUDED.full_name,
                        bio = EXCLUDED.bio,
                        company = EXCLUDED.company,
                        location = EXCLUDED.location,
                        website = EXCLUDED.website,
                        preferences = CASE
                            WHEN EXCLUDED.preferences = '{}'::jsonb THEN COALESCE(user_profiles.preferences, '{}'::jsonb)
                            ELSE jsonb_set(
                                COALESCE(user_profiles.preferences, '{}'::jsonb),
                                '{onboarding}',
                                EXCLUDED.preferences,
                                TRUE
                            )
                        END,
                        updated_at = NOW()
                    """,
                    (
                        user_id, values["full_name"], values["bio"],
                        values["company"], values["location"], values["website"],
                        json.dumps(values["preferences"]),
                    ),
                )
                cur.execute(
                    """
                    SELECT
                        u.id::text AS id, u.email, u.username, u.plan,
                        p.full_name, p.avatar_url, p.bio, p.company,
                        p.location, p.website, p.timezone, p.locale, p.preferences
                    FROM users u
                    LEFT JOIN user_profiles p ON p.user_id = u.id
                    WHERE u.id = %s
                    """,
                    (user_id,),
                )
                user = cur.fetchone()
                conn.commit()
            except Exception as exc:
                conn.rollback()
                if "users_username_key" in str(exc):
                    raise ValueError("That username is already in use.") from exc
                raise
    if not user:
        raise ValueError("User profile was not found.")
    return user


def refresh_session(
    settings: Any,
    *,
    refresh_token: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
    days_valid: int = 14,
) -> dict[str, Any] | None:
    if not postgres_enabled(settings) or not refresh_token:
        return None

    refresh_token_hash = _hash_token(refresh_token)
    new_access_token = secrets.token_urlsafe(48)
    new_refresh_token = secrets.token_urlsafe(48)
    new_access_hash = _hash_token(new_access_token)
    new_refresh_hash = _hash_token(new_refresh_token)
    expires_at = datetime.now(UTC) + timedelta(days=days_valid)

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_sessions
                SET
                    session_token_hash = %s,
                    refresh_token_hash = %s,
                    expires_at = %s,
                    user_agent = COALESCE(%s, user_agent),
                    ip_address = COALESCE(%s, ip_address),
                    last_seen_at = NOW()
                WHERE refresh_token_hash = %s
                  AND revoked_at IS NULL
                  AND expires_at > NOW()
                RETURNING id::text, user_id::text, expires_at
                """,
                (
                    new_access_hash,
                    new_refresh_hash,
                    expires_at,
                    user_agent,
                    ip_address,
                    refresh_token_hash,
                ),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback()
                return None
            conn.commit()

    return {
        "session_id": row["id"],
        "user_id": row["user_id"],
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "expires_at": row["expires_at"],
    }


def revoke_session_by_token(settings: Any, *, token: str) -> bool:
    if not postgres_enabled(settings) or not token:
        return False

    token_hash = _hash_token(token)

    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_sessions
                SET revoked_at = NOW(), last_seen_at = NOW()
                WHERE revoked_at IS NULL
                  AND (
                    session_token_hash = %s
                    OR refresh_token_hash = %s
                  )
                RETURNING id::text
                """,
                (token_hash, token_hash),
            )
            row = cur.fetchone()
            conn.commit()
            return bool(row)
