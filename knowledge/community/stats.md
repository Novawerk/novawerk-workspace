---
title: Community stats
category: community
status: evolving
source:
  - nw-web-portal/components/home/numbers-counter.tsx
updated: 2026-05-13
---

# Community stats

Hard numbers shown on the homepage ("By the numbers · one year and counting").
These are stable display numbers — they don't auto-update from a database —
so treat the snapshot date below as authoritative.

## Snapshot · 2026-05-13

| Number | Label      |
|--------|------------|
| 2      | Members    |
| 2      | Building   |
| 0      | Shipped    |
| TBD    | Workshops  |

### What each one counts

- **Members** — People with at least one active project or recurring
  contribution role.
- **Building** — Projects currently in `Building` or `Launching` status (see
  [projects overview](../projects/overview.md)).
- **Shipped** — Cumulative count of projects that have reached `Launched`
  status. Does not decrement when a project is later archived.
- **Workshops** — Cumulative count of in-person or online workshops the
  community has run since the start of 2025. Currently `TBD` — needs an
  authoritative count before it goes back on the homepage.

## How to update

Edit `nw-web-portal/components/home/numbers-counter.tsx` (the `stats` array)
and update this file's snapshot date to match. Numbers are intentionally
hand-curated, not pulled from a live data source — quarterly is the
expected cadence.

## Related

- [Projects overview](../projects/overview.md)
- [Community rhythm](./rhythm.md)
