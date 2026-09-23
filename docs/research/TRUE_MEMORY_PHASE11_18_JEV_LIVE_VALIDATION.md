# TrueMemory Phase 11.18 — Jev Live Validation

Date: 2026-09-23
Status: **PARTIAL — LIVE TYPESAFE NOT VERIFIED**

## Scope

Phase 11.18 adds a guarded, disposable-test-only evidence runner for the
optional server-side Jev/TypeSafe adapter. It exercises model discovery and
typed System One requests when a disposable `TYPESAFE_API_KEY` is present.
The deterministic provider remains authoritative; the runner never writes
MemoryCore state and never enables Jev in production.

The TypeSafe request shape follows the official System One quick start:
server-side bearer authentication, `state`, `model`, and typed `questions`,
with typed answers and usage returned by the service ([official quick start](https://docs.typesafe.ai/introduction/quickstart)).
The local adapter maps the provider-neutral `noul`, `choice`, and `score`
questions to that contract ([official primitives](https://docs.typesafe.ai/primitives)).

## Local evidence

The guarded command was executed with `--disposable-test`,
`TRUEMEMORY_RUNTIME_ENV=disposable-test`, and `APP_ENV=disposable-test`.
There was no `TYPESAFE_API_KEY` in the disposable environment, so the result
was intentionally:

- `LIVE TYPESAFE`: **NOT VERIFIED** — credential not configured
- `MODEL DISCOVERY`: **NOT VERIFIED**
- `SYSTEM ONE / NOUL / CHOICE / SCORE`: **NOT VERIFIED**
- production touched: `false`
- cost: **NOT VERIFIED**

The deterministic fixture path did run. It covered framework/current state,
arithmetic, PostgreSQL decision history, pre-Vue history, forget-tool risk,
memory-write triage, memory relevance, and score output. The complete
machine-readable result is in
[`TRUE_MEMORY_PHASE11_18_JEV_EVIDENCE.json`](./TRUE_MEMORY_PHASE11_18_JEV_EVIDENCE.json).

## Failure and governance boundary

Missing key, timeout, 429, and transient 5xx behavior are covered by local
mock tests. Live failure injection, provider billing, live latency, and
production calibration remain unverified. The API key is read only by the
backend adapter; a frontend source scan is an automated test. Jev is optional,
shadow-first, and cannot authorize tools, forgetting, memory writes,
consolidation, scope changes, or revision changes.

## Completion rule

Phase 11.18 cannot be marked complete from this run. A disposable credential
and isolated test identity are still required to verify `/v1/models`, one
System One request for each typed primitive, live retry/failure behavior,
latency percentiles, and Jev-vs-deterministic calibration.
