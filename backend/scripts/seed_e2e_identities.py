"""Create comprehensive test identities for Phase 9.8 E2E testing.

Creates:
- user_a with workspace_a (workspace-bound token)
- user_a with agent-bound tokens (agent_a, agent_b, agent_c)
- user_b with workspace_b (workspace-bound token)
- user_b with unbound token
- Prints all tokens as JSON for test harness consumption.
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
from services.postgres_store import postgres_enabled, _connect


def create_workspace(conn, workspace_id: str, owner_user_id: str, name: str) -> None:
    conn.execute(
        """INSERT INTO workspaces (id, owner_user_id, name, platform)
           VALUES (%s, %s, %s, 'TrueMemory Memory')
           ON CONFLICT (id) DO NOTHING""",
        (workspace_id, owner_user_id, name),
    )


def create_project(conn, project_id: str, workspace_id: str, owner_user_id: str, name: str) -> None:
    conn.execute(
        """INSERT INTO projects (id, workspace_id, owner_user_id, name)
           VALUES (%s, %s, %s, %s)
           ON CONFLICT (id) DO NOTHING""",
        (project_id, workspace_id, owner_user_id, name),
    )


def main() -> int:
    if os.getenv("TrueMemory_ENABLE_TEST_AUTH") != "1":
        print("TrueMemory_ENABLE_TEST_AUTH=1 is required", file=sys.stderr)
        return 2
    settings = get_settings()
    if not postgres_enabled(settings):
        print("Postgres is required", file=sys.stderr)
        return 2

    result = {}

    with _connect(settings) as conn:
        # ── user_a ────────────────────────────────────────────────────
        user_a = create_user_with_password(
            settings,
            email=f"user-a-{uuid.uuid4().hex[:8]}@test.local",
            password=secrets.token_urlsafe(16),
            username=f"user_a_{uuid.uuid4().hex[:8]}",
            full_name="E2E User A",
        )
        user_a_id = str(user_a["id"])

        ws_a_id = str(uuid.uuid4())
        project_a_id = str(uuid.uuid4())

        create_workspace(conn, ws_a_id, user_a_id, "Workspace A (test)")
        create_project(conn, project_a_id, ws_a_id, user_a_id, "Project A (test)")

        # user_a workspace-bound token (no agent)
        tok_a_ws = create_api_token(
            settings, user_id=user_a_id, token_name="e2e-user-a-ws",
            scopes=["memory"], expires_days=1,
            workspace_id=ws_a_id,
        )

        # user_a agent tokens
        ag_a_id = str(uuid.uuid4())
        ag_b_id = str(uuid.uuid4())
        ag_c_id = str(uuid.uuid4())

        tok_a_ag = create_api_token(
            settings, user_id=user_a_id, token_name="e2e-user-a-ag",
            scopes=["memory"], expires_days=1,
            workspace_id=ws_a_id, agent_id=ag_a_id,
        )
        tok_b_ag = create_api_token(
            settings, user_id=user_a_id, token_name="e2e-user-b-ag",
            scopes=["memory"], expires_days=1,
            workspace_id=ws_a_id, agent_id=ag_b_id,
        )
        tok_c_ag = create_api_token(
            settings, user_id=user_a_id, token_name="e2e-user-c-ag",
            scopes=["memory"], expires_days=1,
            workspace_id=ws_a_id, agent_id=ag_c_id,
        )

        # ── user_b ────────────────────────────────────────────────────
        user_b = create_user_with_password(
            settings,
            email=f"user-b-{uuid.uuid4().hex[:8]}@test.local",
            password=secrets.token_urlsafe(16),
            username=f"user_b_{uuid.uuid4().hex[:8]}",
            full_name="E2E User B",
        )
        user_b_id = str(user_b["id"])

        ws_b_id = str(uuid.uuid4())
        project_b_id = str(uuid.uuid4())

        create_workspace(conn, ws_b_id, user_b_id, "Workspace B (test)")
        create_project(conn, project_b_id, ws_b_id, user_b_id, "Project B (test)")

        tok_b_ws = create_api_token(
            settings, user_id=user_b_id, token_name="e2e-user-b-ws",
            scopes=["memory"], expires_days=1,
            workspace_id=ws_b_id,
        )

        conn.commit()

    result = {
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "workspace_a_id": ws_a_id,
        "workspace_b_id": ws_b_id,
        "project_a_id": project_a_id,
        "project_b_id": project_b_id,
        "agent_a_id": ag_a_id,
        "agent_b_id": ag_b_id,
        "agent_c_id": ag_c_id,
        "tokens": {
            "token_a_ws": tok_a_ws["token"],
            "token_a_agent": tok_a_ag["token"],
            "token_b_agent": tok_b_ag["token"],
            "token_c_agent": tok_c_ag["token"],
            "token_b_ws": tok_b_ws["token"],
        },
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
