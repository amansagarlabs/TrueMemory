"""Real HTTP disposable reliability evidence for Phase 11.15.

This runner is intentionally a client of the running stack. It does not import
FastAPI routes or replace PostgreSQL/worker behavior with mocks. The companion
PowerShell script starts only the disposable compose project and passes test
credentials through environment variables.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import urlparse

import httpx


FORBIDDEN_HOST_MARKERS = {
    "supabase",
    "render.com",
    "neon.tech",
    "upstash.com",
    "production",
    "prod.",
}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres-test"}


@dataclass
class Check:
    name: str
    expected: str
    actual: int | str
    passed: bool
    duration_ms: float
    detail: str = ""


def _assert_disposable(base_url: str, explicit_disposable_flag: bool) -> None:
    if not explicit_disposable_flag:
        raise RuntimeError("--disposable-test is required")
    parsed = urlparse(base_url)
    host = (parsed.hostname or "").casefold()
    if parsed.scheme not in {"http", "https"} or host not in LOCAL_HOSTS:
        raise RuntimeError(f"refusing non-local E2E base URL: {host or '<missing>'}")
    database_url = os.getenv("TRUEMEMORY_E2E_DATABASE_URL", "")
    for value in (base_url, database_url, os.getenv("UPSTASH_REDIS_URL", "")):
        lowered = value.casefold()
        if any(marker in lowered for marker in FORBIDDEN_HOST_MARKERS):
            raise RuntimeError("production/cloud infrastructure detected; aborting")
    if database_url:
        db_host = (urlparse(database_url).hostname or "").casefold()
        if db_host not in LOCAL_HOSTS:
            raise RuntimeError(f"refusing non-local E2E database host: {db_host}")


class RuntimeE2E:
    def __init__(self, base_url: str, token: str, token_b: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.token_b = token_b
        self.client = httpx.Client(base_url=self.base_url, timeout=10.0)
        self.checks: list[Check] = []
        self.latencies: dict[str, list[float]] = {}

    def close(self) -> None:
        self.client.close()

    def call(self, name: str, method: str, path: str, *, expected: set[int], token: str | None = None,
             body: dict | None = None, headers: dict[str, str] | None = None, timeout: float = 10.0) -> httpx.Response:
        request_headers = {"X-Aman-Platform": "TrueMemory Memory"}
        if token:
            request_headers["Authorization"] = f"Bearer {token}"
        request_headers.update(headers or {})
        started = time.perf_counter()
        try:
            response = self.client.request(method, path, json=body, headers=request_headers, timeout=timeout)
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            actual: int | str = response.status_code
            detail = ""
            try:
                payload = response.json()
                if isinstance(payload, dict) and payload.get("message"):
                    detail = str(payload["message"])
            except ValueError:
                detail = response.text[:160]
        except Exception as exc:  # pragma: no cover - operational evidence path
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            actual = type(exc).__name__
            response = httpx.Response(599, request=httpx.Request(method, path))
            detail = str(exc)[:160]
        self.latencies.setdefault(name, []).append(duration_ms)
        self.checks.append(Check(name, "/".join(str(item) for item in sorted(expected)), actual, actual in expected, duration_ms, detail))
        return response

    def run(self) -> None:
        health = self.call("liveness", "GET", "/health", expected={200})
        if health.status_code != 200:
            return
        self.call("readiness", "GET", "/readiness", expected={200})
        self.call("memory-health", "GET", "/v1/memory/health", expected={200})
        self.call("auth-required", "GET", "/v1/memories", expected={401})

        invalid = self.call("validation", "POST", "/v1/memories", expected={422}, token=self.token, body={"key": ""})
        self._assert_error_contract(invalid)

        key = f"phase11_15_{int(time.time())}"
        created = self.call(
            "memory-write", "POST", "/v1/memory/store", expected={200}, token=self.token,
            body={"key": key, "content": "Disposable reliability test memory", "source": "phase11.15"},
        )
        memory_id = None
        if created.status_code == 200:
            memory_id = created.json().get("id")
        self.call("memory-list", "GET", "/v1/memories", expected={200}, token=self.token)
        self.call("memory-search", "POST", "/v1/memories/search", expected={200}, token=self.token, body={"query": key})
        if memory_id:
            self.call("memory-get", "GET", f"/v1/memories/{memory_id}", expected={200}, token=self.token)
            if self.token_b:
                self.call("memory-isolation", "GET", f"/v1/memories/{memory_id}", expected={404}, token=self.token_b)

        self._run_ingestion_idempotency()
        # Keep this last: the disposable run currently exposes a hang in the
        # performance aggregation endpoint, and it must not hide other checks.
        self.call("performance", "GET", "/v1/memory/performance", expected={200}, token=self.token)

    def _assert_error_contract(self, response: httpx.Response) -> None:
        try:
            payload = response.json()
        except ValueError:
            return
        if response.status_code >= 400:
            check = Check("error-contract", "code+retryable+request_id", 200 if all(key in payload for key in ("code", "retryable", "request_id")) else 500, all(key in payload for key in ("code", "retryable", "request_id")), 0.0)
            self.checks.append(check)

    def _run_ingestion_idempotency(self) -> None:
        key = f"phase11_15_job_{int(time.time())}"
        body = {
            "provider": "manual",
            "source_type": "text",
            "key": "disposable_worker_memory",
            "content": "PostgreSQL remains the durable source of truth for this disposable worker test.",
            "target": "candidate",
            "idempotency_key": key,
        }
        first = self.call("job-create", "POST", "/v1/ingestion", expected={200}, token=self.token, body=body)
        if first.status_code != 200:
            return
        first_job = first.json().get("job_id")

        def repeat() -> httpx.Response:
            return self.client.post(
                "/v1/ingestion", json=body,
                headers={"Authorization": f"Bearer {self.token}", "X-Aman-Platform": "TrueMemory Memory"},
                timeout=10.0,
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: repeat(), range(2)))
        same_job = all(response.status_code == 200 and response.json().get("job_id") == first_job for response in responses)
        self.checks.append(Check("concurrent-job-idempotency", "one-job", 200 if same_job else 500, same_job, 0.0))

        conflict_body = {**body, "content": "Changed payload must not silently overwrite the original request."}
        self.call("idempotency-conflict", "POST", "/v1/ingestion", expected={409}, token=self.token, body=conflict_body)
        deadline = time.time() + 35
        final_status = "unknown"
        while time.time() < deadline:
            response = self.call("job-poll", "GET", f"/v1/ingestion/{first_job}", expected={200}, token=self.token)
            if response.status_code != 200:
                break
            final_status = str(response.json().get("status") or "unknown")
            if final_status in {"completed", "candidate_ready", "failed", "dead_letter"}:
                break
            time.sleep(1)
        passed = final_status in {"completed", "candidate_ready"}
        self.checks.append(Check("worker-job-completion", "completed|candidate_ready", final_status, passed, 0.0))

    def report(self) -> dict:
        samples = [sample for values in self.latencies.values() for sample in values]
        ordered = sorted(samples)
        def percentile(value: float) -> float:
            if not ordered:
                return 0.0
            index = min(len(ordered) - 1, round((len(ordered) - 1) * value))
            return round(ordered[index], 2)
        return {
            "environment": "DISPOSABLE_TEST",
            "base_url": self.base_url,
            "checks": [asdict(check) for check in self.checks],
            "summary": {
                "passed": sum(1 for check in self.checks if check.passed),
                "failed": sum(1 for check in self.checks if not check.passed),
                "http_latency_ms": {"p50": percentile(0.50), "p95": percentile(0.95), "p99": percentile(0.99)},
                "sample_count": len(ordered),
            },
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("TRUEMEMORY_E2E_BASE_URL", "http://127.0.0.1:18000"))
    parser.add_argument("--report-path", default=os.getenv("TRUEMEMORY_E2E_REPORT_PATH", ""))
    parser.add_argument("--disposable-test", action="store_true")
    args = parser.parse_args()
    try:
        _assert_disposable(args.base_url, args.disposable_test)
        token = os.getenv("TRUEMEMORY_E2E_TOKEN", "").strip()
        if not token:
            raise RuntimeError("TRUEMEMORY_E2E_TOKEN is required; seed disposable identities first")
        runner = RuntimeE2E(args.base_url, token, os.getenv("TRUEMEMORY_E2E_TOKEN_B", "").strip() or None)
        try:
            runner.run()
            report = runner.report()
        finally:
            runner.close()
        if args.report_path:
            Path(args.report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 0 if report["summary"]["failed"] == 0 else 1
    except Exception as exc:
        print(f"PHASE11.15 BLOCKED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
