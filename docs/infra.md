# Infrastructure

What runs where, on which accounts, and how we test and release. Last checked on 2026-10-14.
Companion docs: [`architecture.md`](architecture.md), [`runbook.md`](runbook.md),
[`security.md`](security.md).

Two repos (NB-ADR-0012): this public one, `Novawerk/novawerk-workspace`, holds the code and
deploys the apps; the private `Novawerk/novawerk` holds records, the agent workflows and the
account details. This file lists names, never secret values. Real values live in Vercel, GitHub Actions secrets
or a local `.env` (ignored by git).

## At a glance

| Piece | Runs on | Production address |
|-------|---------|--------------------|
| `apps/web` | Vercel (Next.js) | novawerk.io |
| `apps/admin` | Vercel (static Vite build) | admin.novawerk.io |
| `apps/api` | Vercel Function (`api/index.js` serving the tsup bundle of `src/index.ts`) | api.novawerk.io |
| Database | Neon Postgres, Frankfurt | — |
| Agents | GitHub Actions in the private repo, `.github/workflows/agent-*.yml`; they check out this repo | — |
| Files | Vercel Blob, Frankfurt: `novawerk-private` for documents and visitors' CVs, `novawerk-public` for project images | — |
| Outgoing email | Resend (EU, Ireland), sends as `info@novawerk.io` | — |
| Incoming email | Google Workspace | info@novawerk.io |
| info@ in Slack | Resend receiving → `POST /webhooks/resend` on the API → Slack | `#info-inbox` |
| Chat model (intake chat, admin assistant, post writer) | Anthropic Claude (`LLM_PROVIDER`, default `anthropic`) | — |
| Agents' model | Anthropic Claude | — |
| Ceremonies board | Jira, novawerk-teams.atlassian.net, project NB | — |

## Where we are today

- **novawerk.io serves the new site** since 2026-10-03; the test-phase banner came down on
  2026-10-12. The chat assistant runs on Claude since 2026-10-11 (it ran on DeepSeek before).
  `www.novawerk.io` redirects to it (308).
- **admin.novawerk.io and api.novawerk.io are live**, on the new Neon database. New pitches and
  applications email info@novawerk.io through Resend.
- **The old site is parked.** The Vercel project `nw-web-portal` (Payload CMS) has no custom
  domain any more and keeps its own Neon database, untouched. To roll back, move `novawerk.io`
  and `www.novawerk.io` back to it. **To do (a person):** delete `nw-web-portal` and its
  database. We don't import its newsletter subscribers: they never confirmed (decided
  2026-10-15).
- The web build still refuses to run in production if `knowledge/legal/*.md` has
  `{{placeholders}}`, and the Deploy workflow then skips the web.
- **Email DNS is done** (2026-10-03): Google receives mail, and Resend is verified to send it.
- **stories.novawerk.io** is a separate Vercel project (`stories-about-chinese-in-germany`).
  Nothing here touches it.

## Two environments: local and production

We have no staging. We test locally, then release to production.

| | Local | Production |
|---|---|---|
| Git branch | any | `main` |
| Web | localhost:3000 | novawerk.io (`www` redirects) |
| Admin | localhost:5173 | admin.novawerk.io |
| API | localhost:8787 | api.novawerk.io |
| Database | Docker Postgres 17 (`compose.yaml`), seed data | Neon |
| Email | logged to the console (no key) | Resend |
| Intake chat, admin assistant, post writer | your own `ANTHROPIC_API_KEY`, or `LLM_PROVIDER=mock` | production key |
| Agents | `pnpm agent <id> --dry-run` | GitHub Actions (private repo) |
| File uploads | `.local-files/` in the repo, with `DEV_LOGIN` and no `BLOB_*` token | Vercel Blob |
| Site cache | revalidated when `WEB_REVALIDATE_URL` points at `localhost:3000/api/revalidate` | revalidated by the API |
| Admin sign-in | `DEV_LOGIN`, real Google (localhost is an allowed origin), or an email code printed to the API log | Google, or an email code via Resend |

### Rules

