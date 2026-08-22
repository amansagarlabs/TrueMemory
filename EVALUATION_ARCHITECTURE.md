# Evaluation Architecture

## Purpose

The Evaluation Engine is a first-class platform subsystem for measuring an agent’s outcomes, trajectory, tool use, retrieval, memory, safety, latency, and cost across development and production.

## Evidence classes

**Verified practice.** Production evaluation systems separate datasets, a task under test, and scores; preserve immutable experiment snapshots; compare experiments; and combine offline tests with online trace scoring. This pattern is documented by [LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts) and [Braintrust evaluation documentation](https://www.braintrust.dev/docs/evaluate).

**Recommended architecture.** Kontext should implement one Evaluation API over a versioned runner, dataset registry, scorer registry, trace store, and release gate. The runner must evaluate the whole agent system—not only the final text.

**Experimental.** Learned trajectory judges, automatic counterfactual tool replay, and adaptive benchmark generation should remain opt-in until their agreement with human reviewers is measured.

## Core components

1. **Evaluation API** — starts runs, accepts datasets, selects a target agent version, and returns run IDs.
2. **Evaluation Runner** — executes cases with deterministic seed/configuration where possible, captures every tool and model span, enforces time/cost budgets, and supports cancellation.
3. **Dataset Registry** — stores immutable dataset versions, case metadata, reference answers, expected tool constraints, and privacy classification.
4. **Scorer Registry** — code scorers, schema checks, retrieval metrics, safety policies, LLM judges, and human-review tasks with versioned definitions.
5. **Trace Store** — links request, route decision, plan, tool calls, retrieval, model calls, retries, and final output with a correlation ID.
6. **Experiment Store** — records immutable run snapshots, configuration hashes, per-case scores, aggregate confidence intervals, and artifacts.
7. **Release Gate** — evaluates thresholds, critical-case rules, cost/latency budgets, and safety blockers; emits pass, warn, or fail.
8. **Review Queue** — samples uncertain, high-risk, or disagreement cases for human adjudication.
9. **Reporting API/UI** — provides run comparison, trace exploration, failure analysis, model/prompt/tool comparisons, and CI status.

## Evaluation lifecycle

```text
Production traces / authored cases
        -> dataset version
        -> runner + target version
        -> trace + scores
        -> experiment snapshot
        -> comparison + release gate
        -> deployment decision
        -> sampled production traces feed the next dataset version
```

Every run must record agent version, model/provider, prompt version, tool registry version, retrieval configuration, memory policy, dataset version, scorer versions, environment, and cost/latency limits.

## Safety boundaries

Evaluation data is untrusted input. Run agents in a sandbox, scope credentials, redact secrets, block real side effects by default, and use synthetic or mocked tools for destructive operations. Prompt-injection cases must be evaluated as data, never as evaluator instructions.

## References

- [OpenAI Evals](https://evals.openai.com/)
- [LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
- [Braintrust systematic evaluation](https://www.braintrust.dev/docs/evaluate)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
