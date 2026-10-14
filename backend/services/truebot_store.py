"""Durable owner-filtered TrueBot repository and PostgreSQL work queue."""
from __future__ import annotations

import json
from uuid import uuid4

from psycopg.types.json import Jsonb

from services.postgres_pool import get_connection


class StoreError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)


def public(row):
    if not row:
        return None
    return {k: v for k, v in row.items() if k not in {"user_id", "agent_snapshot", "lease_token", "lease_expires_at", "deleted_at"}}


class TrueBotStore:
    def __init__(self, settings):
        self.settings = settings

    def check_schema(self):
        with get_connection(self.settings) as conn:
            row = conn.execute("SELECT to_regclass('public.truebot_agents') AS agents, to_regclass('public.truebot_runs') AS runs, to_regclass('public.truebot_worker_heartbeat') AS heartbeat").fetchone()
            if not row or not all(row.values()):
                raise RuntimeError("TrueBot requires migration 022_truebot.sql before enablement")

    def heartbeat(self):
        with get_connection(self.settings) as conn, conn.transaction():
            conn.execute("INSERT INTO truebot_worker_heartbeat(worker_name,seen_at) VALUES('primary',NOW()) ON CONFLICT(worker_name) DO UPDATE SET seen_at=NOW()")

    def worker_ready(self):
        with get_connection(self.settings) as conn:
            return bool(conn.execute("SELECT 1 FROM truebot_worker_heartbeat WHERE worker_name='primary' AND seen_at>NOW()-INTERVAL '30 seconds'").fetchone())

    @staticmethod
    def lock_user(conn, user_id):
        if not conn.execute("SELECT id FROM users WHERE id=%s AND status='active' FOR UPDATE", (user_id,)).fetchone():
            raise StoreError(403, "Account is unavailable.")

    @staticmethod
    def workspace(conn, user_id, workspace_id):
        if workspace_id and not conn.execute("SELECT id FROM workspaces WHERE id=%s AND owner_user_id=%s", (workspace_id, user_id)).fetchone():
            raise StoreError(404, "Workspace was not found.")

    def agents(self, user_id):
        with get_connection(self.settings) as conn:
            return [public(r) for r in conn.execute("SELECT * FROM truebot_agents WHERE user_id=%s AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 100", (user_id,)).fetchall()]

    def save_agent(self, user_id, data, agent_id=None):
        data = dict(data)
        data["tools"] = Jsonb(data["tools"])
        with get_connection(self.settings) as conn, conn.transaction():
            self.lock_user(conn, user_id)
            self.workspace(conn, user_id, data["workspace_id"])
            if agent_id:
                if conn.execute("SELECT 1 FROM truebot_runs WHERE user_id=%s AND agent_id=%s AND status IN ('queued','running')", (user_id, agent_id)).fetchone():
                    raise StoreError(409, "Cancel or finish active runs before editing this agent.")
                assignments = ", ".join(f"{key}=%s" for key in data)
                row = conn.execute(f"UPDATE truebot_agents SET {assignments}, updated_at=NOW() WHERE id=%s AND user_id=%s AND deleted_at IS NULL RETURNING *", (*data.values(), agent_id, user_id)).fetchone()
                if not row:
                    raise StoreError(404, "Agent was not found.")
            else:
                count = conn.execute("SELECT count(*) AS n FROM truebot_agents WHERE user_id=%s AND deleted_at IS NULL", (user_id,)).fetchone()["n"]
                if count >= self.settings.truebot_max_agents:
                    raise StoreError(429, "Agent limit reached.")
                columns = ", ".join(data)
                placeholders = ", ".join(["%s"] * len(data))
                row = conn.execute(f"INSERT INTO truebot_agents (user_id, {columns}) VALUES (%s, {placeholders}) RETURNING *", (user_id, *data.values())).fetchone()
            return public(row)

    def delete_agent(self, user_id, agent_id):
        with get_connection(self.settings) as conn, conn.transaction():
            self.lock_user(conn, user_id)
            row = conn.execute("UPDATE truebot_agents SET deleted_at=NOW(),status='paused',updated_at=NOW() WHERE id=%s AND user_id=%s AND deleted_at IS NULL RETURNING id", (agent_id, user_id)).fetchone()
            if not row:
                raise StoreError(404, "Agent was not found.")
            conn.execute("UPDATE truebot_runs SET status='cancelled',updated_at=NOW() WHERE user_id=%s AND agent_id=%s AND status IN ('queued','running')", (user_id, agent_id))

    def usage(self, user_id):
        with get_connection(self.settings) as conn:
            agents = conn.execute("SELECT count(*) AS n FROM truebot_agents WHERE user_id=%s AND deleted_at IS NULL", (user_id,)).fetchone()["n"]
            runs = conn.execute("SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS runs_today, count(*) FILTER (WHERE status IN ('queued','running')) AS active_runs FROM truebot_runs WHERE user_id=%s", (user_id,)).fetchone()
            return {"agents": agents, **runs}

    def enqueue(self, user_id, agent_id, task, key, memory_allowed, *, allow_memory_access=False, allow_memory_write=False):
        with get_connection(self.settings) as conn, conn.transaction():
            self.lock_user(conn, user_id)
            existing = conn.execute("SELECT * FROM truebot_runs WHERE user_id=%s AND idempotency_key=%s", (user_id, key)).fetchone()
            if existing:
                if str(existing["agent_id"]) != str(agent_id) or existing["task"] != task:
                    raise StoreError(409, "Idempotency key was already used for a different task.")
                return public(existing)
            agent = conn.execute("SELECT * FROM truebot_agents WHERE id=%s AND user_id=%s AND deleted_at IS NULL", (agent_id, user_id)).fetchone()
            if not agent:
                raise StoreError(404, "Agent was not found.")
            if agent["status"] != "active":
                raise StoreError(409, "Agent is paused.")
            self.workspace(conn, user_id, agent["workspace_id"])
            if agent["memory_enabled"] and not memory_allowed:
                raise StoreError(403, "Memory scope is required for this agent.")
            if agent["memory_enabled"] and not allow_memory_access:
                raise StoreError(422, "Approve memory access for this run before submitting.")
            if "memory.save" in agent["tools"] and not allow_memory_write:
                raise StoreError(422, "Approve memory writes for this run before submitting.")
            if agent["model"] not in self.settings.truebot_models:
                raise StoreError(409, "Agent model is no longer enabled.")
            counts = conn.execute("SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS today, count(*) FILTER (WHERE status IN ('queued','running')) AS active FROM truebot_runs WHERE user_id=%s", (user_id,)).fetchone()
            if counts["today"] >= self.settings.truebot_daily_runs or counts["active"] >= self.settings.truebot_concurrent_runs:
                raise StoreError(429, "Daily or concurrent execution limit reached.")
            snapshot = {k: agent[k] for k in ("name", "instructions", "provider", "model", "workspace_id", "memory_enabled", "tools", "max_output_tokens", "max_steps", "timeout_seconds")}
            snapshot["external_provider_approved"] = True
            snapshot["memory_access_approved"] = bool(allow_memory_access)
            snapshot["memory_write_approved"] = bool(allow_memory_write)
            if snapshot["workspace_id"]:
                snapshot["workspace_id"] = str(snapshot["workspace_id"])
            row = conn.execute("INSERT INTO truebot_runs (user_id,agent_id,task,idempotency_key,agent_snapshot) VALUES (%s,%s,%s,%s,%s) RETURNING *", (user_id, agent_id, task, key, Jsonb(snapshot))).fetchone()
            return public(row)

    def runs(self, user_id, agent_id=None):
        with get_connection(self.settings) as conn:
            return [public(r) for r in conn.execute("SELECT * FROM truebot_runs WHERE user_id=%s AND (%s::uuid IS NULL OR agent_id=%s) ORDER BY created_at DESC LIMIT 100", (user_id, agent_id, agent_id)).fetchall()]

    def run(self, user_id, run_id):
        with get_connection(self.settings) as conn:
            row = conn.execute("SELECT * FROM truebot_runs WHERE id=%s AND user_id=%s", (run_id, user_id)).fetchone()
            if not row:
                raise StoreError(404, "Run was not found.")
            return public(row)

    def cancel(self, user_id, run_id):
        with get_connection(self.settings) as conn, conn.transaction():
            conn.execute("UPDATE truebot_runs SET status='cancelled',updated_at=NOW() WHERE id=%s AND user_id=%s AND status IN ('queued','running')", (run_id, user_id))
            row = conn.execute("SELECT * FROM truebot_runs WHERE id=%s AND user_id=%s", (run_id, user_id)).fetchone()
            if not row:
                raise StoreError(404, "Run was not found.")
            return public(row)

    def claim(self):
        with get_connection(self.settings) as conn, conn.transaction():
            # Never replay an ambiguous provider call or memory write after a crash.
            conn.execute("UPDATE truebot_runs SET status='failed',error='Worker interrupted or execution lease expired; submit a new task to retry.',updated_at=NOW() WHERE status='running' AND lease_expires_at < NOW()")
            conn.execute("UPDATE truebot_runs SET status='failed',error='Queue wait exceeded 15 minutes. Check worker availability.',updated_at=NOW() WHERE status='queued' AND created_at < NOW()-INTERVAL '15 minutes'")
            row = conn.execute("SELECT * FROM truebot_runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1").fetchone()
            if not row:
                return None
            token = str(uuid4())
            return conn.execute("UPDATE truebot_runs SET status='running',lease_token=%s,lease_expires_at=NOW()+INTERVAL '150 seconds',updated_at=NOW() WHERE id=%s RETURNING *", (token, row["id"])).fetchone()

    def alive(self, run):
        with get_connection(self.settings) as conn:
            return bool(conn.execute("SELECT 1 FROM truebot_runs r JOIN users u ON u.id=r.user_id JOIN truebot_agents a ON a.id=r.agent_id WHERE r.id=%s AND r.status='running' AND r.lease_token=%s AND r.lease_expires_at>NOW() AND u.status='active' AND a.deleted_at IS NULL AND (a.workspace_id IS NULL OR EXISTS(SELECT 1 FROM workspaces w WHERE w.id=a.workspace_id AND w.owner_user_id=r.user_id))", (run["id"], run["lease_token"])).fetchone())

    def history(self, run):
        with get_connection(self.settings) as conn:
            rows = conn.execute("SELECT task,output FROM truebot_runs WHERE user_id=%s AND agent_id=%s AND status='completed' AND created_at < %s ORDER BY created_at DESC LIMIT 6", (run["user_id"], run["agent_id"], run["created_at"])).fetchall()
            return [item for row in reversed(rows) for item in [{"role": "user", "content": row["task"][:6000]}, {"role": "assistant", "content": row["output"][:6000]}]]

    def update(self, run, *, status="running", output="", error=None, usage=None, progress=None):
        with get_connection(self.settings) as conn, conn.transaction():
            conn.execute("UPDATE truebot_runs SET status=%s,output=%s,error=%s,usage=%s,progress=%s,updated_at=NOW() WHERE id=%s AND status='running' AND lease_token=%s AND lease_expires_at>NOW()", (status, output, error, Jsonb(usage or {}), Jsonb(progress or []), run["id"], run["lease_token"]))