1. **Test locally first.** The whole stack runs on a laptop: `pnpm db:up`, `pnpm db:migrate`,
   `pnpm db:seed:dev`, `pnpm dev`. The README has the details.
2. **Local never uses production data.** Don't put the production `DATABASE_URL` in your
   `.env`. Migrations reach production through the Deploy workflow, not from a laptop.
3. **No previews.** `.github/workflows/deploy.yml` deploys production on every push to `main`,
   and nothing else deploys. (Vercel isn't linked to GitHub. Each app's `vercel.json` also
   skips non-production builds, in case it ever is.)
4. **Keep a way back.** Before a risky migration, create a Neon branch from production. It is
   an instant copy we can restore from. For code, Vercel's Instant Rollback switches back to
   the previous deployment.
5. **Migrations go first and must not break live code.** The Deploy workflow applies new
   migrations, then deploys. For a minute the old code runs on the new schema, so a migration
   must work with the code that is already live: add first, remove in a later release.

### Release flow

1. Work on a branch. Try it locally. `pnpm typecheck && pnpm test`.
2. Open a PR. CI runs the same checks.
3. If the PR has a risky migration, create a restore-point branch in Neon first.
4. Merge into `main`. The Deploy workflow applies new migrations (`pnpm db:migrate` with the
   `DATABASE_URL` secret; Drizzle skips the ones already applied), then uploads the repo and
   Vercel builds all three apps. If the migration fails, nothing deploys. `.vercelignore` keeps
   a locally linked `records/` and local files out of the upload.
5. Check the live site. If something is wrong, roll back in Vercel and fix it on a new branch.

## Domains and DNS

DNS for novawerk.io is on Vercel DNS, in the Vercel team `novawerk`:
`vercel dns ls novawerk.io --scope novawerk`.

| Name | Type | Value | For |
|------|------|-------|-----|
| `@` | MX | `1 smtp.google.com` | Google Workspace receives our mail |
| `@` | TXT | `v=spf1 include:_spf.google.com ~all` | SPF for mail sent from Google |
| `@` | TXT | `google-site-verification=…` | Workspace domain verification |
| `google._domainkey` | TXT | DKIM public key | Google DKIM |
| `resend._domainkey` | TXT | DKIM public key | Resend DKIM |
| `send` | MX | `10 feedback-smtp.eu-west-1.amazonses.com` | Resend bounces |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | Resend SPF (return path) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | DMARC, monitoring only |
| `@`, `*` | ALIAS | Vercel | websites |

**novawerk.ai** (bought 2026-10-12, registrar and DNS on Vercel, same team): `novawerk.ai` and
`www.novawerk.ai` are domains on `novawerk-web` that redirect to `novawerk.io` (308). No mail on it.

Resend's return path is on `send.novawerk.io`, so it never touches how Google receives mail.
`admin` and `api` need no new records: we add them as domains on their Vercel projects, and the
`*` record already points at Vercel.

## Accounts

Which account holds each service, its owners and ids are in the private repo
(`Novawerk/novawerk`, `docs/infra-private.md`). We use Vercel (hosting, DNS, Blob), Neon
(Postgres, Frankfurt), Resend (email, EU), Google Workspace (inboxes), Google Cloud (admin
sign-in), Slack, Anthropic and Atlassian.

## Variables

Every app's `.env.example` explains each variable. This table shows what differs between local
and production. "—" means unset.

**API** (`apps/api`, Vercel env)

