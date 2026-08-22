# Evaluation Engine Implementation Plan

## Phase 0 — contract and risk baseline

Define trace, dataset, case, scorer, run, experiment, review, and gate schemas. Add privacy classifications, redaction rules, tool sandbox policy, and a minimum critical safety suite.

**Exit:** schemas reviewed; no real side effects in eval mode; current Kontext route cases captured as golden tests.

## Phase 1 — deterministic runner (initial slice implemented)

The initial runner executes the router against immutable JSON cases, captures route decisions and assertion results, enforces a release gate, and writes optional JSON reports. Start with mocked search/scrape/provider responses before adding live tool trajectories.

Run it with `npm run test:evaluation` or `python backend/evaluation/run_evals.py --json-out artifacts/evaluation/latest.json`.

**Exit:** smoke/core suites run locally and produce reproducible experiment JSON.

## Phase 2 — scorer registry and datasets

Add code scorers for schemas, routing, URLs, permissions, citations, budgets, and event ordering. Add retrieval metrics, configurable LLM judges, human-review tasks, dataset versioning, deduplication, and holdout protection.

**Exit:** baseline experiment covers utility, direct, memory, document, search, scrape, crawl, agent, failure, and security cases.

## Phase 3 — CI gates

Run smoke suites on pull requests and full regression/adversarial suites on protected branches. Publish immutable reports and fail gates on critical safety, contract, quality, cost, or latency regressions. Add explicit time-limited waivers.

**Exit:** a model, prompt, router, tool, retrieval, or memory change cannot merge without an evaluation result.

## Phase 4 — observability and replay

Instrument production traces with OpenTelemetry-compatible spans, redact sensitive content, sample online scores, and promote reviewed failures into replay datasets. Build sandboxed fixture replay with side-effect blocking.

**Exit:** every reported failure can be linked to a trace and reproduced safely.

## Phase 5 — evaluation control plane

Build Runs, Comparison, Trace Explorer, Failure Explorer, Review Queue, Cost/Latency, and Release Readiness views. Add model/prompt/tool matrix experiments and audit exports.

**Exit:** engineers can identify a regression, inspect its trace, replay it, assign it, and verify the fix without leaving the product.

## Phase 6 — continuous improvement

Add drift detection, judge calibration, benchmark coverage reports, canary comparison, and scheduled production replay. Keep experimental adaptive benchmarks behind feature flags.

## Initial Kontext benchmark

Start with 40–60 cases: runtime facts, stable explanations, current recommendations, URL scrape, document grounding, memory recall, provider fallback, confirmation, cancellation, prompt injection, SSRF, partial crawl failure, and SSE completion/error behavior.

## Acceptance criteria

- Critical safety and contract suites are 100% passing.
- Freshness-sensitive questions route to web evidence.
- Stable questions avoid web tools.
- Every tool call has a reason, trace ID, latency, outcome, and budget record.
- Failed cases are replayable and promotable to versioned datasets.
- Release gates are reproducible from a commit, dataset, scorer, and configuration hash.

## References

- [OpenAI Evals](https://evals.openai.com/)
- [Braintrust evaluation lifecycle](https://www.braintrust.dev/docs/evaluate)
- [LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
- [MLflow GenAI evaluation](https://mlflow.org/docs/latest/genai/eval-monitor/index.html)
