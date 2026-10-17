# Novawerk

> *An open workshop for early ideas.*

This is Novawerk's code, in the open: the public website, the admin panel, the
API, the agents that help run the org, the knowledge base, posts and videos.
It is public and MIT licensed. Contributions are welcome.

Our internal records (minutes, decisions, finance, partners) and account details
are not here. They live in a private repo, `Novawerk/novawerk`, together with the
workflows that run the agents.

## What lives where

| Folder | What it holds |
|--------|---------------|
| `apps/web` | novawerk.io — the portfolio, an about page, the pitch form (`/submit`), and the contributor task board (`/contribute`, `/tasks`, `/contributors`). |
| `apps/admin` | admin.novawerk.io — where Members review pitches and applications, approve outgoing email, and edit the portfolio. |
| `apps/api` | The only way into the database from the internet. The website and the admin panel both talk to it. |
| `agents/` | Agents that draft, summarise and tidy up. They run on GitHub Actions, from workflows in the private repo. Nothing they write to someone outside Novawerk is sent until a Member approves it. |
| `packages/` | Shared code: the database schema (`db`), form rules (`contracts`), UI components (`ui`), email, Claude calls, Jira, records, files (Vercel Blob). |
| `knowledge/` | Who we are and how we work, in Markdown. The website reads it. |
| `docs/` | How all of this is built and operated. |
| `posts/`, `videos/` | Posts and short videos made in the repo. |

## Where data lives

- **Text that rarely changes** (mission, principles, the pledge) → `knowledge/`.
- **What happened** (minutes, decisions, finance notes, partner history) →
  `records/` in the private repo. Confidential by default.
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

## Contributing

Anyone can help build this, one task at a time. Pick a task at
[novawerk.io/tasks](https://novawerk.io/tasks) (launching soon), propose a plan, and once a
Member assigns it to you, open a pull request from your fork with `Task: NW-<n>` in its body.
No task for what you want to do? Create one: a small (S) task is yours at once, an M task opens
for discussion, L and XL are reviewed first.
Commits are signed off (`git commit -s`).

- [CONTRIBUTING.md](CONTRIBUTING.md): the flow, local setup, conventions, what we review for.
- [AGENTS.md](AGENTS.md): a brief for your coding agent.
- [SECURITY.md](SECURITY.md): report vulnerabilities to security@novawerk.io, never in public.

### Contributors

<!-- contributors:start -->
Nobody yet. Be the first: [open tasks](https://novawerk.io/tasks).
<!-- contributors:end -->

## History

In October 2026 three repos became this one: `nw-back-office` (this repo's
original history), `nw-knowledge-base` (imported with history into
`knowledge/`), and `nw-web-portal` (rewritten as `apps/web`, `apps/admin` and
`apps/api`). On 2026-10-14 the code moved here, to the public
`Novawerk/novawerk-workspace`; the records and agent workflows stayed in the
private `Novawerk/novawerk` (NB-ADR-0012). The decisions behind all of this are
recorded there and in the architecture doc linked from `CLAUDE.md`.

## House rules

- **Plain language.** Short sentences, "we", present tense. No *leverage /
  ecosystem / stakeholders / synergy / disrupt / transform*.
- **One artifact, one owner, one done-by date.**
- **Decisions get written down**, in `knowledge/` or the private records, not lost in chat.
- **Records and account details never come here.** This repo is public.
- **Secrets never touch git.**
