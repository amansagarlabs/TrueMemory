"""Provision and revoke the fixed, development-only browser E2E credential."""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.config import get_settings
from services.auth_store import create_api_token, create_user_with_password, revoke_api_token
from services.postgres_store import _connect, postgres_enabled

USER_IDENTITY = ("truememory-browser-e2e@invalid.test", "truememory_browser_e2e")
TENANT_ID = "00000000-0000-4000-8000-000000000001"
WORKSPACE_ID = "00000000-0000-4000-8000-000000000002"
AGENT_ID = "00000000-0000-4000-8000-000000000003"


def provision() -> dict[str, str]:
    if os.getenv("KONTEXT_ENABLE_TEST_AUTH") != "1":
        raise RuntimeError("KONTEXT_ENABLE_TEST_AUTH=1 is required")
    settings = get_settings()
    if not postgres_enabled(settings):
        raise RuntimeError("Postgres is required for browser test auth")
    email, username = USER_IDENTITY
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id::text FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
    user = {"id": row["id"]} if row else create_user_with_password(
        settings,
        email=email,
        password="browser-e2e-development-only-password",
        username=username,
        full_name="TrueMemory Browser E2E",
    )
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO workspaces (id, owner_user_id, name, platform)
                VALUES (%s, %s, %s, 'Kontext Memory')
                ON CONFLICT (id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id
                """,
                (WORKSPACE_ID, user["id"], "TrueMemory browser E2E workspace"),
            )
        conn.commit()
    token = create_api_token(
        settings,
        user_id=str(user["id"]),
        token_name="truememory-browser-e2e",
        scopes=["memory"],
        expires_days=1,
        tenant_id=TENANT_ID,
        workspace_id=WORKSPACE_ID,
        agent_id=AGENT_ID,
    )
    return {"user_id": str(user["id"]), "token_id": str(token["id"]), "token": token["token"]}


def revoke(user_id: str, token_id: str) -> None:
    if os.getenv("KONTEXT_ENABLE_TEST_AUTH") != "1":
        raise RuntimeError("KONTEXT_ENABLE_TEST_AUTH=1 is required")
    settings = get_settings()
    if not revoke_api_token(settings, user_id=user_id, token_id=token_id):
        raise RuntimeError("browser test token was not revoked")


parser = argparse.ArgumentParser()
parser.add_argument("--revoke", nargs=2, metavar=("USER_ID", "TOKEN_ID"))
args = parser.parse_args()
try:
    print(json.dumps({"revoked": True}) if args.revoke else json.dumps(provision()))
except Exception as exc:
    print(str(exc), file=sys.stderr)
    raise SystemExit(2)
