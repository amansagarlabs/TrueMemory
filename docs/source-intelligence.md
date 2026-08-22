# KONTEXT Source Intelligence

## Product thesis

A citation is not proof. It is a pointer that still leaves the user to decide
whether the page is current, authoritative, independent, and actually relevant
to the claim. Source Intelligence turns each pointer into an inspectable
evidence object.

The system answers five questions:

1. Where did this claim come from?
2. What kind of source is it?
3. Why was it selected?
4. How strongly did it support the answer?
5. Is the evidence fresh and independently corroborated?

Trust and confidence are never presented as model certainty. Trust describes
observable source qualities. Confidence describes measured support for a
specific answer or claim. Both expose their components and unknowns.

## Research synthesis

- ChatGPT Search uses inline citations, hover previews, and a separate Sources
  surface. The useful lesson is progressive disclosure, not its citation-pill
  styling. [OpenAI Search help](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu)
- Claude's API returns exact cited passages and source locations as structured
  data. KONTEXT should retain the supporting excerpt rather than reconstruct it
  from Markdown. [Claude citations](https://platform.claude.com/docs/en/build-with-claude/citations)
- NotebookLM lets users hover to read the quoted passage and navigate to its
  location. KONTEXT should do the same for pages, chunks, and documents.
  [NotebookLM chat citations](https://support.google.com/notebooklm/answer/16179559)
- Google AI Search places links beside the supported point and previews the
  destination before navigation. KONTEXT should keep claim and evidence
  spatially close. [Google AI Search link previews](https://blog.google/products-and-platforms/products/search/explore-web-generative-ai-search/)
- Glean supports deep links to the exact enterprise passage. KONTEXT should
  preserve page/chunk anchors when providers supply them.
  [Glean citations](https://docs.glean.com/user-guide/assistant/glean-chat/glean-chat-citations/glean-citations)
- Research on generative search has repeatedly found that a visible citation
  does not guarantee that the source supports the claim. KONTEXT must measure
  coverage and entailment separately.
  [Evaluating Verifiability in Generative Search Engines](https://aclanthology.org/2023.findings-emnlp.467.pdf)

## KONTEXT vocabulary

| Object | Meaning |
| --- | --- |
| Source | Canonical publisher/document identity |
| Snapshot | Content retrieved at a specific time |
| Evidence | Exact passage or data item used to support a claim |
| Claim | A checkable statement in the generated answer |
| Relation | Corroborates, conflicts, cites, duplicates, or supersedes |
| Evidence role | Primary, supporting, background, or ignored |
| Trust score | Explainable source-quality score, not truth probability |
| Support confidence | Claim-specific evidence strength |
| Influence | Share of supported answer claims attributable to a source |

## Current audit

The current system already has stable source IDs, URL/title/domain/snippet
normalization, structured SSE source events, hover cards, and a Sources drawer.
Its limitations are:

- cards expose title/domain/snippet but not why the source was selected;
- source type is provider-oriented rather than evidence-oriented;
- citations are mapped to sources, but not to claims or exact passages;
- freshness, official ownership, corroboration, and conflict are absent;
- no distinction exists between retrieved, cited, and materially used sources;
- no persisted source identity or version history exists;
- the UI cannot explain a score because the backend does not return components.

## Architecture

```text
retrieval result
  -> canonicalize and deduplicate
  -> metadata + ownership enrichment
  -> source verification classifier
  -> content snapshot and hash
  -> evidence passage extraction
  -> claim/evidence alignment
  -> trust + support + freshness scoring
  -> cross-source corroboration graph
  -> ranked evidence bundle
  -> structured SSE
  -> inline intelligent reference + Source Explorer
```

## Product guardrails

- Never equate domain popularity with truth.
- Never label a GitHub repository “official” from its name alone.
- Never infer freshness from retrieval time when publication/update time is
  unknown.
- Never expose hidden chain-of-thought. “Reason used” is a short retrieval and
  evidence explanation.
- Never collapse disagreement into a single confidence score.
- Always display which score inputs are missing.
- Keep every score versioned so historical answers remain explainable.

