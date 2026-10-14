# Novawerk

> *An open workshop for early ideas.*

This is Novawerk's one repo: the public website, the admin panel, the API,
the agents that help run the org, the knowledge base and our internal records.
It is **private**. Being open shows up on the website and in how we work, not
in this repo's visibility.

## What lives where

| Folder | What it holds |
|--------|---------------|
| `apps/web` | novawerk.io — the portfolio, an about page, and two forms: pitch a project (`/submit`) and join as a Member (`/join`). |
| `apps/admin` | admin.novawerk.io — where Members review pitches and applications, approve outgoing email, and edit the portfolio. |
| `apps/api` | The only way into the database from the internet. The website and the admin panel both talk to it. |
| `agents/` | Agents that draft, summarise and tidy up. They run on GitHub Actions. Nothing they write to someone outside Novawerk is sent until a Member approves it. |
| `packages/` | Shared code: the database schema (`db`), form rules (`contracts`), UI components (`ui`), email, Claude calls, Jira, records, files (Vercel Blob). |
| `knowledge/` | Who we are and how we work, in Markdown. The website reads it. |
| `records/` | What happened: minutes, decisions, finance notes, partner history. Confidential by default. |
| `docs/` | How all of this is built and operated. |

## Where data lives

- **Text that rarely changes** (mission, principles, the pledge) → `knowledge/`.
- **Everything that changes** (portfolio, pitches, applications, Members,
  partners, money, outgoing email) → Postgres. The schema lives in one file:
  `packages/db/src/schema.ts`.
- **Files** (contracts, receipts, project images) → Vercel Blob, never git.

Everyone in Novawerk is a Member. There are no tiers.

## Getting started

```bash
nvm use            # Node 22+
pnpm install
pnpm typecheck
pnpm test
```

To run everything locally you need Docker (or OrbStack) for Postgres:

```bash
pnpm db:up         # local Postgres from compose.yaml
pnpm db:migrate    # DATABASE_URL=postgres://novawerk:novawerk@localhost:5432/novawerk
pnpm db:seed:dev   # a sample admin and the two current projects
pnpm dev           # web on :3000, admin on :5173, api on :8787
```

Each app has a `.env.example` listing the variables it needs; copy it to
`apps/api/.env`, `apps/web/.env.local` and `apps/admin/.env.local`. Locally, set
`DEV_LOGIN=true` (API) and `VITE_DEV_LOGIN=true` (admin) to sign in to the admin
panel without Google. Real values live in Vercel and GitHub Actions secrets;
`docs/infra.md` lists the environments, accounts and DNS.

Changing a table: edit `packages/db/src/schema.ts`, run `pnpm db:generate`,
commit the migration.

## History

In October 2026 three repos became this one: `nw-back-office` (this repo's
original history), `nw-knowledge-base` (imported with history into
`knowledge/`), and `nw-web-portal` (rewritten as `apps/web`, `apps/admin` and
`apps/api`). The design and the decisions behind it are recorded in
`records/operations/decisions/` and in the architecture doc linked from
`CLAUDE.md`.

## House rules

- **Plain language.** Short sentences, "we", present tense. No *leverage /
  ecosystem / stakeholders / synergy / disrupt / transform*.
- **One artifact, one owner, one done-by date.**
- **Decisions get written down**, in `records/` or `knowledge/`, not lost in chat.
- **Secrets never touch git.**
