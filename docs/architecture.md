# Architecture — agents and records

How the back-office side works: the agents that run the org and the private records they
write. The web, admin and API apps are described in the root `CLAUDE.md`.

Two repos (NB-ADR-0012). This one, `Novawerk/novawerk-workspace`, is public and holds the code.
The private repo `Novawerk/novawerk` holds `records/`, the agent workflows and account details.
ADRs (`NB-ADR-####`) are records, so they live there too.

## The shape

```
┌──────────────────── novawerk-workspace (public, this repo) ─────────────────────────┐
│  agents/<id>/       thin defineAgent(...) per agent — wires config + packages         │
│  packages/*         the real, tested logic (intake, ceremonies, partners, email, …)   │
│  knowledge/         canonical facts the agents read (brand voice, meeting design)     │
├──────────────────── novawerk (private), checked out under ops/ ─────────────────────┤
│  .github/workflows/ agent-<id>.yml — WHEN each agent runs (cron / button / dispatch)  │
│  records/           narrative docs the agents write; the workflow commits them        │
└─────────────┬────────────────────────┬────────────────────────┬──────────────────────┘
              │ structured data         │ binaries               │ outside world
              ▼                         ▼                        ▼
       Postgres (Neon)            Vercel Blob             Claude · Jira · Resend
       members, submissions,      contracts, receipts     (Resend only after a
       partners, ledger, OUTBOX                           member approves)
```

## Runtime: GitHub Actions

Each agent is one workflow, `agent-<id>.yml`, in the private repo. It checks out this repo at
the root and the private one under `ops/`, links `ops/records` to `records/`, installs
dependencies and runs `pnpm agent <id>`. Agents that write records commit them back to the
private repo as `novawerk-bot`. The private repo's `agents-check` workflow runs
`agents/agents.test.ts` from here against those workflows. Triggers:

- **cron** (UTC) for the regular jobs,
- **workflow_dispatch** — the "Run workflow" button, with inputs,
- On request, the API runs `intake` and `promo` itself (`apps/api/src/agents.ts`): the same
  package code, right after the response, so a summary or a draft lands in seconds. Their
  workflows keep the button and the cron as the safety net (NB-ADR-0010).

No server to run or deploy: merge to `main` here and the next run uses the new code. Logs and
run history are in the private repo's Actions tab. Decision: NB-ADR-0004.

| Agent | Trigger | Does | Changes in the world |
|-------|---------|------|----------------------|
| `intake` | in the API after each form, button, cron every 6 h | Claude summary of each new submission / application | writes `ai_summary`; queues an acknowledgement in the outbox |
| `sponsor-discovery` | Tuesdays 06:00 UTC, button | Claude proposes sponsors; we drop known ones | inserts intro-stage partners; writes `records/partners/` |
| `sponsor-outreach` | button, dispatch `sponsor-outreach` | Claude drafts an email to one partner | queues it in the outbox; notes it in the partner record |
| `standup-digest` | every 2 days 06:00 UTC, button | Done / Next / Blocked from the NB board | appends to `records/operations/standups/` |
| `all-hands-prep` | Mondays 06:00 UTC (acts fortnightly), button | agenda + pre-read from the board and digest | writes `records/operations/all-hands/` |
| `jira-automation` | weekdays 07:00 UTC, button | finds open NB issues with no owner, quiet for a week | comments a nudge (max 10 per run) |
| `promo` | in the API after a status change or a draft request, button, daily 05:40 UTC | plans each project's posts from its lifecycle; Claude drafts them in Chinese and English | creates `posts` rows and writes drafts (`drafted`); publishes nothing |

## Logic vs. wiring

The logic lives in packages with tests: `@nw/intake`, `@nw/promo`, `@nw/ceremonies`,
`@nw/partners`, `@nw/jira`, `@nw/email`, `@nw/records`, `@nw/kb`. An agent file only declares:

- `needs` — the config sections (so secrets) it may use. `@nw/config` loads only those and
  fails fast listing anything missing.
- `services` — real clients built from that config (Postgres, Claude, the `jira` CLI, records/).
- `dryRunServices` — fakes: PGlite with the real migrations, a stubbed Claude, a fixture board,
  in-memory records. `pnpm agent <id> --dry-run` needs no secrets and touches nothing outside.
- `run` — calls the package with those services.

Claude calls go through `@nw/agent-core`: `claude-opus-5-5` for drafting, `claude-sonnet-5-5`
for short summaries, server-side refusal fallbacks on, token usage logged per call.

## Project lifecycle and posts