| Variable | Local | Production |
|----------|-------|------------|
| `DATABASE_URL` | Docker | Neon |
| `GOOGLE_CLIENT_ID` | any placeholder, or the real client | OAuth client |
| `SESSION_SECRET` | any 32+ characters | its own, never reused. Also keys the anonymous names on `/public/blocks`: rotating it renames them. |
| `DEV_LOGIN` | `true` | — (the API refuses to start with it on Vercel) |
| `RESEND_API_KEY` | — | production key |
| `ALLOWED_ORIGINS` | default | `https://novawerk.io,https://www.novawerk.io,https://admin.novawerk.io` |
| `ADMIN_ORIGINS` | default | `https://admin.novawerk.io` |
| `WEB_REVALIDATE_URL` | — | `https://novawerk.io/api/revalidate` |
| `WEB_REVALIDATE_SECRET` | — | same as the web's `REVALIDATE_SECRET` |
| `ANTHROPIC_API_KEY` | — (the crons on GitHub Actions do the work) | a key from the Novawerk Console workspace |
| `LLM_PROVIDER` | — (Claude, with `ANTHROPIC_API_KEY`), or `mock` | — (Claude) |
| `BLOB_PUBLIC_READ_WRITE_TOKEN`, `BLOB_PRIVATE_READ_WRITE_TOKEN` | unset: with `DEV_LOGIN`, uploads go to `.local-files/` (private ones in `_private/`, never served); don't pull production's | set by connecting the stores |
| `CRON_SECRET` | — | set; Vercel Cron sends it to `/cron/*`. Also a GitHub Actions secret on this repo for `contributor-notices.yml` |
| `RESEND_WEBHOOK_SECRET`, `RESEND_RECEIVING_API_KEY`, `SLACK_INBOX_WEBHOOK_URL` | — | set; see "info@ in Slack" |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | the GitHub App's, or unset (email codes still work) | the GitHub App `novawerk-task-board` |
| `CONTRIBUTOR_ORIGINS` | default | `https://novawerk.io,https://www.novawerk.io` |
| `CHAT_URL`, `CHAT_SSO_SECRET` | — (`/auth/chat` answers 404) | `https://chat.novawerk.io` and 32+ random characters, the same as the chat's `CHAT_SSO_SECRET` (NB-ADR-0014). Rotate both together |
| `CHAT_BOT_URL` | — (`/cron/chat-notices` does nothing) | the bot's messages URL for the task board room, `https://chat.novawerk.io/rooms/<room id>/<bot key>/messages`. Secret: the bot key is in it. See "Task board news in the chat" |
| `WEB_READ_KEY` | — | 32+ random characters, the same on the web (`WEB_READ_KEY`): the website's server reads the task board without the anonymous 600/h limit |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID` | — (the board moves tasks without replying on PRs) | the App's id `5317582`, its private key (PEM), installation `171409213` |
| `GITHUB_WEBHOOK_SECRET` | — (`/webhooks/github` answers 404) | the App's webhook secret, 16+ characters |

Signing in with GitHub (everyone, NB-ADR-0014) goes through the GitHub App `novawerk-task-board` (user authorization only).
Its callback URLs are `https://api.novawerk.io/auth/contributor/github/callback` and
`http://localhost:8787/auth/contributor/github/callback`; the API builds the callback from
`PUBLIC_API_URL`, so locally set that to `http://localhost:8787`.

### The GitHub App and the webhook

The App `novawerk-task-board` (App ID 5317582, installed only on `Novawerk/novawerk-workspace`,
installation 171409213) does two jobs with two sets of variables: contributor sign-in (the
client id and secret, above) and acting on our repository (`GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`): it comments on pull requests and adds a
`size:<S|M|L|XL>` label. Its permissions: pull requests write, checks write, metadata read, email
addresses read. Events: `pull_request`, `pull_request_review`.

Switch the webhook on:

1. Generate a webhook secret (`openssl rand -hex 32`) and a private key (App settings →
   Private keys → Generate). The key downloads as a `.pem` file.
2. In Vercel (novawerk-api, Production) set `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID=5317582`,
   `GITHUB_APP_INSTALLATION_ID=171409213` and `GITHUB_APP_PRIVATE_KEY` (paste the whole PEM;
   a one-line value with `\n` works too). Redeploy. Then delete the downloaded `.pem`.
3. App settings → Webhook: Active on, URL `https://api.novawerk.io/webhooks/github`, the same
   secret, content type JSON. Save.
4. Check: Advanced → Recent deliveries shows the `ping` with a 200 (`{"ignored":"ping"}`).

`/cron/github-sync` (04:00 UTC) catches up on anything the webhook missed: it reads the last
week's pull requests with the App, and also reminds and releases idle tasks. Without the App
variables it only does the latter.

