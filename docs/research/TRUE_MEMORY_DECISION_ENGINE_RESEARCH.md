# TrueMemory Decision Engine Research

## Executive Summary

TrueMemory now has a provider-independent decision boundary: deterministic
signals are always available, an optional compiled OPA-Wasm policy is evaluated
in-process, and Groq is an opt-in hosted semantic advisor. MemoryCore remains
the source of truth and no decision provider can bypass authorization,
governance, conflict resolution, or persistence rules.

## Current Jev Architecture

The previous Phase 11.x adapter remains in the repository for historical
validation evidence and compatibility tests. It is no longer the target
provider path and is not required for startup or normal memory behavior.

## Why Jev Is Being Removed

The application needs a local policy boundary that works without a vendor
service. Jev/TypeSafe live access was not verified, so the new architecture
does not make it a runtime dependency.

## Decision Requirements

The engine must be deterministic by default, explainable, scope-safe,
server-side, bounded in latency, and able to continue when the network and all
AI providers are unavailable.

## Deterministic Decision Layer

`DeterministicFastDecisionProvider` remains the fallback and source of
conservative memory-depth, memory-write, tool-risk, and model-routing signals.
Its outputs are not treated as ground truth; labeled benchmarks are required
for quality claims.

## OPA Evaluation

Rego policies live under `backend/policies/decision.rego`. The optional
`EmbeddedOpaEngine` loads `policy.wasm` through `opa-wasm` and evaluates it in
the Python process. Missing artifacts produce a safe deterministic path.
OPA results do not carry fabricated probability confidence.

## OPA Wasm Embedding

OPA documents compiling Rego with `opa build -t wasm -e ...` and evaluating the
compiled module in another runtime ([OPA Wasm documentation](https://www.openpolicyagent.org/docs/wasm)).
The repository includes `build_opa_policies.ps1`; it does not start an OPA
server. The Python package is optional at runtime because the compiled bundle
may not yet exist in a development checkout.

## Why OPA Does Not Need Hosting

Policy evaluation is local and uses no HTTP endpoint, `OPA_URL`, or port 8181.
Docker Compose and Render do not need an OPA service.

## OPA vs Jev

OPA is local, policy-oriented, explainable, and confidence-free. Jev was a
remote typed decision advisor. Jev live behavior was not verified; the new
production architecture does not depend on it.

## OPA vs LLM-Only Decisions

OPA and deterministic logic resolve clear policy decisions without inference
latency. AI is considered only for semantic ambiguity and cannot authorize
destructive operations.

## Optional Hosted AI Advisor

`GroqDecisionProvider` is an HTTP-only, provider-neutral implementation behind
the existing decision contract. It is disabled by default and falls back to
OPA/deterministic logic when missing, invalid, rate-limited, or unavailable.

## Groq API Analysis

Groq's official documentation lists `openai/gpt-oss-20b` and
`openai/gpt-oss-120b` as supported for strict structured outputs, and documents
the OpenAI-compatible API shape ([structured outputs](https://console.groq.com/docs/structured-outputs), [models](https://console.groq.com/docs/models)).
The default is `openai/gpt-oss-20b`; model availability remains provider-side
configuration and should be verified before live use.

## Free-Tier Constraints

No unlimited-use assumption is made. OPA is evaluated first, AI escalation is
opt-in, retries are bounded, and no paid provider fallback is implemented.

## Data Minimization

Groq receives only a bounded decision type, selected state fields, and typed
question definitions. It does not receive the memory database, credentials,
full conversation, or tool history.

## Security Boundary

User/tenant/workspace isolation, authorization, deletion, permissions,
database constraints, and MemoryCore writes remain application-enforced.

## Failure Handling

Groq failures fall back to the local policy/deterministic path. OPA artifact or
runtime failures are logged as redacted metadata and do not prevent startup.

## Observability

Decision telemetry records provider, policy/model, latency, fallback, and
failure class without raw state or API keys.

## Benchmark Design

Use human-labeled cases by decision class: memory relevance/depth, memory write,
temporal state, tool risk, and model routing. Compare each provider to labels;
do not call provider agreement accuracy.

## Benchmark Results

The OPA-Wasm and live Groq paths are **NOT VERIFIED** in this environment.
Existing deterministic Phase 11.18 results remain fixture-only and are not
ground truth.

## Target Architecture

```text
MemoryCore → DecisionEngine → deterministic + embedded OPA
                         └→ optional Groq advisor
                                  ↓
                           validated advisory result
```

## Risks

OPA bundles can become stale; Wasm runtime compatibility must be checked in
Windows and Render builds; Groq structured output can still be unavailable if
the configured model changes; free-tier rate limits can cause fallback.

## Remaining Unknowns

Live Groq latency/cost, compiled OPA artifact performance, Render package
compatibility, and labeled decision quality require isolated validation.
