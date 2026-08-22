# Human Review

## Purpose

Human review is the calibration and safety layer for cases where automated scoring is uncertain, high-risk, or disputed. It is not a replacement for deterministic checks or a reason to approve unsafe behavior by majority vote.

## Review queue rules

Route a case to review when:

- an automated judge score is near its pass threshold;
- two scorers disagree beyond the configured margin;
- a safety, privacy, medical, legal, or financial risk flag is present;
- a user reports an answer or the trace shows an unexpected tool;
- a new model/prompt/tool version changes a critical metric;
- the case is sampled for calibration.

Reviewers see the user input, expected outcome, answer, sources, route, plan summary, tool results, policy flags, and latency/cost. Secrets, private credentials, hidden chain-of-thought, and unnecessary personal data remain redacted.

## Annotation schema

Use independent labels for task success, factual correctness, groundedness, citation quality, route/tool correctness, safety, clarity, and severity. Each label has `pass`, `fail`, `uncertain`, and an optional structured reason. Reviewers should not be asked to infer invisible model reasoning; they judge observable behavior and evidence.

## Quality controls

- Two reviewers for high-risk or disagreement cases.
- Adjudication by a senior reviewer when labels conflict.
- Blind comparison for model/prompt A/B tests.
- Periodic calibration set with known labels.
- Agreement statistics such as Cohen’s kappa or Krippendorff’s alpha.
- Reviewer workload, turnaround, and disagreement tracking.

## Feedback loop

Promote adjudicated failures into a versioned dataset with the failure category, corrected expectation, and privacy classification. Do not automatically train on raw user feedback. Human labels calibrate judges, update thresholds, and identify missing benchmark classes.

## References

- [LangSmith evaluation and annotation queues](https://www.langchain.com/langsmith/evaluation)
- [Braintrust online evaluation](https://www.braintrust.dev/docs/evaluate)
- [MLflow GenAI evaluation](https://mlflow.org/docs/latest/genai/eval-monitor/index.html)