The README's Contributors block is rewritten by `.github/workflows/contributors.yml` (nightly,
"Run workflow", or a `contributors` repository_dispatch). It reads `GET /public/contributors`
and commits only `README.md` with the workflow's own `GITHUB_TOKEN`. The API doesn't send the
dispatch yet: that needs Contents write on the App, which it doesn't have; the nightly run covers it.
The commit author's email is the repository variable `NOVAWERK_BOT_EMAIL` (falls back to the
Actions bot).

Set the origin lists explicitly in production. The built-in defaults include `localhost`,
which is only meant for local development.

**Web** (`apps/web`): `API_URL`, `NEXT_PUBLIC_API_URL`, `REVALIDATE_SECRET`, and
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the API's `GOOGLE_CLIENT_ID`; the client lists novawerk.io as an
authorised JavaScript origin) for "Continue with Google". Optional: `NEXT_PUBLIC_ADMIN_URL` and
`NEXT_PUBLIC_CHAT_URL`, where a sign-in may send people back to (defaults: admin.novawerk.io,
chat.novawerk.io). The Next.js build bakes `NEXT_PUBLIC_*` in, so changing one means a redeploy.

**Admin** (`apps/admin`): `VITE_API_URL` and `VITE_WEB_URL`. Everyone signs in on novawerk.io
(NB-ADR-0014), so the admin panel has no Google button of its own. Sample data is **off**
unless `VITE_USE_SAMPLE_DATA=true` (for UI work without the API); never set it in production.
`VITE_DEV_LOGIN` is ignored in production builds.

