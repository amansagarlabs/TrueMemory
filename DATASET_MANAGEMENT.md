# Dataset Management

## Dataset types

- **Golden:** hand-authored cases with reviewed expected outcomes.
- **Production replay:** redacted traces selected by outcome, feedback, or risk.
- **Synthetic:** generated coverage for edge cases, always sampled for human validation.
- **Adversarial:** prompt injection, jailbreak, data exfiltration, malformed tool responses, and hostile web content.
- **Holdout:** hidden cases reserved for release decisions.

## Versioning

A dataset version is immutable. Store case ID, input, expected outcome, evidence references, allowed/forbidden tools, risk tier, source provenance, author, reviewer, created time, and schema version. A new expected answer creates a new version; it must not rewrite historical runs.

## Privacy

Classify each case as public, internal, sensitive, or restricted. Redact identifiers and secrets before storage. Keep production replay data in the narrowest workspace scope and enforce retention/deletion policies. Dataset exports must include only fields permitted by the case classification.

## Splits and sampling

Use stratified train/development/holdout partitions by intent, tool, risk, language, and failure class. Deduplicate semantic near-matches. Preserve a fixed smoke sample and a seeded random sample for CI. Avoid tuning prompts against the holdout.

## Promotion workflow

```text
trace/author -> normalize -> privacy review -> label -> dataset candidate
             -> duplicate/leakage checks -> reviewer approval -> immutable version
```

Every promoted failure needs a reproducible trace or a clear authored expectation. Retire cases only with a reason and replacement coverage.

## References

- [LangSmith datasets and experiments](https://docs.langchain.com/langsmith/evaluation-concepts)
- [MLflow evaluation datasets](https://mlflow.org/docs/latest/genai/datasets/)
- [Braintrust datasets in evaluations](https://www.braintrust.dev/docs/annotate/datasets/use-in-evaluations)
