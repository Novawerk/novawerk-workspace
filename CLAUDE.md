# CLAUDE.md — Novawerk workspace

Novawerk's code, in the open (MIT): the public website, the admin panel, the API, the agents'
code, the knowledge base, posts and videos. Read this before working here.

Contributors work here. Records and account details are never in this repo: they live in the
private repo `Novawerk/novawerk`, with the agent workflows (NB-ADR-0012).

Architecture doc (decisions D1–D9, data model; members only): https://claude.ai/artifact/CJKW8eHLcbz1U1hNYrTF6B

In the repo, `docs/`: `architecture.md` (agents and records), `infra.md` (environments,
accounts, DNS, secrets), `runbook.md` (operations, restore), `security.md`, `analytics.md`,
`roadmap.md`.

## Layout

| Path | What | Stack |
|------|------|-------|
| `apps/web` | Public site: `/` (portfolio), `/about`, the pitch form `/submit`, the task board (`/contribute`, `/contribute/guide` (CONTRIBUTING.md), `/tasks`, `/contributors`, `/u/<handle>`, `/sign-in`, `/settings`), `/imprint`, `/privacy`; `/join` redirects to `/contribute`; `POST /api/revalidate` (the API marks the `projects`, `tasks` or `contributors` cache stale) | Next.js 16 App Router, Tailwind v4 |
| `apps/admin` | Internal admin panel (admin.novawerk.io) | React 19 SPA, Vite+, TanStack Router + Query, shadcn (Base UI, `base-vega`), AI Elements |
| `apps/api` | The only entry to the database from the internet: `/public` (forms, portfolio, task board, intake chat, visit events), `/auth` (one sign-in for everyone: GitHub, Google or an emailed code; `/auth/contributor` is the old path), `/admin` (incl. the assistant chat), `/contrib` (signed-in contributors), `/cron`, `/webhooks` | Hono on Vercel Functions |
| `apps/chat` | Novawerk Chat, the team chat (chat.novawerk.io): Campfire vendored from basecamp/once-campfire with Novawerk's theme and a Slack-style layout. Novawerk changes go in `app/assets/stylesheets/zz_novawerk.css` and small template edits; updating upstream: `apps/chat/UPSTREAM.md`. Not in the pnpm workspace; ships as a Docker image | Rails 8, SQLite, Hotwire |
| `agents/` | Agent entry points + runner (`pnpm agent <id>`). Their workflows (`agent-<id>.yml`) live in the private repo and check this one out | TypeScript on GitHub Actions |
| `packages/db` | **All** Postgres tables (Drizzle schema + migrations) and the agents' query surface | Drizzle, node-postgres |
| `packages/contracts` | Zod schemas + DTOs shared by web, admin and api (form inputs, `PublicProject`) | zod 4 |
| `packages/ui` | Shared shadcn components: `core/`, `compound/`, `ai-elements/` | shadcn base-vega, Tailwind v4 |
| `packages/*` (others) | `config`, `email`, `agent-core`, `agent-harness` (chat agent loop), `intake`, `promo` (project lifecycle, posts and their pictures), `tasks` (the contributor task board: state machine, rules, public reads), `github` (webhook signatures and the GitHub App client for the board), `ceremonies`, `partners`, `kb`, `jira`, `records`, `object-store`, `types` | TypeScript |
| `knowledge/` | Canonical facts: who we are, how we work (Markdown + frontmatter). The website reads it. | — |
| `posts/` | Posts written in the repo, one folder each (`posts/README.md`); synced to Postgres on merge | `pnpm post` |
| `records/` | Not in this repo. Minutes, ADRs, finance notes, partner history live in the private repo; link them locally (see Commands). Gitignored here. | — |
| `videos/` | Short videos made in code, one folder per video in `projects/`; shared `kit/` and `BRAND.md` (what a video may say). Not in the pnpm workspace: `cd videos && pnpm install --ignore-workspace` (`videos/README.md`) | Remotion, `pnpm video` |

## Where data lives

- **Rarely-changing text** (mission, principles, pledge, brand voice) → `knowledge/*.md`.
- **Everything that changes** (portfolio projects, submissions, applications, members,
  partners, ledger, outbox) → Postgres, defined only in `packages/db/src/schema.ts`.
- **Binary files** (contracts, receipts) → the private Vercel Blob store; a `documents` row links
  them. Project images go to the public Blob store and are referenced by URL. Uploads go from
  the browser straight to Blob with a short-lived token from the API (`@nw/object-store`).
  CVs attached on `/submit` (and on `/join`, before it closed) live in the private store under `_resumes/`, linked from
  the pitch or application row; `/cron/resume-cleanup` deletes the ones never sent.
