# CI/CD Evaluation

## Pipeline

```text
pull request -> contract + smoke evals -> core regression evals
             -> security gate -> cost/latency gate -> review result
merge        -> full benchmark + experiment snapshot -> deploy candidate
production   -> online trace scoring -> sampled replay -> dataset promotion
```

## Gates

**Required:** all schema, routing, permission, SSRF, and critical safety tests pass.

**Quality:** no regression beyond the configured paired-delta threshold; critical benchmark categories meet absolute floors.

**Operations:** p95 latency, time-to-first-token, cost/task, retry rate, and provider failure rate remain within budgets.

**Human review:** high-risk or judge-disagreement cases are reviewed before release.

## Run modes

- Pull requests: deterministic smoke plus a seeded sample of core cases.
- Main branch: complete core and adversarial suites.
- Release candidates: full benchmark matrix, replay suite, and human review queue.
- Production: asynchronous online scoring and drift monitoring with no added request latency.

## Required artifacts

Each CI run publishes run ID, git SHA, configuration hash, dataset/scorer versions, per-case results, aggregate metrics, failed traces, and a machine-readable gate decision. The PR status must link to the experiment and failure traces.

## Secrets and cost controls

Use mock providers by default. Live-provider evals require explicit environment protection, spend limits, rate limits, and redacted logs. Never expose API keys in traces or evaluator prompts.

## Rollout

Use canaries for model and prompt changes. Compare candidate and baseline on matched traffic or replay samples. Automatically pause rollout on critical safety violations or statistically significant reliability degradation.

## References

- [Braintrust evaluation in CI/CD](https://www.braintrust.dev/docs/evaluate/run-evaluations)
- [OpenTelemetry GenAI signals](https://opentelemetry.io/blog/2024/otel-generative-ai/)
