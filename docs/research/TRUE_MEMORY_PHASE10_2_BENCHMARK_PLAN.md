# TrueMemory Phase 10.2 — Benchmark Plan

## Internal benchmark

Name: **TrueMemory internal benchmark**. It is a deterministic regression suite, not an SOTA claim.

Fixtures cover: single-session facts, preferences, knowledge updates, temporal current/historical queries, multi-session retrieval, abstention on unknowns, cross-agent persistence, forgetting, and workspace/tenant isolation.

Metrics: retrieval hit and rank, content correctness, current-state accuracy, historical accuracy, update correctness, scope correctness, abstention precision, and token/context size where applicable. Every run records code revision, fixture revision, backend, retrieval mode and configuration.

## Public benchmark reproduction

Start with LongMemEval-S using the published dataset, prompts, model, metric and aggregation method. Supermemory reports May 2026, Recall@15 with aggregation, 95% overall and about 720 mean added tokens; this is a Supermemory research claim, not a TrueMemory result. Preserve dataset version, answer model, judge model, seed, retrieval k and date. Then add LoCoMo and SWE-ContextBench with their canonical protocols. Never compare modified protocols as equivalent.

## Readiness

Current readiness: **PARTIAL**. Evaluation runners and benchmark JSON fixtures exist, but the required deterministic phase-specific suite and independent public-benchmark reproduction are not evidenced.

## Acceptance gates

1. Internal suite runs without network or provider keys.
2. Current and historical answers are evaluated separately.
3. Scope leakage is a hard failure.
4. Unknown questions measure abstention rather than forced answers.
5. Cross-agent tests use separate clients and a shared deployment.
6. Public benchmark reports include exact protocol metadata and do not claim parity without reproduction.