- **Records** (minutes, ADRs, partner history) → `records/` in the private repo, never here.
  `apps/web` may read `knowledge/`; it must **never** read `records/`.
- **Visit counts** (no cookies, no IP) → `analytics_events`, through `track()` in
  `apps/web/lib/analytics.ts` and the event catalog in `@nw/contracts`. Never put what a
  visitor typed into an event. See `docs/analytics.md`.

## Rules

- Change a table → edit `packages/db/src/schema.ts` → `pnpm db:generate` → commit the migration.
  Never hand-edit files in `packages/db/migrations/`.
- Validate input with `@nw/contracts` at both ends (browser and API).
- **One account for everyone** (NB-ADR-0014): everyone is a member, one row in `members`.
  `members.role = maintainer` runs Novawerk (the whole admin panel); there are no other ranks.
  Being on a project's team (`project_members`) is a relationship: it gives the admin panel's
  "My projects". Only maintainers and team members open the admin panel; the API enforces it
  (`isMaintainer()` in `@nw/db`, `mayOpenAdminPanel()` in `apps/api/src/auth.ts`). The board's
  `contributor_*` columns point at `members`. Task board rules live in `@nw/tasks`; see
  `docs/architecture.md`, "Contributor task board". One session cookie (`nw_session`) for the
  site, the admin panel and the API; personal access tokens never reach `/admin`. Tests in
  `apps/api/test/admin-access.test.ts` walk every `/admin` route: keep them passing.
- **Outbound email is gated.** Anything sent to someone outside Novawerk goes into `outbox`
  and waits for a maintainer's approval:
  - agents only call `queueEmail()`; agent workflows never get `RESEND_API_KEY` (a test enforces it);
  - the API's approve route calls `approveEmail()` then `sendApproved()`;
  - `notifyTeam()` may only email a novawerk.io inbox and needs no approval;
  - `sendSignInCode()` sends a fixed template with a sign-in code to the address signing in or
    signing up (NB-ADR-0014);
  - `sendNewsletterConfirmation()` sends a fixed double opt-in template with one confirmation
    link to the address that just signed up, rate-limited per address (NB-ADR-0011). Newsletter
    issues are not part of this exception, and go only to confirmed subscribers;
  - contributor notices (NB-ADR-0013) are fixed templates about a contributor's own account and
    tasks (proposal chosen or not, replies, reminders, release, task closed, the outcome of their
    own suggestion, Werk awarded, account deleted),
    sent without approval only to that contributor's own verified address;
  - `sendWelcome()` sends one fixed welcome email when someone makes an account (greeting by
    their escaped name, what being a member means, a link to `/contribute/guide`), once per
    account (`members.welcome_sent_at`, claimed before sending), only to the address that sign-in
    just proved (NB-ADR-0014). Agents never send it.
  Nothing else to members skips the outbox.
- **Inbound mail to info@ is relayed, not stored.** Resend receiving calls
  `POST /webhooks/resend`; the API checks the signature and posts one card to the Slack channel
  `#info-inbox` (`apps/api/src/inbound-mail.ts`). Gmail stays the inbox; replies go from there.
  Setup: `docs/infra.md`, "info@ in Slack".
- Agents write only `records/**/*.md`. Each agent workflow lives in the private repo: it checks
  out this repo, puts the private one under `ops/`, links `ops/records` to `records/`, runs
  `pnpm agent <id>` and commits the records there as `novawerk-bot`. Agent logic lives in
  packages (`intake`, `ceremonies`, `partners`…); `agents/<id>/index.ts` only wires it.
- Nothing from the private repo comes here: no record text, account ids, owners or addresses.
- The API runs the intake agent's code itself right after each form (`apps/api/src/agents.ts`,
  NB-ADR-0010); the agent's 6-hourly cron on GitHub Actions is the safety net.
- The API runs the promo agent's code the same way after a project's status or launch date
  changes, or a member asks for a draft; its daily cron drafts what comes due with time. Posts are
  drafted, never published: a member approves each one and posts it by hand. The template card
  is assembled (`@nw/promo/cards`), never generated by an image model.
- A post can also be a folder in `posts/` (NB-ADR-0009). The folder is the source: CI runs
  `pnpm post check`, and after a merge the deploy workflow's `pnpm post sync` writes it into
  `posts` as approved (the pull request is the review); the admin panel doesn't edit its text.
  Don't merge a folder with placeholders unless it says `draft: true`.
