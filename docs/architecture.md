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
| Binary (contracts, NDAs, invoices, receipts; CVs from /submit (and the closed /join) under `_resumes/`) | Vercel Blob, private store | every read goes through the API |
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
what we email back. Five other doors exist: `notifyTeam()` only reaches `@novawerk.io`,
`sendSignInCode()` sends one fixed template with a sign-in code to the address that is signing
in or signing up (NB-ADR-0014), and `sendNewsletterConfirmation()` sends one fixed double opt-in email with a confirmation link to
the address that just signed up for the newsletter, at most 3 a day per address (NB-ADR-0011),
`sendContributorNotice()` sends fixed emails to a contributor about their own account and
tasks, to their own verified address (NB-ADR-0013), and `sendWelcome()` sends one fixed welcome
email when someone makes an account, once (`members.welcome_sent_at`), to the address their
sign-in just proved (NB-ADR-0014).

The confirmation link opens a small page the API serves itself (`GET /public/newsletter/confirm`:
plain HTML, no scripts, so links never wait on a web deploy). Only its button confirms (`POST`),
so a mail scanner that opens links confirms nobody; the POST lands on the website's "you're
subscribed" or "link expired" page. `GET /cron/newsletter-cleanup` (daily) deletes unconfirmed
addresses with no marker: signups whose link expired once they are 30 days old, and every
unconfirmed row that never got a confirmation email (`confirm_send_count = 0`: from before
double opt-in went live on 2026-10-14; we don't ask them).

### Contributor notices

`GET /cron/contributor-notices` (`apps/api/src/contributor-notices.ts`) runs every 10 minutes
from GitHub Actions (`.github/workflows/contributor-notices.yml`; Vercel's Hobby plan only runs
crons daily, so `vercel.json` keeps a daily run as the fallback). It only turns what happened
into mail; the board decides what happens (the reminder, the release, extensions). Each run:

1. tidies: rows stuck `sending` for 15 minutes become `failed` with `unknown_outcome` (maybe
   sent; never retried); finished rows go after 30 days; a deleted account's address after 7;
2. queues notices into `contributor_notices`, one row per notice and person, each with a unique
   key: task events by `subject_contributor_id` (chosen, `inactivity_reminder`, released, closed,
   suggestion outcomes, Werk), proposals not chosen, and new posts (to the author replied to,
   the person on the task, the person who suggested it). It looks back 7 days. Reminder dates
   come from the task row (last activity + 14 days);
3. sends what is pending, other kinds first, then replies whose hour has passed (one mail per
   person and task per hour). Each row is claimed (`pending` → `sending`) and Resend gets an
   idempotency key per notice (or per set of replies), so a retry can't send it twice; once
   Resend has it, a failure to record that leaves the row `sending`, never `pending`. Three
   tries, then `failed`; a 429 isn't a try and ends the run. Skipped, with the reason: suspended
   accounts, accounts without a verified address, kinds turned off in settings
   (`notify_replies`, `notify_reminders`), anything older than 48 hours, and "it's yours" or
   a reminder for a task that changed hands.

Replies and reminders carry `List-Unsubscribe` with a signed one-click URL
(`POST /public/contributor-notices/off`, HMAC with the session secret): it turns that kind off
without signing in. Deleting an account queues one last `account_deleted` mail in the same
transaction, with the address on the row; the address is cleared once it is sent, or after 7
days.

### Task board news in the chat

`GET /cron/chat-notices` (`apps/api/src/chat-notices.ts`) runs in the same workflow and posts
to the team's room in Novawerk Chat through a bot (`CHAT_BOT_URL`, docs/infra.md). It scans the
database rather than hooking each route, because plans, suggestions and PRs arrive through the
website, MCP tokens, the GitHub webhook and the nightly sync alike, and a chat that is down
then only delays the news. It queues into `chat_notices` (unique key per proposal, event or
suggestion; 24-hour lookback): pending plans on open tasks (on an S task only after 2 minutes,
so `autoChooseSmall` goes first), `assigned` events with no actor (the system gave an S task
away: news only), `pr_linked` events, and suggestions still `suggested`. Three tries per row,
the run stops at the first failure, rows older than 48 hours are skipped, finished rows go
after 30 days.

## Who sees what in the admin panel

Everyone is a member, with one account (`members`, NB-ADR-0014). Maintainers (`role =
maintainer`) and members on a project's team sign in, with Google or a 6-digit code we email;
nobody else opens the panel. Maintainers see everything. Any other member sees the projects they
are on and those projects' posts: they edit
the content, deliverables, posts and files; the Initiator also changes the team. The stage,
featured, order and slug stay with maintainers. The API enforces all of it (`apps/api/src/routes/admin/access.ts`):
maintainer-only routes answer 403, and a project a member isn't on answers 404. Project files live in
the private Blob store with a `documents.project_id`. Decision:
NB-ADR-0008.

## Per-member isolation

A member only touches keys under their own prefix in the private file store (`<id>/…`), enforced by
`assertMemberPrefix` in `@nw/object-store`, and `owner`-scoped rows in queries.

## Contributor task board

Anyone can help build the software Novawerk runs on through an open task board (design:
`docs/contributor-board-design.md`; decision: NB-ADR-0013). This is the foundation: tables, rules
and the API. The pages, the admin side, the GitHub webhook, tokens and emails come next.

- **One account** (NB-ADR-0014). Contributors are members: one row in `members` per person
  (migrations 0017–0021 merged the old `contributors` table in by verified email). The board's
  columns keep their names (`contributor_id`, `author_contributor_id`…) and point at `members`.
  Everyone signs in at `/auth` with GitHub (our GitHub App's user authorization with PKCE; we
  keep GitHub's numeric id and login, never the token), Google, or an emailed 6-digit code
  (`sign_in_codes`: hashed, 10 minutes, 5 tries each claimed atomically, 3 per address per 15
  minutes, 10 requests and 30 checks per IP per hour, the same answer for every address). An
  account links more than one: GitHub while signed in, Google or a code with `link: true`; an
  account has one address, and an address one account. An email sign-up gets a neutral handle (`contributor-7f3a`) until
  they pick one; nothing from the address shows. A GitHub sign-up starts with the GitHub login.
  Proposing or working on a task needs GitHub linked, and a linked GitHub account is never
  swapped for another.
- **One session** (NB-ADR-0014): `nw_session` (audience `nw-session`, 30 days), httpOnly on the
  API's domain. `/auth` answers the website and the admin panel; `/contrib` the website only
  (`CONTRIBUTOR_ORIGINS`, default: the web origins); `/admin` the admin panel only. Every request
  re-reads the account, so a deleted or inactive account is out at once; sessions issued before
  `members.sessions_revoked_at` (set on sign-out and when a way in is linked) are refused. The
  role and the project team, not the cookie, keep people out of `/admin`; personal access tokens
  never reach it (`apps/api/test/admin-access.test.ts`).
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
- **Initiators on the wall.** A Member can switch on a public profile (`members.public_profile`,
  off by default, set only by them through `PATCH /admin/me`, with `profile_handle` and
  `profile_bio`). Members who started a public project (`project_members.role = "Initiator"`)
  then stand on `/contributors` with `kind: "initiator"` and that project, are listed on
  `GET /public/initiators` (the flags in the builders scene), and get `/u/<handle>`. Handles are
  one namespace across contributors and members. A Member's email never leaves.
- **Suggestion screenshots** (PNG/JPEG, 2 MB) go from the browser to the private store
  (`_suggestions/<contributor>/…`, a ticket from `POST /contrib/uploads/suggestion-screenshot`).
  Only members see them during triage. Accepting copies the image to the public store with its
  metadata stripped (EXIF, XMP, IPTC, comments, text chunks: `@nw/object-store`
  stripImageMetadata). Declining, a duplicate or deleting the account deletes it, and an
  upload never sent goes after a day (`/cron/screenshot-cleanup`).
- **Werk ledger** (`werk_ledger`) is append-only: a merge adds one row per task and PR (unique
  `(task_id, pr)`), and a member's change is a new row with a reason. Nothing updates a row.
- **GitHub.** A PR counts only when it names an assigned task (`Task: NW-42`, or NW-42 in its
  title, body or branch) and its author's GitHub id is the assignee's. Opened → `in_review`, a
  comment with the task link and a `size:` label; merged → `done` and the task's Werk once, a
  thank-you, the website's `tasks` and `contributors` caches refreshed; closed unmerged → back
  to `assigned`. `@nw/github` checks signatures and talks to GitHub as the App; `@nw/tasks`
  (github.ts) decides; `POST /webhooks/github` and the nightly `/cron/github-sync` (the same
  rules over the last week's PRs, every task in review checked against its PR, plus inactivity)
  wire them. A PR retargeted to another task leaves the first one; linking by hand reads the PR
  from GitHub and accepts only one that counts. Inactivity writes task events
  only (`inactivity_reminder` after 7 quiet days, then `released` after 14, 21 with "a week
  more"); emails go out from the events.
- **Agents** act for a contributor with a personal access token (`contributor_tokens`: only the
  SHA-256 of `nwt_…` is kept; scopes `tasks:read` (always), `proposals:write`,
  `discussion:write`, `tasks:work`, `suggestions:write`, `profile:write`; 30 or 90 days; at most
  10 live; revocable). `Authorization: Bearer` works on `/contrib/*` (each route checks its
  scope), on the board's `/public` reads (optional) and on `/mcp`. A token never manages
  tokens, confirms drafts, deletes the account, or changes the handle or who sees the profile.
  A proposal made with a token is a `draft` until its person confirms it in the browser
  (`POST /contrib/proposals/:id/confirm`); a token edits and discards drafts only, and drafts
  go when their task leaves `open`. Proposals, posts and task events (suggestions, PR links,
  releases, extensions) keep `via_token_id`, shown as "via agent · <token name>"; votes,
  reports and profile edits aren't marked. A suspended account's tokens stop; signing out ends
  browser sessions only, tokens live until revoked or expired. Browser writes on `/contrib`
  must come from the website's origins or carry JSON. Anonymous board reads have a looser
  per-network budget (600 an hour). `/mcp` takes one JSON-RPC message per POST, only from our
  origins in a browser. Each token has an hourly budget (1000
  reads, 100 writes; in memory, per instance). The MCP server (`apps/api/src/mcp.ts`, official
  TypeScript SDK, stateless Streamable HTTP) calls the same `@nw/tasks` functions; reading works
  without a token. `apps/web/public/llms.txt` tells agents how.
- **The admin side** (admin panel → Contributors: Tasks, Proposals, Suggestions, Moderation,
  Werk; `can_admin` only, like the inbox) runs on `@nw/tasks/admin.ts`. Members write and publish
  tasks, choose one plan (the others get private notes), decline a plan, triage suggestions
  (accept with size, area and done-when lines; duplicate; ask in the thread; decline), close
  and reopen tasks with a public reason, hide posts and suspend accounts with a reason only
  members see (Reported lists posts with reports until a member keeps or hides them;
  `task_posts.reports_cleared_at`), and add Werk rows. Every task action writes a `task_events` row, pointing at the
  proposal or post it is about (`proposal_id`, `post_id`); the notices are built from those.
  `edited`, `proposal_declined`, `post_hidden`, `post_unhidden` and `werk_adjusted` are
  members-only (`MEMBER_ONLY_EVENT_KINDS`): the public timeline leaves them out. A suspension
  isn't about one task, so it stays on the contributor's row (`suspended_reason`, `suspended_by`).
  Assigning locks the contributor's row, so two members can't give one person two tasks at once.
- **Next**: a database-level guard that makes `werk_ledger` append-only (a trigger, or no
  UPDATE/DELETE grant), and a database-backed per-IP limit or a challenge on
  `/auth/email/start` against email bombing (today's per-IP limit is per instance).

| Route | Who | What |
|-------|-----|------|
| `GET /auth/github/start?returnTo=`, `/auth/contributor/github/callback` | anyone | GitHub sign-in, or linking GitHub to the signed-in account |
| `POST /auth/google`, `POST /auth/email/start`, `…/email/verify` | anyone | Google or an emailed code; `link: true` adds it to the signed-in account |
| `GET /auth/me`, `POST /auth/logout` | signed in | the account (`role`, `adminPanel`); sign out everywhere |
| `GET /public/tasks` (area, size, status, skills, q, sort, cursor), `GET /public/tasks/:id` | anyone | the board and one task with proposals, thread, timeline |
| `GET /public/contributors` (sort, area, cursor), `GET /public/contributors/:handle` | anyone | the wall and public profiles |
| `POST /contrib/tasks/:id/proposals`, `PATCH`/`DELETE /contrib/proposals/:id`, `GET /contrib/me/proposals` | contributor | propose, edit, withdraw |
| `POST /contrib/tasks/:id/posts`, `POST /contrib/suggestions`, `PUT`/`DELETE /contrib/tasks/:id/vote` | contributor | thread, suggestions, +1 |
| `GET /contrib/me/tasks`, `GET /contrib/tasks/:id/guide`, `POST /contrib/tasks/:id/pr` / `release` / `extend` | contributor (the assignee) | my tasks, the guide, link a PR, give it back, a week more |
| `POST /contrib/posts/:id/report` | contributor | report a post (`post_reports`) |
| `GET /public/blocks` | anyone | merged tasks and ideas (accepted suggestions, pitches not declined) for the builders scene; private people as `anon-<hash>` |
| `GET /public/initiators` | anyone | opted-in Members who started a public project |
| `GET`/`PATCH /admin/me` | the member themself | their own public profile (`publicProfile`, `profileHandle`, `profileBio`) |
| `POST /webhooks/github`, `GET /cron/github-sync` | GitHub, Vercel Cron | pull requests move tasks; reconcile and inactivity |
| `PATCH /contrib/me/profile`, `DELETE /contrib/me` | contributor | profile, delete account |
| `GET`/`POST /contrib/tokens`, `DELETE /contrib/tokens/:id`, `POST /contrib/proposals/:id/confirm` | contributor, browser only | tokens; confirm an agent's draft |
| `GET /contrib/me`, `GET /contrib/me/votes` | contributor or token | who am I; the suggestions I +1'd |
| `/mcp` | anyone; a token to act | the MCP server |
| `/admin/tasks` (list, create, edit, publish, close, reopen, posts), `/admin/proposals` (queue, choose, decline) | admin | the board's admin side |
| `/admin/suggestions` (queue, accept, duplicate, ask, decline), `/admin/discussions` (hide, unhide), `/admin/contributors` (suspend, unsuspend), `/admin/werk` (ledger, adjust) | admin | triage, moderation, Werk |
