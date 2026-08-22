# Evaluation Observability

## Trace model

Emit one trace per user request and nested spans for normalization, route decision, plan creation, memory retrieval, document retrieval, search, scrape, crawl, model calls, scoring, retries, and finalization. Use a stable correlation ID across frontend SSE, backend logs, provider calls, and persisted messages.

## Required attributes

Record agent version, model/provider, prompt version, tool name/version, route, reason code, dataset/case ID, workspace scope, input/output token counts, cache hits, retry number, status, error class, duration, cost estimate, source IDs, and safety flags. Redact prompts or outputs containing secrets and sensitive user data.

## Signals

- **Traces:** execution lineage and tool/model timing.
- **Metrics:** success, failure, route accuracy, citation support, latency percentiles, cost, retries, safety violations, and judge disagreement.
- **Events:** route decisions, source discovery, confirmation, cancellation, fallback, release gates, and human review outcomes.

Use [OpenTelemetry GenAI guidance](https://opentelemetry.io/blog/2024/otel-generative-ai/) and semantic conventions as the interoperability baseline. Phoenix demonstrates a practical trace-to-evaluation workflow for model calls, retrieval, tools, and custom logic ([Phoenix docs](https://arize.com/docs/phoenix)).

## Monitoring and alerts

Alert on critical safety events immediately; route/provider failure spikes, grounding regressions, p95 latency, cost/task, and cancellation failures by service and version. Sample normal traces, retain all error and high-risk traces, and preserve links from dashboards to the exact replayable trace.

## Data retention

Apply separate retention for raw content, redacted traces, aggregate metrics, and audit records. Encrypt sensitive stores, restrict access by workspace, and support deletion requests without breaking aggregate reports.

## References

- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OpenTelemetry for Generative AI](https://opentelemetry.io/blog/2024/otel-generative-ai/)
- [Arize Phoenix](https://arize.com/docs/phoenix)
- [MLflow GenAI evaluation and monitoring](https://mlflow.org/docs/latest/genai/eval-monitor/index.html)
