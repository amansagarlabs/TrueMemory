# Regression Testing

## Policy

Every change to a model, prompt, router, tool adapter, retrieval index, memory policy, or safety rule must run the relevant evaluation suites. The release decision is based on paired comparison with the last approved baseline.

## Test layers

1. **Contract tests:** event schemas, source schemas, route modes, permissions, and loading-state termination.
2. **Deterministic tests:** runtime date/time, URL validation, SSRF blocking, budgets, cancellation, and retry limits.
3. **Mocked trajectory tests:** tool selection, dependencies, fallbacks, partial failures, and confirmation behavior.
4. **Golden outcome tests:** curated answers and grounded citations.
5. **Adversarial tests:** injection, jailbreak, secret leakage, malicious pages, and unauthorized actions.
6. **Replay tests:** redacted production traces selected by failure class and user feedback.

## Baselines

Store an immutable baseline experiment with dataset, target, scorer, and environment hashes. A regression is any of:

- a critical safety violation;
- a route or schema contract failure;
- quality below the absolute floor;
- statistically credible degradation beyond the allowed delta;
- latency or cost exceeding the budget;
- increased unhandled failure or cancellation rate.

Allow an explicit, reviewed waiver with owner, reason, expiry, and compensating test. Never silently update the baseline to make a failing run pass.

## Failure triage

Attach every failed case to its trace. Classify the root cause as model, prompt, router, tool, retrieval, memory, data, infrastructure, evaluator, or user ambiguity. Fix the smallest responsible layer and add the case to the permanent regression set.

## Flakiness

Run nondeterministic cases at least twice in pre-merge smoke tests and use a fixed seed/configuration where supported. Track flaky-case rate separately. Do not hide instability by averaging repeated runs.

## Replay safety

Replay must use mocked or sandboxed side effects, frozen time where relevant, redacted secrets, and a captured tool-response fixture. Production replay must never re-send a real email, mutate a ticket, or crawl an unapproved host.

## References

- [Braintrust CI/CD evaluation](https://www.braintrust.dev/docs/evaluate/run-evaluations)
- [OpenAI Evals](https://evals.openai.com/)
- [OpenTelemetry general semantic conventions](https://opentelemetry.io/docs/specs/semconv/general/)