A project starts as a pitch (`project_submissions`); accepting it creates the project, which
moves `draft → planning → building → launching → launched` (or `archived`). The admin panel shows
the whole line on one board (Projects): pitches first, then each project by stage, and a project
page with its pitch, deliverables, posts, files and timeline.
Every change is a row in `project_status_changes`; deliverables (artifact, owner, done-when,
date) are rows in `project_deliverables`; the launch day is `projects.launch_date`.

Six moments get a post (`knowledge/community/promotion/`): kickoff when building starts,
progress every two weeks, behind the scenes ten days before launch, launch, T+10, T+30/T+90.
`@nw/promo` works out which are due. The API plans them right after a status or launch-date
change and wakes the `promo` agent; the agent's daily run plans the ones that come due with
time. Each post goes `planned → drafted → approved → published` (or `skipped`):

1. The agent drafts both languages from our own data and the member's brief. Missing facts are
   placeholders (【待补充：…】 / [To fill in: …]), and a post with any left can't be approved.
2. A member edits and approves it in the admin panel (Posts).
3. The member copies the text, downloads the picture, posts it by hand and marks it posted
   (`published_at`).

Pictures are assembled, never generated: `POST /admin/cards` renders a template from
`@nw/promo/cards` (satori via `@vercel/og`) with the card text and one of the project's own
pictures, in 3:4, 1:1, 1.91:1 or 16:9. Decision: NB-ADR-0007.

Beyond the six moments, a post can be anything (`custom`, named by its `label`), about a project
or about Novawerk itself (no project), in one or both languages, for the platforms it names, with
the template card, its own pictures, or both. Members add one under Posts → New post, or write it
in the repo: a folder under `posts/` (`post.yml`, `zh.md`, `en.md`, pictures; `posts/README.md`),
written with Claude Code (the `nw-posts` skill) and `pnpm post new | render | check`. CI checks
the folders; after a merge to `main` the deploy workflow runs `pnpm post sync`, which writes each
new or changed folder into `posts` as **approved** (the pull request was the review) and its
pictures into the public file store. The admin panel doesn't edit a repo post's text; "Continue in
the repo" turns any post into a folder (`pnpm post pull`, a signed 30-minute link). Decision:
NB-ADR-0009.

## Three storage tiers

| Data | Store | Why |
|------|-------|-----|
| Narrative (minutes, ADRs, digests, agendas, partner history) | git markdown (`records/`, private repo) | versioned, diffable |
| Structured (members, submissions, partners, ledger, outbox, document index) | Postgres | queryable; edited in the admin panel |
| Binary (contracts, NDAs, invoices, receipts; CVs from /submit and /join under `_resumes/`) | Vercel Blob, private store | every read goes through the API |
| Project images | Vercel Blob, public store | served by Vercel's CDN |

Agents write `records/` only through `@nw/records`' `RecordStore`, which accepts nothing but
`records/**/*.md` (never `*.private.*`). The workflow then stages only `records/` and commits as
`novawerk-bot` to the private repo.

## The approval gate (why nothing sends by accident)

Every email to someone outside Novawerk goes through the `outbox` table.

1. An agent calls `queueEmail()` → a `pending` row. That function cannot send.
2. A member approves (`approveEmail()`, records who and when) or rejects it in the admin panel.
3. `sendApproved()` is the only path to Resend. It refuses unless the row is approved by a member
   and has never been sent. It first claims the row with a conditional update
   (`status = 'approved' AND sent_at IS NULL`), so two senders racing on one row send it once.
   It then marks the row `sent` (with the Resend id) or `failed` (with the error).

On top of the code, agent workflows never get `RESEND_API_KEY`, so an agent cannot reach Resend
at all. The intake acknowledgement is a fixed template: nothing an applicant writes can change
what we email back. Three other doors exist: `notifyTeam()` only reaches `@novawerk.io`,
`sendSignInCode()` sends one fixed template with a sign-in code to the address that is signing
in (an active member's own, or a contributor's; NB-ADR-0013), and `sendNewsletterConfirmation()` sends one fixed double opt-in email with a confirmation link to
the address that just signed up for the newsletter, at most 3 a day per address (NB-ADR-0011).

## Who sees what in the admin panel

Every active member signs in, with Google or a 6-digit code we email. Admins (`can_admin`) see
everything. Any other member sees the projects they are on and those projects' posts: they edit
the content, deliverables, posts and files; the Initiator also changes the team. The stage,
featured, order and slug stay with admins. The API enforces all of it (`apps/api/src/routes/admin/access.ts`):
admin-only routes answer 403, and a project a member isn't on answers 404. Project files live in
the private Blob store with a `documents.project_id`. Decision:
NB-ADR-0008.

## Per-member isolation

