"""Create an ephemeral, development-only identity for MCP validation.

The raw token is emitted only to stdout for the invoking test harness. It is
never logged by the application. Refuses to run unless explicitly enabled.
"""

from __future__ import annotations

import json
import os
import secrets
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from services.auth_store import create_api_token, create_user_with_password
from services.postgres_store import postgres_enabled
from services.postgres_store import _connect


def main() -> int:
    if os.getenv("KONTEXT_ENABLE_TEST_AUTH") != "1":
        print("KONTEXT_ENABLE_TEST_AUTH=1 is required", file=sys.stderr)
        return 2
    settings = get_settings()
    if not postgres_enabled(settings):
        print("Postgres is required", file=sys.stderr)
        return 2

    suffix = uuid.uuid4().hex[:12]
    email = f"mcp-test-{suffix}@invalid.test"
    user = create_user_with_password(settings, email=email, password=secrets.token_urlsafe(32), username=f"mcp_test_{suffix}", full_name="MCP Test Identity")
    bindings = {
        "tenant_id": str(uuid.uuid4()),
        "workspace_id": str(uuid.uuid4()),
        "agent_id": str(uuid.uuid4()),
    }
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO workspaces (id, owner_user_id, name, platform)
                VALUES (%s, %s, %s, 'Kontext Memory')
                """,
                (bindings["workspace_id"], user["id"], "MCP validation workspace"),
            )
        conn.commit()
    token = create_api_token(settings, user_id=str(user["id"]), token_name="development-mcp-validation", scopes=["memory"], expires_days=1, **bindings)
    print(json.dumps({"user_id": str(user["id"]), **bindings, "token": token["token"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
