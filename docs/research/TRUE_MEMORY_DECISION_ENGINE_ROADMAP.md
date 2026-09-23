# TrueMemory Decision Engine Roadmap

## Goal

Provide reliable local decisions with optional semantic escalation while
keeping MemoryCore provider-independent.

## Current Baseline

Deterministic fast decisions and advisory telemetry exist. Jev evidence remains
historical and unverified. OPA policies and the Groq adapter are now added but
not live-certified.

## Phase 1 — Jev Decoupling

Keep Jev out of the default path, remove its configuration from production
requirements, and preserve only historical tests/evidence until retired.

## Phase 2 — OPA Policy Design

Version-control small Rego policies for memory writes, tool risk, and model
routing. Keep authorization outside the policies.

## Phase 3 — OPA Wasm Embedding

Compile with the OPA CLI, package `policy.wasm`, and evaluate in-process with
the Python runtime. Verify Windows and Render-compatible builds.

## Phase 4 — DecisionEngine Integration

Run deterministic signals first, use OPA for clear local decisions, and expose
only validated advisory results to callers.

## Phase 5 — Optional Groq Advisor

Use a server-side Groq key and strict structured outputs only when enabled.
Never add a paid fallback.

## Phase 6 — AI Escalation

Escalate only ambiguous low-risk semantic decisions. Keep tool authorization,
deletion, memory writes, and scope changes outside AI authority.

## Phase 7 — Observability

Measure policy/model source, latency, fallback, escalation, and failure class
without raw state or secrets.

## Phase 8 — Benchmark

Build human-labeled category datasets and report precision, recall, confusion,
calibration, latency, and AI calls avoided by OPA.

## Phase 9 — Production Hardening

Verify offline startup, compiled bundle integrity, dependency compatibility,
rate-limit behavior, rollback, and deployment isolation.

## Dependency Graph

```text
deterministic → embedded OPA → optional Groq → validated advisory result
       └────────────── all independent of MemoryCore persistence ──────────────┘
```

## Acceptance Criteria

- No Jev, Groq, or OPA server required for startup or memory correctness.
- OPA bundle evaluates locally without HTTP.
- Groq is opt-in, server-side, structured, bounded, and fallback-safe.
- MemoryCore and authorization remain provider-independent.
- Offline and regression tests pass.

## Rollback Strategy

Set `FAST_DECISION_PROVIDER=deterministic`, `FAST_DECISION_MODE=disabled`, and
`AI_DECISION_ENABLED=false`. Remove the optional policy bundle if necessary;
the deterministic path remains available.

## Remaining Gaps

The compiled Wasm artifact, live Groq request, labeled 60-case benchmark, and
Render runtime verification remain pending.
