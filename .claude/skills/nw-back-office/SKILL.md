---
name: nw-back-office
description: Navigate the back-office side of Novawerk — the agents that run the org on GitHub Actions (code here, workflows in the private repo) and the private records they write (minutes, ADRs, finance, legal, partners, members), which live in the private repo Novawerk/novawerk. Use when finding or writing a record, adding or running an agent, understanding where data lives (git markdown vs Postgres vs Vercel Blob), or working with the outbox approval gate. For canonical org facts (tagline, mission, principles, brand voice, portfolio) read knowledge/ (the nw-knowledge-base skill); for the NB Jira board use the jira skill.
---

# Novawerk Back Office

The back-office side of Novawerk. Two repos (NB-ADR-0012):

- **This repo, `Novawerk/novawerk-workspace` (public):** the agents' code (`agents/`, `packages/*`).
- **`Novawerk/novawerk` (private):** `records/`, the agent workflows (`agent-<id>.yml`), the
  `agents-check` workflow and account details. Members only.

Never copy record text, account ids, owners or addresses into this repo, an issue or a PR.

It pairs with two other skills:
- `nw-knowledge-base` — canonical facts; in this repo they live in `knowledge/` (never duplicated).
- `jira` — the NB board (`novawerk-teams.atlassian.net`, project `NB`, board `34`).

## Where each kind of data lives

Pick the right tier before you write anything:

| Kind | Store | Path / access |
|------|-------|---------------|
| Narrative (minutes, ADRs, decisions, onboarding, policies, contract notes) | git markdown, private repo | `records/**` |
| Structured (finance ledger, partner CRM, members, submissions, outbox, document index) | Postgres | `packages/db` (schema + migrations) |
| Binary (signed contracts, NDAs, invoices, receipts, PDFs, images) | Vercel Blob (private store; project images in the public one) | `packages/object-store`; a `documents` row links the file key |

A binary never goes in git (they're gitignored). Upload it in the admin panel (Documents), which adds the `documents` row, and
link that row from the narrative record (e.g. `records/legal/<name>.md`).

## records/ layout and frontmatter

`records/` is not in this repo. To work with it locally, clone the private repo next to this one
and link it in (the link is gitignored):

```bash
ln -s ../novawerk/records records
```

Layout in the private repo:

```
records/
  operations/   decisions/ (NB-ADR-####-<slug>.md) · minutes/ · standups/ · all-hands/
  people/       roster.md · onboarding/<name>.md
  finance/      narrative notes/policies (the ledger DATA is in Postgres)
  legal/        contract notes/index (signed PDFs live in Vercel Blob)
  partners/     per-partner narrative (CRM DATA is in Postgres); pipeline/ research notes
```

Every record starts with YAML frontmatter (extends the KB schema):

```yaml
---
title: <record name>
category: operations | people | finance | legal | partners
status: draft | evolving | stable
confidential: true
source: []                       # optional internal provenance, no line numbers
related: [NB-12, NB-ADR-0003]    # link to Jira issues / other records
updated: YYYY-MM-DD
---
```

Use `pnpm new:record` to scaffold one with correct frontmatter (it needs the `records` link),
then commit it in the private repo.

## Agents (GitHub Actions)

Agent **logic** is real TypeScript in `packages/*` (testable). Each agent is a thin
`defineAgent(...)` in `agents/<id>/index.ts` that wires config + packages together. Its workflow,
`agent-<id>.yml` in the private repo, decides when it runs (cron, the "Run workflow" button,
or `repository_dispatch`). The workflow checks out this repo at the root and the private one
under `ops/`, links `ops/records` to `records/` and runs `pnpm agent <id>`. There is no server to
deploy: merge to `main` here and the next run uses it.

```bash
pnpm agent --list
pnpm agent <id> --help              # triggers, secrets, effects
pnpm agent <id> --dry-run           # fake services: no secrets, no network, nothing written
pnpm agent <id> --input '<json>'    # a real run (reads .env locally)
```

Add an agent with `pnpm new:agent <id>`: it writes `agents/<id>/index.ts` and prints the
workflow; a member adds it to the private repo as `.github/workflows/agent-<id>.yml`.
A workflow passes only the secrets its agent declares in `needs`; agents that write records
get `contents: write` and end with `./ops/.github/actions/commit-records`, which commits
`records/` to the private repo as `novawerk-bot`. The private repo's `agents-check` runs
`agents/agents.test.ts` from here to keep workflows and agents in step.

### The approval rule
Anything sent to someone outside Novawerk goes into the `outbox` table. Agents call
`queueEmail()` from `@nw/email`, which only inserts a `pending` row. A member approves it in the
admin panel; only then can `sendApproved()` send it, once. Agent workflows never receive
`RESEND_API_KEY`. Never bypass that gate. `notifyTeam()` may only email our own inbox;
`sendSignInCode()` only sends a member their own sign-in code; `sendNewsletterConfirmation()` only
sends the fixed double opt-in link to the address that just signed up (NB-ADR-0011).

## House rules

- Decisions get written into an ADR or a record — not lost in chat (open by default, inside the box).
- Plain language: short sentences, "we", present tense. No *leverage / ecosystem / stakeholders / synergy*.
- One artifact, one owner, one done-by date.
- Secrets live in `.env` (gitignored), GitHub Actions secrets, or the hosting platform — never in code or records.
- This repo is public. Records and account details stay in the private repo.
