# Evaluation UI

The evaluation UI should feel like an engineering control plane—closer to GitHub Actions, Datadog, Grafana, Linear, and Vercel than a chat screen.

## Primary views

1. **Runs:** status, commit, target version, dataset, pass/fail gates, score deltas, cost, and latency.
2. **Run comparison:** side-by-side baseline/candidate metrics, confidence intervals, changed cases, and filterable failure categories.
3. **Trace explorer:** timeline of route, plan, retrieval, tools, models, retries, sources, and errors; never display private chain-of-thought.
4. **Benchmark results:** matrix by intent, risk, language, tool, model, and prompt.
5. **Prompt/model/tool comparison:** paired cases with configuration hashes and per-case deltas.
6. **Failure explorer:** severity, root cause, first seen version, recurrence, owner, and linked dataset case.
7. **Replay viewer:** sandboxed replay with captured fixtures, diffed trajectory, and side-effect status.
8. **Human review queue:** anonymized case, labels, disagreement, assignment, and adjudication.
9. **Cost/latency:** p50/p95/p99, time-to-first-token, cost/task, tokens, tool-call counts, and budget violations.
10. **Release readiness:** required gates, waivers, unresolved critical failures, and approval history.

## Interaction rules

- Every score links to the cases and trace spans that produced it.
- Use explicit labels and icons for pass, warn, fail, skipped, and needs review; do not rely on color alone.
- Keep filters in the URL so investigations are shareable.
- Show data freshness and dataset/scorer versions beside every metric.
- Make “why did this fail?” a first-class action that opens the trace and root-cause fields.
- Provide exportable JSON/CSV for audits and CI systems.

## Privacy and access

Default to redacted content and least-privilege workspace access. Require elevated permission to view sensitive inputs, tool payloads, or restricted traces. Audit all exports and reviewer actions.

## References

- [LangSmith evaluation comparison](https://docs.langchain.com/langsmith/evaluation-concepts)
- [Arize Phoenix tracing and experiments](https://arize.com/docs/phoenix)
- [MLflow GenAI evaluation UI](https://mlflow.org/docs/latest/genai/eval-monitor/index.html)