A member only touches keys under their own prefix in the private file store (`<id>/…`), enforced by
`assertMemberPrefix` in `@nw/object-store`, and `owner`-scoped rows in queries.

## Contributor task board

Anyone can help build the software Novawerk runs on through an open task board (design:
`docs/contributor-board-design.md`; decision: NB-ADR-0013). This is the foundation: tables, rules
and the API. The pages, the admin side, the GitHub webhook, tokens and emails come next.

- **Contributors are not Members.** Their own table (`contributors`), no admin panel, no tiers.
  They sign in with GitHub (our GitHub App's user authorization with PKCE; we keep GitHub's
  numeric id and login, never the token) or an emailed 6-digit code (`sign_in_codes` with
  `kind = contributor`: hashed, 10 minutes, 5 tries each claimed atomically, 3 per address per
  15 minutes, 10 requests and 30 checks per IP per hour, the same answer for every address, and
  its own task board wording). An email sign-up gets a neutral handle (`contributor-7f3a`) until
  they pick one; nothing from the address shows. A GitHub sign-up starts with the GitHub login.
  Proposing or working on a task needs GitHub linked, and a linked GitHub account is never
  swapped for another.
- **Sessions stay apart.** Members: `nw_session` (audience `nw-admin`). Contributors:
  `nw_contributor` (audience `nw-contributor`, 30 days), httpOnly on the API's domain, sent from
  the website's origins only (`CONTRIBUTOR_ORIGINS`, default: the web origins). Neither cookie
  opens the other's routes. Every request re-reads the row, so a deleted account is out at once;
  sessions issued before `contributors.sessions_revoked_at` (set on sign-out and when GitHub is
  linked) are refused.
- **Tasks** are `NW-<n>`. Sizes S/M/L/XL are worth 1/3/8/20 **Werk**: recognition, never money.
  Statuses: `draft` (members only) → `open` → `assigned` → `in_review` → `done`, or `closed`;
  suggestions go `suggested` → `open` / `assigned`, `declined` or `duplicate`. Every transition
  writes a `task_events` row (the public timeline).
- **Rules live in `@nw/tasks`** (state machine, limits, privacy, the public reads); the API only
  wires them. Limits per contributor: 5 proposals and 30 posts a day, 3 open suggestions, 1 task
  in progress until their first merge, then 2. The limits run with the contributor's row locked,
  so parallel requests can't pass one twice. No +1 on your own suggestion; votes close at
  triage. A suspended contributor reads but doesn't write, and leaves the wall and their profile.
- **Privacy.** Profiles are private until `public` is on (`on_wall` lets a public profile leave
  the wall). A private profile shows as an unlinked handle. Proposals are public; a decline note
  only reaches its proposer (`GET /contrib/me/proposals`). Hidden posts keep their place without
  text or author. No email appears in any public response. Deleting the account removes the
  profile, proposals, votes and tokens and puts a held task back on the board; tasks, posts and
  Werk rows show "a former contributor".
- **Werk ledger** (`werk_ledger`) is append-only: a merge adds one row per task and PR (unique
  `(task_id, pr)`), and a member's change is a new row with a reason. Nothing updates a row.
- **Tokens** (`contributor_tokens`: hashed secret, scopes, expiry, last use) exist as a table only.
- **Next**: a database-level guard that makes `werk_ledger` append-only (a trigger, or no
  UPDATE/DELETE grant), and a database-backed per-IP limit or a challenge on
  `/auth/contributor/email/start` against email bombing (today's per-IP limit is per instance).

| Route | Who | What |
|-------|-----|------|
| `GET /auth/contributor/github/start?returnTo=`, `…/github/callback` | anyone | GitHub sign-in, or linking GitHub to an email account |
| `POST /auth/contributor/email/start`, `…/email/verify` | anyone | emailed code |
| `GET /auth/contributor/me`, `POST /auth/contributor/logout` | contributor | |
| `GET /public/tasks` (area, size, status, skills, q, sort, cursor), `GET /public/tasks/:id` | anyone | the board and one task with proposals, thread, timeline |
| `GET /public/contributors` (sort, area, cursor), `GET /public/contributors/:handle` | anyone | the wall and public profiles |
| `POST /contrib/tasks/:id/proposals`, `PATCH`/`DELETE /contrib/proposals/:id`, `GET /contrib/me/proposals` | contributor | propose, edit, withdraw |
| `POST /contrib/tasks/:id/posts`, `POST /contrib/suggestions`, `PUT`/`DELETE /contrib/tasks/:id/vote` | contributor | thread, suggestions, +1 |
| `PATCH /contrib/me/profile`, `DELETE /contrib/me` | contributor | profile, delete account |
