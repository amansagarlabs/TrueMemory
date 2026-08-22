# Evaluation Metrics

Metrics must be reported per case and in aggregate. A single quality score is insufficient for an agent with tools, memory, and permissions.

## Outcome quality

- **Task success:** completed intended outcome / eligible cases.
- **Correctness:** exact match, structured-field accuracy, or rubric score where references exist.
- **Groundedness:** claims supported by retrieved evidence.
- **Citation precision/recall:** cited sources support claims and required sources are present.
- **Human usefulness:** calibrated reviewer score and user satisfaction.

## Trajectory quality

- **Route accuracy:** correct route selected for the request.
- **Tool selection accuracy:** allowed/best tool chosen.
- **Plan validity:** dependencies, bounded steps, and required confirmation respected.
- **Unnecessary work rate:** avoidable tool calls, retries, or retrieval.
- **Recovery rate:** failures that reach a safe, useful terminal state.
- **Policy adherence:** forbidden tools, private-network access, and unsafe actions.

## Reliability and operations

- Success, failure, timeout, cancellation, and retry rates.
- p50/p95/p99 end-to-end latency and time-to-first-token.
- Tool latency and provider error rate.
- Checkpoint/replay recovery rate.
- Cost per successful task, token counts, and tool-call counts.
- Variance across repeated runs on deterministic cases.

## Retrieval and memory

- Recall@k, precision@k, MRR, nDCG, context relevance, and answer support.
- Memory recall accuracy, stale-memory rate, duplicate-memory rate, poisoning resistance, and context usefulness.

## Safety

- Refusal precision/recall for disallowed cases.
- Prompt-injection and jailbreak success rate.
- Secret leakage rate and unauthorized tool-action rate.
- Hallucination rate on verifiable claims.
- Critical violations must be counted separately; they cannot be averaged away.

## Statistical rules

Report sample size, missing/failed cases, confidence intervals, and paired deltas. Do not declare improvement from a small average increase if a safety or reliability metric regresses. Define minimum practical improvements before running an experiment.

## Scorer policy

Use deterministic code for schemas, routing, URLs, permissions, counts, and latency. Use retrieval metrics when references exist. Use LLM judges for semantic quality only after calibration against human labels. Use humans for high-risk, disputed, or judge-disagreement cases.

## References

- [LangSmith evaluator concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
- [Braintrust evaluation anatomy](https://www.braintrust.dev/docs/evaluate)
- [OpenTelemetry GenAI observability](https://opentelemetry.io/blog/2024/otel-generative-ai/)
