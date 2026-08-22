# Source Intelligence Roadmap

## Phase 1 — deterministic foundation

- [x] Audit current source and citation pipeline.
- [x] Define source, verification, scoring, and API contracts.
- [x] Add canonicalization, deterministic verification, and explainable scoring.
- [x] Extend SSE/TypeScript source fields.
- [x] Replace the Sources sheet with Source Explorer Overview + Ranking.
- [x] Upgrade inline citation hover content.

## Phase 2 — persistence and claim grounding

- [x] Add source identity/snapshot/evidence tables.
- [ ] Persist exact cited passages and answer ranges.
- [ ] Add claim segmentation and entailment scoring.
- [ ] Add content-version and supersession tracking.
- [ ] Emit `source.intelligence` and `answer.evidence`.

## Phase 3 — cross verification

- [ ] Cluster claims across independently owned sources.
- [ ] Detect corroboration, conflict, syndication, and mirrors.
- [ ] Add Relations and Timeline views.
- [ ] Add official domain/repository ownership registries.
- [ ] Integrate DOI/OpenAlex/Crossref/retraction metadata.

## Phase 4 — evaluation and rollout

- [ ] Citation precision and recall benchmarks.
- [ ] Official-source recall and false-verification rate.
- [ ] Trust-score calibration and explanation comprehension study.
- [ ] Accessibility QA at keyboard-only, screen reader, mobile, and 200% zoom.
- [ ] Feature-flag rollout with stored score versions and rollback.

## Acceptance targets

- 100% of displayed scores expose components and version.
- 0 sources labeled official from name matching alone.
- 95%+ canonical URL duplicate merging on the evaluation set.
- 90%+ citation precision for structured passage-backed sources.
- Every material conflict is surfaced rather than averaged away.
