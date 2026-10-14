---
title: Projects overview
category: projects
status: evolving
source:
  - nw-web-portal/scripts/migrate-portfolio.ts
  - nw-web-portal/lib/portfolio-fallback.ts
updated: 2026-10-10
---

# Projects overview

Two projects are currently part of the Novawerk portfolio. Statuses move
through `Planning → Building → Launching → Launched` (and may end up
`Archived`, which we filter out of public surfaces).

Authoritative seed list: `nw-web-portal/scripts/migrate-portfolio.ts` (run via
`pnpm migrate:portfolio`).

## At a glance

| Project                  | Category   | Year | Status    | Featured | One-liner                                                                 |
|--------------------------|------------|------|-----------|----------|---------------------------------------------------------------------------|
| Berlin Chinese Food Map  | App        | 2026 | Launched  | ✓        | Community-curated, non-profit guide to Chinese restaurants in Berlin.     |
| YIMA                     | App        | 2026 | Launched  | ✓        | Privacy-first period calendar, designed without profit as a constraint.   |

## Incubation

Earlier-stage ideas the community is exploring. Not yet seeded into the
portfolio — no scope assigned, no shipping commitment. Listed here so the
KB reflects what's actually being kicked around, not just what's already
in Payload. Expect turnover: ideas either graduate to `Planning` or get
shelved.

- Bouldering solution visualizer
- 德国华人故事 (German-Chinese stories)
- 爱（AI）看车 (AI-assisted car shopping)
- Find a not-so-busy working space
- Where to find the cheapest chicken breast nearby (app)
- 高血压测量提醒/记录 (hypertension reading reminder + log)

## What each status means

- **Planning** — Scope is being cut down; first work items assigned; no shipping yet.
- **Building** — First useful artifact exists and is being iterated. Most
  projects sit here longest.
- **Launching** — Public-facing release in progress; pilot users on board.
- **Launched** — Externally usable, with a stable cadence (releases or events).
  Still being improved.

## What this list is not

- **Not a showcase.** The site phrases it as *a worksite* — every entry is
  still being improved.
- **Not exhaustive.** Some projects start as conversations and never become
  portfolio items. The list reflects what's been seeded into Payload.
- **Not a roadmap.** The order is editorial (the `order` field on each
  portfolio item), not chronological or by priority.

## Where to look for project detail

For long-form descriptions, methods, and results, read the project body in
the seed file (`scripts/migrate-portfolio.ts`) or the live portfolio page at
`novawerk.io/portfolio/<slug>`. We deliberately do not duplicate that copy
here — per-project detail belongs in the source of truth that ships to the
website.

## Related

- [How we work](../operations/how-we-work.md)
- [Titles and roles](../operations/titles-and-roles.md)
- [Community stats](../community/stats.md)
