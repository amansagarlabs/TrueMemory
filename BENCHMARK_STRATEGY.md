# Benchmark Strategy

## Goal

Benchmarks answer a decision question: did this model, prompt, tool, retrieval setting, memory policy, or planner improve the agent for the work users actually do?

## Benchmark tiers

| Tier | Purpose | Dataset | Gate |
|---|---|---|---|
| Smoke | Fast schema and routing checks | 10–30 deterministic cases | Must pass 100% critical checks |
| Core | Regression protection | Curated golden set | Quality must not regress beyond tolerance |
| Adversarial | Safety and failure behavior | Injection, missing fields, timeouts, malformed tools | Zero critical violations |
| Capability | Broad comparison | Stratified production-like set | Compare scores with confidence intervals |
| Replay | Real behavior | Redacted production traces | Detect drift and unknown failure modes |

## Case design

Each case contains an input, user/workspace scope, expected outcome, allowed tools, forbidden tools, reference evidence, risk tier, and scoring rubric. Cases must include common inputs, ambiguous requests, missing fields, stale information, provider failures, cancellation, partial success, and prompt injection.

For agents, the expected result is not necessarily an exact text match. Store trajectory expectations such as “must route current pricing to search,” “must not scrape a private IP,” or “must ask for confirmation before a bounded crawl.”

## Comparison protocol

Compare one variable at a time where possible. Freeze the dataset version, scorer versions, tool mocks, and budget. Run the same cases against baseline and candidate, then report paired per-case deltas rather than only averages. Use bootstrap confidence intervals for aggregate quality and Wilson intervals for binary safety failures.

For model or prompt matrices, record a complete configuration hash. Never compare mutable playground output with an immutable release experiment.

## Benchmark quality controls

- Keep a hidden holdout set that authors and prompt engineers cannot tune against.
- Prevent duplicate or near-duplicate cases across train, development, and test partitions.
- Review cases for leakage, ambiguous references, and outdated expected evidence.
- Re-score a sample with two human reviewers when an automated judge changes materially.
- Calibrate LLM judges against human labels and monitor judge drift.

## Recommended initial suite for Kontext

1. Utility: current date/time must use runtime and make zero model/web calls.
2. Routing: stable explanation → direct; current recommendation → search; URL → scrape; multi-page comparison → agent.
3. Grounding: answers cite returned sources and do not invent unsupported claims.
4. Failure: provider timeout falls back; crawl partial failure preserves completed pages.
5. UX contract: route, progress, source, completion, error, and cancellation events are ordered and terminate loading state.

## References

- [Braintrust experiments and CI](https://www.braintrust.dev/docs/evaluate/run-evaluations)
- [LangSmith evaluation concepts](https://docs.langchain.com/langsmith/evaluation-concepts)
- [Promptfoo evaluation documentation](https://www.promptfoo.dev/docs/)
