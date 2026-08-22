# Source Scoring

## Trust score

Trust is a `0..100` quality score with visible components:

| Component | Points | Meaning |
| --- | ---: | --- |
| Authority | 0–25 | Primary publisher, recognized institution, accountable author |
| Ownership | 0–20 | Verified relationship to the subject/project |
| Source quality | 0–20 | Citability, specificity, stable passages, metadata |
| Freshness fit | 0–15 | Appropriate recency for the query |
| Corroboration | 0–10 | Agreement from independent owners |
| Transparency | 0–10 | Date, author, references, license/version |

The score is not a probability that the page is true.

## Support confidence

Claim-specific confidence uses:

```text
support =
  0.40 * semantic_relevance
  + 0.35 * entailment
  + 0.15 * quoted_passage_coverage
  + 0.10 * independent_corroboration
```

Labels:

- `very_high`: `>= 0.85`
- `high`: `>= 0.70`
- `medium`: `>= 0.45`
- `low`: `< 0.45`

## Influence

Influence is the fraction of supported answer claims for which a source is
primary or supporting evidence. It is not token attribution and must not be
described as access to model reasoning.

## Freshness

Freshness compares the best known `updated_at` or `published_at` against a
query-class policy. If neither exists, status is `unknown`; retrieval time is
shown separately as “Crawled …”.

## Score calibration

- maintain evaluation sets by query class;
- measure citation precision, claim coverage, official-source recall,
  contradiction disclosure, and calibration error;
- version every scoring change;
- display “experimental” until calibration meets the acceptance thresholds;
- provide score breakdowns and user feedback for false verification.

