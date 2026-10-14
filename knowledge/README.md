# Novawerk knowledge base

Canonical facts about the **Novawerk** organisation — who we are, what we
believe, how we work, what we're building. Optimised for humans skimming on
GitHub and for AI agents that need a ground-truth source.

This folder answers questions like:

- *What is Novawerk's tagline / mission / brand voice?*
- *What are the three principles?*
- *How do projects move from idea to shipped?*
- *How do people join, and what roles can they take on a project?*

It does **not** try to answer:

- *Which projects are in the portfolio right now?* — that lives in the `projects` table, edited in the admin panel and shown on `novawerk.io`.
- *What does the website look like?* — see `apps/web` in this repo.
- *Who specifically is on the team?* — see [`culture/team/`](./culture/team/) (placeholder for now).

---

## Index

### Culture

Who we are, what we believe, who's on the team.

- [Name and tagline](./culture/name-and-tagline.md)
- [Vision and mission](./culture/vision-and-mission.md)
- [Founding story](./culture/founding-story.md) — *placeholder*
- [Team](./culture/team/) — *placeholder*
- **Principles:**
  - [01 — Purposeful Innovation](./culture/principles/01-purposeful-innovation.md)
  - [02 — Build, Learn, Together](./culture/principles/02-build-learn-together.md)
  - [03 — Responsibility for Positive Change](./culture/principles/03-responsibility.md)
  - [Community pledge](./culture/principles/pledge.md)

### Brand

How Novawerk looks and sounds.

- [Voice](./brand/voice.md)
- [Visual identity (VI) guide](./brand/visual-identity.md) — logo lockups, colour, type, shape, motion (M3-Expressive flavour)
- [Brand mark (Nova Star)](./brand/mark.md) — the four-pointed star logo, with raw assets in [`brand/assets/`](./brand/assets/)

### Operations

How the work happens.

- [How we work](./operations/how-we-work.md) — the four-step process
- [Ways to join](./operations/ways-to-join.md) — how to enter
- [Members and project roles](./operations/titles-and-roles.md) — everyone is a Member (no tiers), plus project-level Initiator + function roles
- [Meetings and ceremonies](./operations/meetings-and-ceremonies.md) — the five meetings we run, and the principles that keep them worth attending
- [Open by default](./operations/open-by-default.md) — our working constraint
- [Agent starter](./operations/agent-starter.md) — building an AI agent? Start from the public `Novawerk/agent-starter` template

### Community

Who's there, when, and where to talk.

- [Stats](./community/stats.md) — members, projects, workshops (snapshot)
- [Channels](./community/channels.md) — email, Discord, GitHub, newsletter
- [Rhythm](./community/rhythm.md) — open days, workshops, AMAs
- [Promotion playbook](./community/promotion/) — six post types, launch checklist, platform distribution

### Projects

- [Portfolio overview](./projects/overview.md) — **historical snapshot (May 2026)**; the live portfolio is in the database

### Legal

- [Legal](./legal/) — *placeholder for terms, privacy, code of conduct, licensing*

---

## File format

Every fact file uses the same shape:

```markdown
---
title: <fact name>
category: culture | brand | operations | community | projects | legal | meta
status: stable | evolving
source:
  - nw-web-portal/<relative/path>
updated: YYYY-MM-DD
---

# <Fact title>

<One-paragraph summary.>

## Details
…

## Related
- [other KB file](../path/to/file.md)
```

- **No line numbers in `source:`** — they rot. File paths only.
- **`status: stable`** — should rarely change. **`status: evolving`** —
  expect periodic refresh (stats, channels, things still being designed).
- **`updated:`** — ISO date (`YYYY-MM-DD`). Set whenever the file's body changes.

## How to use this folder

### As a human

Click through the index. Read what you need. Every fact has a `source:`
field pointing at where to verify it.

### As an AI agent

Read individual fact files for canonical wording. Each carries a `source:`
field in its frontmatter. Older files cite `nw-web-portal/...` (archived);
treat those as historical provenance. Flag `status: evolving` facts older
than a quarter.

### From another repo

Use the `nw-knowledge-base` skill (in `.claude/skills/` of
`Novawerk/novawerk-workspace`). It sparse-clones just this folder. The other Novawerk skills (`jira`,
`nw-bootstrap-project`) live there too.

### The website reads this folder

`apps/web` renders mission, principles, the four-step process and the pledge
straight from these files. Editing them changes the site on the next deploy.

## Scope decisions made for this snapshot

For the record:

- **Single project overview**, not per-project files. Long-form project
  copy lives in `nw-web-portal/scripts/migrate-portfolio.ts` and ships to
  the live portfolio pages.
- **Named contributors not yet included.** The blog mentions specific
  people by name (Jiawei, Yuan L., Min Z., Yu, Min). The
  [`culture/team/`](./culture/team/) section is the placeholder for when
  there's an authoritative roster to mirror.
- **Blog content is not copied here.** Only methodology that has graduated
  out of a single post and become reusable (currently open-by-default) is
  captured.

---

*Imported into the novawerk monorepo on 2026-10-03; public in `Novawerk/novawerk-workspace` since 2026-10-14. Earlier snapshot date: 2026-05-22, sourced from the now-archived `nw-web-portal`. Partnership notes moved to the private records.*
