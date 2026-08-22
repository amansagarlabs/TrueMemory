# Source Intelligence UI

## Direction

Dark-first, compact, and operational. The UI borrows the density and restraint
of Linear, Cursor, GitHub, and Vercel, while keeping KONTEXT's orange evidence
accent. It does not use a horizontal carousel of generic source cards.

## Intelligent inline reference

The collapsed reference is a compact evidence token:

```text
[1 · Official · 92]
```

The token includes a number, verification shorthand, and trust score. Color is
secondary to text and iconography.

Hover, focus, or press opens:

- title, domain, favicon, and verification;
- exact supporting quote;
- reason selected;
- trust score with component breakdown;
- claim support confidence;
- freshness and last crawl;
- evidence role;
- independent corroboration count;
- direct “Open evidence” action.

## Source card

The card header holds identity. The body explains evidence.

```text
favicon  Title                               92
         domain · Official documentation

“Exact supporting passage…”

PRIMARY EVIDENCE  HIGH SUPPORT  UPDATED 2D AGO
Selected because this is the canonical API reference.

Verified by 4 independent owners                 Expand
```

Cards use concentric radii, 8px spacing, tabular numbers, 44px controls, and no
gratuitous animation.

## Source Explorer

The existing Sources sheet becomes Source Explorer with four compact views:

1. **Overview** — coverage, average trust, freshness, conflicts.
2. **Ranking** — ordered evidence cards and score breakdowns.
3. **Relations** — accessible list/graph of corroboration and conflict edges.
4. **Timeline** — published, updated, retrieved, and superseded events.

The initial implementation ships Overview + Ranking. Relations and Timeline use
the same contract and can follow without redesigning source cards.

## Accessibility

- reference tokens are buttons with descriptive accessible names;
- hover content also opens by keyboard focus and touch press;
- trust is always rendered as text and number, never color alone;
- score details use definition lists;
- graph relations have a text-table equivalent;
- reduced motion disables drawer/card choreography;
- the panel remains functional at 200% zoom.

