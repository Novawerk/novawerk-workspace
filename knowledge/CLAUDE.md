# CLAUDE.md — knowledge/

Guidance for working inside `knowledge/`, the canonical facts about Novawerk.
Read the root `CLAUDE.md` first for the repo as a whole.

## What this folder is

A **markdown knowledge base**: who we are, what we believe, how we work. It is
optimised for humans skimming on GitHub and for agents that need a ground-truth
source. There is no build step for this folder; verify changes by reading the
rendered markdown and checking that links resolve.

It used to be its own repo (`nw-knowledge-base`); its history was imported into
this folder in October 2026.

## Who reads it

- **The public website** (`apps/web`) renders parts of it — mission, principles,
  the four-step process, the pledge. Editing those files changes the site on the
  next deploy, so keep public-facing files ready to publish.
- **Agents** read it for brand voice and facts (`packages/kb`).
- **People**, on GitHub.

This folder is public, like the rest of this repo. The website must never read
`records/` (confidential, in the private repo `Novawerk/novawerk`). If something is
internal (partner research, minutes, names of people who haven't agreed to be
named), it belongs in `records/`, not here.

## What does not belong here

- The portfolio list and project details → `projects` table in Postgres (admin panel).
- Submissions, applications, members, partners, money → Postgres.
- Meeting minutes, ADRs, finance notes, partner pipeline → `records/` (private repo).

## The fact-file convention

```markdown
---
title: <fact name>
category: culture | brand | operations | community | legal | meta
status: stable | evolving
summary: <one or two sentences; optional, used by the website and agents>
source:
  - <where the fact came from: a file path, a decision record, a Jira key>
updated: YYYY-MM-DD
---
```

- **`source:` is file paths or references only, never line numbers** — they rot.
  Older files still cite `nw-web-portal/...`; that repo is archived, so treat those
  as historical provenance.
- **`status: stable`** rarely changes; **`evolving`** expects periodic refresh.
- **Bump `updated:`** whenever a file's body changes.
- End files with a `## Related` section linking sibling files.

The on-mission test for any new content: it should help someone do at least one
of the five mission verbs in `culture/vision-and-mission.md`.

## Conventions

- Everyone in Novawerk is a **Member**. Don't reintroduce titles or tiers.
- Keep prose in the Novawerk brand voice (see `brand/voice.md`): candid and
  concrete, short sentences, "we", present tense.
- Skills that used to live in `knowledge/skills/` are now in the repo root
  `.claude/skills/`.