- `packages/config` is the only module that reads `process.env` in shared packages; apps read
  their own env at the edge (route handler / server entry) and pass values in. Two exceptions:
  `packages/db/drizzle.config.ts` (drizzle-kit only) and `@nw/jira`, which hands the env to the
  `jira` CLI it spawns.
- **A pull request that changes code has a task first** (`Task: NW-<n>` in its body). Find it
  on novawerk.io/tasks, or create one (MCP `create_task`, `POST /contrib/tasks`): an S task is
  yours at once, an M task opens on the board for discussion, L and XL wait for a maintainer's
  review. Docs, posts, videos and typo fixes may say `Task: none (<why>)`. Skill:
  `nw-pull-request`.
- Secrets never touch git. Real values live in Vercel / GitHub Actions secrets or `.env` (ignored).
  Environments (local and production; no staging), accounts and DNS: `docs/infra.md`.
- Brand voice: short sentences, "we", present tense. No *leverage / ecosystem / stakeholders /
  synergy / disrupt / transform*.
- Next.js 16 has breaking changes versus older versions — read
  `apps/web/node_modules/next/dist/docs/` before writing Next code.

## Commands

```bash
pnpm install
pnpm dev          # all apps
pnpm typecheck
pnpm test
pnpm lint         # web (eslint) and admin (vp lint)
pnpm build
pnpm db:generate  # after editing the schema
pnpm db:up && pnpm db:migrate && pnpm db:seed:dev   # local Postgres (Docker)
pnpm db:studio    # browse the database; pnpm db:down stops the container
pnpm agent --list                      # agents and what they do
pnpm agent <id> [--input json] [--dry-run|--help]
pnpm new:agent <id>                    # scaffold agents/<id>; prints its workflow for the private repo
ln -s ../novawerk/records records      # members: link the private repo's records (clones side by side)
pnpm new:record <category> <slug> ["Title"]   # a record with the right frontmatter (needs the link)
pnpm post new|check|render|sync|pull   # posts written in the repo (posts/README.md)
pnpm video list|new|<project> render   # videos in videos/projects (videos/README.md)
pnpm provision:member <id> "<Name>" <google-email> [--admin]   # prints SQL; runs nothing (--admin: maintainer)
pnpm import:tasks <file.json> [--member <id>] [--apply]   # publish a list of tasks; dry-run by default
pnpm demo:pipeline                     # sponsor pipeline + outbox gate, offline (PGlite, stubbed Claude)
DATABASE_URL=… pnpm backup             # pg_dump; restore by hand (docs/runbook.md)
```

Use pnpm (10.x) and Node 22+. One lockfile at the root.

## Skills

- `nw-knowledge-base` — canonical facts; in this repo read `knowledge/` directly.
- `jira` — NB board, project key `NB`, board `34`, site `novawerk-teams.atlassian.net`.
- `shadcn` / UI work in `apps/admin` writes components into `packages/ui` (style `base-vega`,
  Base UI primitives). AI Elements live in `packages/ui/src/ai-elements/`.
- `nw-back-office` — agents, the outbox gate, and records (in the private repo).
- `nw-posts` — write a post in `posts/` (format, voice, `pnpm post render | check`).
- `nw-contribute` — getting started: the local stack (dev sign-in, uploads in `.local-files/`),
  connecting the task board's MCP with the person's token, finding or claiming a task.
- `nw-pull-request` — before opening a PR: find or create its task, then the template and sign-off.
- `nw-videos` — make or change a short video in `videos/` (brief → storyboard → stills → music
  and sound → films, cover, post copy; platform rules for 小红书).

## Gotchas

- `apps/admin` uses Vite+ (`vp`). Its `vite` dependency is aliased to
  `@voidzero-dev/vite-plus-core` in `apps/admin/package.json` — don't add a workspace-wide
  `vite` override, vitest in the packages needs real Vite.
- `apps/web` typecheck runs `next typegen` first; Next 16 Cache Components are on
  (`"use cache"`, cache tag `projects`). No `Date.now()` in prerendered components.
- `knowledge/legal/*.md` placeholders (`{{…}}`) fail a Vercel production build on purpose;
  `deploy.yml` skips the web deploy while any remain.
- Tests that need Postgres use `@nw/db/testing`: `createTestDb()` once per file in `beforeAll`
  (give it 60 s), `resetDb()` before each test. It is PGlite in memory with the real migrations,
  cached under `packages/db/node_modules/.cache/nw-test-db/`.
