# TrueMemory Fast Decision Contract

Status: **IMPLEMENTED — deterministic default; embedded OPA and Groq optional**

The Fast Decision Layer is agent-harness infrastructure. It is not part of
MemoryCore, MemoryClient, the public memory API, the MemoryGovernor, the
ConflictResolver, or the revision engine.

## Contract

`FastDecisionProvider.evaluate(DecisionRequest)` accepts minimal state and one
or more typed `DecisionQuestion` values (`noul`, `choice`, or `score`). It
returns `FastDecisionResult` with normalized values, provider/model metadata,
latency, confidence, request/run correlation, status, and fallback state.

Convenience methods `classify`, `choose`, and `score` build the same contract;
they do not introduce provider-specific types.

## Providers

- `DeterministicFastDecisionProvider` is local, dependency-free, and the
  authoritative fallback. It uses existing memory-intent signals and
  conservative tool/model heuristics.
- `JevFastDecisionProvider` is a historical isolated HTTP adapter. It sends only the
  request state and typed questions to the server-side TypeSafe endpoint. The
  API key is never part of frontend or public memory contracts.

The adapter follows the documented TypeSafe System One shape:
`POST /v1/systemone`, `state`, optional `model`, typed `questions`, and typed
`answers`. The configured model is `TYPESAFE_DEFAULT_MODEL`; no moving model
alias is hard-coded into application policy.

## Modes and policy

```ini
FAST_DECISION_PROVIDER=deterministic
FAST_DECISION_MODE=disabled
```

- `disabled`: deterministic path only; no Jev request.
- `shadow`: deterministic result remains authoritative; optional provider is
  observed and compared.
- `active`: only the `FastDecisionPolicy` may apply a high-confidence,
  low-risk result for routing/retrieval suggestions. Tool authorization,
  memory writes, forgetting, consolidation, tenant scope, and revisions remain
  outside this policy and cannot be bypassed.

Missing keys, timeouts, malformed responses, 429, and transient 5xx responses
fall back to deterministic behavior. Retry ownership is inside the thin Jev
client and reuses `services.retry_policy` with bounded attempts, backoff,
Retry-After handling, and an idempotency key.

## Data governance

The current chat shadow state is limited to the user message (length-capped),
task type, project identifier, and availability booleans. It does not include
saved memory, credentials, conversation history, or database records. Shadow
telemetry stores provider metadata and comparison results, never the state or
question text. Disable the feature with `FAST_DECISION_MODE=disabled`.

## Decision engine replacement path

`EmbeddedOpaEngine` is an optional in-process evaluator for a compiled
`backend/policies/decision.rego` Wasm artifact. It makes no HTTP requests and
does not require an OPA server. `GroqDecisionProvider` is an optional
server-side HTTP advisor selected only with `AI_DECISION_ENABLED=true` and
`FAST_DECISION_PROVIDER=groq`. Groq receives bounded decision state and typed
questions, never raw memory storage or credentials. OPA/deterministic results
remain the safe path when Groq is missing or fails.

## Evidence boundary

Focused local tests cover the contract, deterministic golden behavior, Jev
retry/failure parsing, fallback, confidence policy, telemetry redaction, and
MemoryCore import isolation. A live Jev key, live model-version behavior, and
production latency/calibration are **NOT VERIFIED**. Phase 11.18 adds the
guarded `run_phase11_18_jev_validation.py` evidence runner, synthetic A–I
fixtures, a server-side model-discovery check, and the isolated experimental
`FastDecisionEvaluator`. A missing key produces explicit `NOT_VERIFIED`
evidence; no production activation or MemoryCore write is possible.
