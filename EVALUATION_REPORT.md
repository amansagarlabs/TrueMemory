# Kontext Agent Evaluation Report

## Scope

This report applies the attached Principal AI Evaluation Researcher brief to the current Kontext chat, routing, retrieval, crawl, memory, and streaming system. It evaluates the architecture direction; it is not a claim that every production metric is already instrumented.

## Current strengths

- Deterministic runtime route for date/time questions.
- Explicit route decision and bounded execution plan.
- Separate direct, memory, document, search, scrape, map, crawl, and agent modes.
- Provider fallback and structured source events.
- Confirmation for bounded multi-page agent work.
- Partial-failure and cancellation-oriented SSE contract.
- Route, plan, source, and model metadata persisted with assistant messages.

## Gaps to close

1. No complete immutable benchmark/dataset registry yet.
2. No automated paired experiment runner or release gate in CI.
3. No systematic scoring for route accuracy, groundedness, citation support, tool correctness, or memory quality.
4. Trace fields are present in application events but require a unified OpenTelemetry-compatible trace store.
5. Human review and judge calibration are not yet first-class workflows.
6. Cost and latency need consistent per-request and per-tool aggregation.
7. Production replay needs redaction, fixtures, and side-effect isolation.

## Recommended decision

Adopt the Evaluation Engine as a separate control-plane subsystem over the existing query orchestrator. Start with deterministic contract/routing/security tests and mocked tool trajectories. Add semantic judges and human review only after the baseline trace and dataset contracts are stable.

## Release readiness

Kontext should not claim production-ready agent quality until the initial benchmark passes critical routing, grounding, SSRF, permission, confirmation, cancellation, and event-termination checks. Quality improvements should be accepted only when paired experiments show no safety, reliability, cost, or latency regression.

## Research basis

The design follows verified patterns from [OpenAI Evals](https://evals.openai.com/), [LangSmith](https://docs.langchain.com/langsmith/evaluation-concepts), [Braintrust](https://www.braintrust.dev/docs/evaluate), [OpenTelemetry](https://opentelemetry.io/blog/2024/otel-generative-ai/), [Phoenix](https://arize.com/docs/phoenix), and [MLflow GenAI evaluation](https://mlflow.org/docs/latest/genai/eval-monitor/index.html). These sources support separating datasets, tasks, scores, traces, experiment snapshots, human review, and continuous monitoring.
