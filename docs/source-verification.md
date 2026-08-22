# Source Verification

## Verification classes

`official_docs`, `official_repository`, `government`, `standard`, `research`,
`academic`, `company`, `news`, `reference`, `community`, `video`, `discussion`,
`unknown`.

Verification is a classification with evidence, not a decorative badge.

## Detection rules

### Official documentation

- documentation host is linked from the canonical company/project domain;
- page metadata identifies the project or organization;
- TLS host and redirects resolve to the canonical ownership set;
- no contradictory ownership evidence exists.

### Official GitHub repository

At least two signals are required:

- repository is linked from the canonical project website;
- repository organization links back to that domain;
- package registry metadata points to the repository;
- repository is the canonical upstream for the installed package.

Matching a repository name is never sufficient.

### Government

- controlled government suffix or registry entry;
- jurisdiction is recorded;
- redirected destination remains in the verified ownership set.

### Research and academic

- DOI, OpenAlex, Crossref, PubMed, arXiv, or publisher metadata;
- publication and retraction status where available;
- authors, venue, date, and version retained.

## Verification evidence

```json
{
  "status": "official_docs",
  "label": "Official documentation",
  "method": "site_link_and_domain_match",
  "signals": [
    "Linked from project canonical domain",
    "Documentation host ownership matched"
  ],
  "verified_at": "2026-07-23T12:00:00Z",
  "expires_at": "2026-08-23T12:00:00Z"
}
```

## Failure states

- `verified`: sufficient positive evidence;
- `probable`: useful signals, but ownership is incomplete;
- `unverified`: no reliable ownership evidence;
- `conflicting`: ownership or identity signals disagree;
- `revoked`: a previous verification is no longer valid.

The UI must say “Unverified” rather than implying “unsafe.”
