# TRUE MEMORY PHASE 9.9.1 — LIVE PROVIDER GATE READINESS

**Date:** 2026-09-14
**Status:** COMPLETE — Infrastructure READY

---

## Objective

Prepare Phase 9.9 live validation so that once provider quota becomes available, the entire live certification can be executed with ONE command.

---

## What Was Built

### 1. Provider Capability Detector
`backend/services/provider_capability_detector.py`

Detects:
- API reachability
- Credit balance/limits
- Free model availability
- Tool calling support
- Rate limits

### 2. Live Test Trace Collector
`backend/services/live_test_trace.py`

Captures:
- Complete execution traces per test
- Tool call details
- Decision/action/influence events
- Timing (provider, tool, total)
- Failure classification
- Evidence summaries

### 3. Failure Classifier
`backend/services/live_test_trace.py` (FailureClass enum)

Classifies failures into:
- `credential_missing` — No API key
- `credit_exhausted` — No credits (402)
- `rate_limited` — Rate limited (429)
- `api_unreachable` — Network error
- `model_refused` — Model refused request
- `tool_not_called` — Model didn't call memory tool
- `tool_call_malformed` — Malformed tool call
- `tool_execution_failed` — Tool execution error
- `timeout` — Request timed out
- `network_error` — Connection error
- `unknown` — Unclassified

### 4. Readiness Checker
`backend/scripts/live_provider_gate_readiness.py`

Single command to verify:
- Environment variables
- Tool registry (6 tools)
- Executor wiring
- Attribution chain
- Tool calling loop
- Telemetry collector
- Provider status

### 5. One-Command Certification
`backend/scripts/live_certification_run.py`

Single command to:
1. Check readiness
2. Check provider status
3. Run ALL live tests (dry-run or live)
4. Capture complete traces
5. Classify failures
6. Generate final report
7. Save evidence JSON

---

## Readiness Check Results

```
============================================================
TRUE MEMORY PHASE 9.9.1 — LIVE PROVIDER GATE READINESS
============================================================

  [OK] tool_registry: READY
  [OK] executor: READY
  [OK] attribution_chain: READY
  [OK] tool_calling_loop: READY
  [OK] telemetry: READY

------------------------------------------------------------
[OK] Infrastructure: READY
[--] Provider: NOT CHECKED (use --probe)
[--] Live tests: NOT ENABLED
```

---

## One-Command Usage

### Dry-Run (no provider calls)
```bash
cd backend
python scripts/live_certification_run.py
```

### Live Run (requires credits)
```bash
cd backend
TRUEMEMORY_LIVE_MODEL_TESTS=true python scripts/live_certification_run.py
```

### Live Run with Provider Probe
```bash
cd backend
TRUEMEMORY_LIVE_MODEL_TESTS=true python scripts/live_certification_run.py --probe
```

### Save Full Trace
```bash
cd backend
TRUEMEMORY_LIVE_MODEL_TESTS=true python scripts/live_certification_run.py --save-trace
```

---

## Dry-Run Results

```
Total: 13
Passed: 0
Failed: 0
Blocked: 0
Skipped: 13
Errors: 0

Mode: DRY-RUN (no provider calls)
L4: HARDENED — LIVE EVIDENCE PARTIAL
```

---

## When Provider Is Ready

1. Fund OpenRouter account ($10+)
2. Run: `TRUEMEMORY_LIVE_MODEL_TESTS=true python scripts/live_certification_run.py --save-trace`
3. All 13 tests execute with real provider calls
4. Complete traces captured in JSON
5. L4 status promoted to PROVEN

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/services/provider_capability_detector.py` | Provider capability detection |
| `backend/services/live_test_trace.py` | Trace collection and failure classification |
| `backend/scripts/live_provider_gate_readiness.py` | Readiness check |
| `backend/scripts/live_certification_run.py` | One-command certification |
| `docs/research/TRUE_MEMORY_PHASE9_9_1_READINESS_EVIDENCE.json` | Readiness evidence |
| `docs/research/TRUE_MEMORY_PHASE9_9_1_LIVE_PROVIDER_GATE_READINESS.md` | This file |
