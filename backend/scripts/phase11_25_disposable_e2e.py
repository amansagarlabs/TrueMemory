"""Real API/PostgreSQL/worker E2E for the disposable Phase 11.25 stack.

Run inside api-test after docker-compose.test.yml is healthy. Recovery mode
requires the Compose worker to be stopped so this script can kill a worker
after a real PostgreSQL lease claim and then start a replacement process.
All identities, workspaces, tokens, requests, and memory records are disposable.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from services.auth_store import create_api_token, create_user_with_password
from services.memory_core import MemoryClient
from services.postgres_store import _connect


BASE = "http://127.0.0.1:8000"


def request(path: str, *, token: str, method: str = "GET", payload: dict | None = None) -> tuple[int, dict]:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode())


def identity() -> tuple[str, str, str, str]:
    settings = get_settings()
    suffix = uuid.uuid4().hex
    workspace_id, agent_id = str(uuid.uuid4()), str(uuid.uuid4())
    user = create_user_with_password(
        settings,
        email=f"phase1125-{suffix}@invalid.test",
        password=uuid.uuid4().hex,
        username=f"phase1125_{suffix[:16]}",
        full_name="Disposable Phase 11.25",
    )
    with _connect(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO workspaces (id, owner_user_id, name, platform) VALUES (%s, %s, %s, 'TrueMemory Memory')",
                (workspace_id, user["id"], "Disposable Phase 11.25"),
            )
        conn.commit()
    token = create_api_token(
        settings,
        user_id=str(user["id"]),
        token_name="disposable-phase-11.25",
        scopes=["memory"],
        expires_days=1,
        tenant_id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        agent_id=agent_id,
    )["token"]
    return str(user["id"]), token, workspace_id, agent_id


def create_job(token: str, workspace_id: str, agent_id: str, *, idempotency_key: str) -> tuple[dict, dict]:
    key = f"phase1125-{uuid.uuid4().hex}"
    payload = {
        "provider": "manual",
        "source_type": "text",
        "content": f"I prefer PostgreSQL for the disposable Phase 11.25 worker test. Reference {key}.",
        "key": key,
        "workspace_id": workspace_id,
        "agent_id": agent_id,
        "target": "durable",
        "idempotency_key": idempotency_key,
    }
    status, first = request("/v1/ingestion", token=token, method="POST", payload=payload)
    if status != 200 or not first.get("job_id"):
        raise RuntimeError(f"ingestion request failed with HTTP {status}: {first}")
    duplicate_status, duplicate = request("/v1/ingestion", token=token, method="POST", payload=payload)
    if duplicate_status != 200 or duplicate.get("job_id") != first["job_id"] or duplicate.get("created") is not False:
        raise AssertionError("idempotent replay did not return the original durable job")
    return first, {"key": key, "payload": payload}


def wait_for_completion(token: str, job_id: str, timeout_seconds: int = 90) -> dict:
    deadline = time.monotonic() + timeout_seconds
    latest: dict = {}
    transitions: list[tuple[str, str | None]] = []
    while time.monotonic() < deadline:
        status, latest = request(f"/v1/ingestion/{job_id}", token=token)
        if status != 200:
            raise RuntimeError(f"job status returned HTTP {status}: {latest}")
        state = (str(latest.get("status") or ""), latest.get("current_stage"))
        if not transitions or transitions[-1] != state:
            transitions.append(state)
        if latest.get("status") in {"completed", "completed_with_warnings"}:
            latest["observed_transitions"] = transitions
            return latest
        if latest.get("status") in {"failed", "dead_letter", "cancelled"}:
            raise AssertionError(f"ingestion job reached {latest.get('status')}: {latest.get('error')}")
        time.sleep(0.5)
    raise TimeoutError(f"job {job_id} did not complete; last status={latest.get('status')}")


def assert_memory(user_id: str, workspace_id: str, agent_id: str, key: str) -> dict:
    matches = MemoryClient(get_settings()).search(
        user_id=user_id,
        scope="general",
        query=key,
        limit=20,
        workspace_id=workspace_id,
        agent_id=agent_id,
    )
    exact = [item for item in matches if item.get("key") == key]
    if len(exact) != 1:
        raise AssertionError(f"expected exactly one durable memory for idempotent key; found {len(exact)}")
    return exact[0]


def run_normal() -> None:
    user_id, token, workspace_id, agent_id = identity()
    first, request_data = create_job(token, workspace_id, agent_id, idempotency_key=f"e2e-{uuid.uuid4()}")
    final = wait_for_completion(token, first["job_id"])
    memory = assert_memory(user_id, workspace_id, agent_id, request_data["key"])
    print(json.dumps({
        "mode": "worker-e2e-and-idempotency",
        "job_id": first["job_id"],
        "initial_status": first.get("status"),
        "final_status": final.get("status"),
        "status_transitions": final.get("observed_transitions"),
        "created_at": (final.get("job") or {}).get("created_at"),
        "started_at": (final.get("job") or {}).get("started_at"),
        "completed_at": (final.get("job") or {}).get("completed_at"),
        "attempt": (final.get("job") or {}).get("attempt_count"),
        "memory_id": memory.get("id"),
        "memory_revision": memory.get("revision"),
        "idempotent_replay": "same job id; created=false",
    }, indent=2))


def run_recovery() -> None:
    user_id, token, workspace_id, agent_id = identity()
    created, request_data = create_job(token, workspace_id, agent_id, idempotency_key=f"recovery-{uuid.uuid4()}")
    job_id = created["job_id"]
    marker = Path("/tmp") / f"phase1125-claimed-{uuid.uuid4().hex}.txt"
    env = os.environ.copy()
    env["PHASE1125_CLAIM_MARKER"] = str(marker)
    child_code = r'''
import asyncio, os
from pathlib import Path
import worker.memory_ingestion_worker as worker
claim = worker.claim_next_ingestion_job
def short_lease_claim(*args, **kwargs):
    kwargs["lease_seconds"] = 30
    return claim(*args, **kwargs)
async def pause_after_real_claim(settings, job, *, lease_owner):
    Path(os.environ["PHASE1125_CLAIM_MARKER"]).write_text(str(job["id"]), encoding="utf-8")
    await asyncio.Event().wait()
worker.claim_next_ingestion_job = short_lease_claim
worker.process_ingestion_job = pause_after_real_claim
asyncio.run(worker.run_worker(poll_interval=0.2))
'''
    crashed_worker = subprocess.Popen([sys.executable, "-c", child_code], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    replacement_worker: subprocess.Popen | None = None
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and not marker.exists():
            if crashed_worker.poll() is not None:
                raise RuntimeError("crash-simulation worker exited before it acquired a lease")
            time.sleep(0.2)
        if not marker.exists() or marker.read_text(encoding="utf-8").strip() != job_id:
            raise TimeoutError("worker did not claim the recovery job")
        crashed_worker.terminate()
        crashed_worker.wait(timeout=10)
        # The disposable worker lease is set to the supported 30 second minimum.
        time.sleep(32)
        replacement_worker = subprocess.Popen(
            [sys.executable, "-m", "worker.memory_ingestion_worker"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        final = wait_for_completion(token, job_id, timeout_seconds=90)
        memory = assert_memory(user_id, workspace_id, agent_id, request_data["key"])
        attempt = int((final.get("job") or {}).get("attempt_count") or 0)
        if attempt < 2:
            raise AssertionError(f"expected lease reclaim to increment attempt count; got {attempt}")
        print(json.dumps({
            "mode": "worker-crash-lease-recovery",
            "job_id": job_id,
            "status_after_reclaim": final.get("status"),
            "attempt": attempt,
            "memory_id": memory.get("id"),
            "memory_revision": memory.get("revision"),
            "lease_recovered": True,
            "single_final_memory": True,
        }, indent=2))
    finally:
        if crashed_worker.poll() is None:
            crashed_worker.terminate()
            crashed_worker.wait(timeout=10)
        if replacement_worker and replacement_worker.poll() is None:
            replacement_worker.terminate()
            replacement_worker.wait(timeout=10)
        marker.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recovery", action="store_true", help="kill a worker after lease claim, then start a replacement")
    args = parser.parse_args()
    if args.recovery:
        run_recovery()
    else:
        run_normal()


if __name__ == "__main__":
    main()
