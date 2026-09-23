# TrueMemory Phase 11.17 — Fast Decision Layer + Optional Jev Adapter

Date: 2026-09-23
Status: **PARTIAL — deterministic contract implemented; live Jev evidence pending**

## Purpose

Phase 11.17 adds a provider-neutral fast-decision boundary for agent-harness
workflows. The deterministic provider is the baseline. Jev is an optional
external decision provider and is never required for memory correctness.

## Architecture

```text
Agent / chat
    -> FastDecisionService
       -> DeterministicFastDecisionProvider (authoritative fallback)
       -> JevFastDecisionProvider (optional shadow/advisory path)
    -> FastDecisionPolicy
    -> existing route / authorization / MemoryCore behavior
```

The optional path is outside MemoryCore. Jev does not own storage, retrieval,
governance, conflict resolution, revisions, forgetting, authorization, or
consolidation.

## Implemented

- provider-neutral `DecisionQuestion`, `DecisionRequest`, and
  `FastDecisionResult` contract;
- `classify`, `choose`, `score`, and `evaluate` operations;
- deterministic memory-depth, model-route, tool-risk, and write-triage
  signals;
- thin server-side Jev client using the documented System One HTTP contract;
- configured model discovery support through `GET /v1/models`;
- bounded Jev retry behavior using the existing retry classifier;
- disabled, shadow, and policy-gated active modes;
- confidence thresholds and explicit low-risk active boundary;
- redacted fast-decision telemetry;
- optional chat shadow observation that cannot replace the existing route;
- MemoryCore/MemoryClient isolation tests;
- no frontend or public memory API exposure of `TYPESAFE_API_KEY`.

## Fallback and safety

No key, timeout, network error, malformed answer, 429, or transient 5xx
response returns deterministic behavior. Jev cannot approve a destructive
tool, bypass existing authorization, commit memory, alter tenant scope, or
change revision semantics. Memory write candidates remain subject to the
existing extraction → Governor → ConflictResolver → MemoryCore pipeline.

## Evaluation status

Local tests cover deterministic golden cases, Jev parsing/retry failures,
fallback, confidence/policy gates, shadow agreement, telemetry redaction, and
core import isolation. No external key was used; therefore live Jev
authentication, model discovery, Noul/Choice/Score live behavior, calibration,
calibration, and Jev p50/p95/p99 latency are **NOT VERIFIED**. A 100-iteration
local deterministic benchmark measured p50 `0.007 ms`, p95 `0.009 ms`, and
p99 `0.020 ms` on the development machine; these are not production latency
claims. The guarded live runner returned `LIVE JEV = NOT VERIFIED` because no
`TYPESAFE_API_KEY` was configured.

This phase does not claim Jev is faster, safer, or more accurate than the
deterministic provider. It also does not introduce L5 adaptive learning.

## Official provider references

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe quick start](https://docs.typesafe.ai/introduction/quickstart)
- [Typed primitives](https://docs.typesafe.ai/primitives)
- [Confidence guidance](https://docs.typesafe.ai/confidence)
