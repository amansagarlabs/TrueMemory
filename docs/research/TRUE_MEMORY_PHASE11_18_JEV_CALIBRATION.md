# TrueMemory Phase 11.18 — Jev Calibration and Shadow Benchmark

Status: **PARTIAL — DETERMINISTIC BASELINE ONLY**

## Fixture set

The validation runner uses nine labeled synthetic fixtures (A–I) across chat
routing, tool risk, memory-write triage, memory relevance, and score decisions.
They are deliberately small and redacted: no production conversation, saved
memory, credential, or database record is sent by the runner.

## Baseline evidence

The local deterministic run produced:

| Metric | Result |
|---|---:|
| memory-depth fixtures | 4 |
| memory-depth accuracy | 0.750 |
| memory-write fixtures | 2 |
| memory-write accuracy | 0.500 |
| deterministic p50 | 0.008 ms |
| deterministic p95 | 0.091 ms |
| deterministic p99 | 0.091 ms |

These are fixture measurements, not production quality claims. The write and
depth labels intentionally expose calibration gaps for future rule refinement;
they do not activate an adaptive learner or change MemoryCore policy.

## Jev comparison

Jev agreement rate, Jev accuracy, Jev p50/p95/p99, shadow overhead, and live
failure behavior are **NOT VERIFIED** because no disposable TypeSafe key was
available. There is no winner or provider-quality claim. The optional
`FastDecisionEvaluator` is a research-only provider-as-judge prototype and is
not imported by chat, MemoryCore, retrieval, authorization, or persistence.

## Required live rerun

Run only with an isolated disposable environment and a server-side
`TYPESAFE_API_KEY`:

```powershell
$env:PYTHONPATH = "backend"
$env:TRUEMEMORY_RUNTIME_ENV = "disposable-test"
$env:APP_ENV = "disposable-test"
python backend/scripts/run_phase11_18_jev_validation.py --disposable-test --output docs/research/TRUE_MEMORY_PHASE11_18_JEV_EVIDENCE.json
```

Do not copy the key into frontend variables, fixture state, evidence JSON, or
committed `.env` files.