**Deploys** (GitHub Actions repository secrets on this repo): `VERCEL_TOKEN`, a Vercel token with access to
the `novawerk` team, and `DATABASE_URL`, Neon production with the direct (not pooled)
connection, for the migration step and the post sync. The agents use the same `DATABASE_URL`,
set on the private repo.
`BLOB_PUBLIC_READ_WRITE_TOKEN` (the public file store's token, as on the API) lets the post sync
upload the pictures of posts written in the repo. The project and team ids in `deploy.yml` aren't
secret.

**Agents** (GitHub Actions repository secrets on the private repo): `ANTHROPIC_API_KEY`, `DATABASE_URL` (production),
`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, plus the variable `JIRA_BOARD`. Never
`RESEND_API_KEY`: the private repo's `agents-check` runs `agents/agents.test.ts` and fails if an
agent workflow gets it.

## info@ in Slack

Everyone in `#info-inbox` sees each email to info@novawerk.io, a few seconds after it arrives.
Slack's free plan can't give a channel its own email address, so we relay it ourselves:

1. The Google group sends each email to its members, and one member is an address on Resend's
   receiving domain (`<name>@<id>.resend.app`).
2. Resend calls `POST https://api.novawerk.io/webhooks/resend` (event `email.received`).
3. The API checks the signature, fetches the email from Resend, and posts it to the channel
   as one card through a Slack incoming webhook: the subject, sender → recipient, the first
   1,500 characters, the attachment names and an "Open in Gmail" link. It posts only mail with the group's `List-ID: <info.novawerk.io>`, because the
   Resend domain accepts mail for any address. Code: `apps/api/src/inbound-mail.ts`.

Nothing is stored in our database. Gmail stays the inbox: reply from there, and use the Slack
thread to say who answers. Resend keeps its own copy of each received email.

### Set it up

1. **Slack.** Create the private channel `#info-inbox`. At api.slack.com/apps, create the app
   "Novawerk Mail" in the Novawerk workspace, turn on Incoming Webhooks, and add a webhook for
   `#info-inbox`. Copy its URL.
2. **Resend.** Emails → Receiving → ⋯ → Receiving address shows the `<id>.resend.app` domain.
   Ours is in `docs/infra-private.md` in the private repo.
   Under Webhooks, add the endpoint
   `https://api.novawerk.io/webhooks/resend` with only `email.received`, and copy its signing
   secret. Under API keys, create "novawerk-api receiving" with **Full access**: reading a
   received email needs it. Keep the sending-only `RESEND_API_KEY` as it is.
3. **Vercel.** On `novawerk-api` (Production) set `SLACK_INBOX_WEBHOOK_URL`,
   `RESEND_WEBHOOK_SECRET` and `RESEND_RECEIVING_API_KEY`, then redeploy. The API refuses to
   start with only some of them.
4. **Google.** In the Admin console, Apps → Google Workspace → Groups for Business: allow group
   owners to add external members. In the group "Novawerk Info": turn on "Allow members outside
   your organization", then add the Resend address directly as a member, subscribed to each
   email.
5. **Test.** Email info@novawerk.io from a personal address. It should show up in
   `#info-inbox` within a minute.

### When an email doesn't show up

- Resend → Webhooks → the endpoint lists each delivery and its answer. Fix the cause, then
  press Replay.
- `401`: the signing secret on Vercel doesn't match the webhook's. `502`: Resend or Slack
  failed; the Vercel log line `[api] inbound email <id> not posted to Slack` says which, and
  Resend retries for about a day.
- `200 {"result":"not-from-list"}`: the email didn't carry the group's list id. Resend shows
  it in the email's Raw view as the `list` header, `{"id":{"name":"info.novawerk.io"}}`.
  Check that it came through the group, or set `INBOUND_LIST_ID`.
- Nothing in Resend at all: the address is no longer a member of the group, or Google held
  the email as spam (it then reaches no member).

## Task board news in the chat

An open room in Novawerk Chat (chat.novawerk.io), `#task-board`, gets one message per thing on the task board, posted
by a bot. **To do**: a new plan waiting for a maintainer (any plan on an M, L or XL task; on an S
task, a plan the system didn't choose because its author can't take a task now), a pull request
to review (a task moved to `in_review`), a new suggestion to triage. **FYI**: an S task the
system gave to the first plan. Each message has the task number and title, a handle and links
(the task, the admin queue, the PR); never an email address, a plan's text or a decline note.

`GET /cron/chat-notices` (`apps/api/src/chat-notices.ts`) runs every 10 minutes in the same
GitHub Actions workflow as the contributor notices, daily from Vercel as the fallback. It looks
at the last 24 hours, queues each thing once in `chat_notices`, and posts it. If the chat is
down a row waits for the next run (three tries); after 48 hours it is skipped. Without
`CHAT_BOT_URL` it does nothing and queues nothing.

### Set it up

1. **Bot.** Sign in to chat.novawerk.io as an administrator. Account settings → **Bots** → New
   bot (`/account/bots/new`). Name it "Task board", give it a picture, and leave the webhook URL
   empty (it only posts). Open the bot again: **Bot key** shows `<bot id>-<token>`; copy it.
2. **Room.** Ours is `#task-board`, room 7, **Open** (everyone with a Novawerk account sees it).
   A bot only posts to rooms it is in (otherwise the chat answers 404): create the room as
   Closed with the bot picked (`/rooms/closeds/new`), then switch it to Open in its settings;
   switching keeps the bot. The room's id is the number in its address,
   `chat.novawerk.io/rooms/<room id>`.
3. **Vercel.** On `novawerk-api` (Production) set `CHAT_BOT_URL` to
   `https://chat.novawerk.io/rooms/<room id>/<bot key>/messages` and redeploy. The API refuses
   to start with a URL of any other shape.
4. **Test.** Check by hand: `curl -X POST -H 'Content-Type: text/html' -d '<strong>hello</strong>'
   "$CHAT_BOT_URL"` answers `201` and the message shows in the room. Then run the workflow
   "Contributor notices" (Run workflow): the `/cron/chat-notices` step answers
   `{"configured":true,…}`.

Resetting the bot key (the bot's page → Reset key) breaks the old URL: update `CHAT_BOT_URL`.
When nothing shows up: the step's answer says `failed`, and the Vercel log has
`[chat-notices] posting … failed: the chat answered <status>` (404: wrong room id, or the bot
isn't in the room; 401/302: wrong key).

## Before launch

The open checklist is in the private repo (`docs/infra-private.md`).
