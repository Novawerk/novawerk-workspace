# Runbook

Day-to-day operations for the agents and records.

The agent workflows and `records/` live in the private repo `Novawerk/novawerk` (NB-ADR-0012).
The Actions steps below happen there; code changes happen here.

## Change an agent

1. Edit the logic in `packages/*` (with a test) and/or the wiring in `agents/<id>/index.ts`.
2. `pnpm typecheck && pnpm test`, then `pnpm agent <id> --dry-run`.
3. Merge to `main`. The next scheduled run uses it. Nothing to deploy.

Schedules and inputs live in the private repo's `.github/workflows/agent-<id>.yml`. Keep its
secrets in step with the agent's `needs`: the private repo's `agents-check` runs
`agents/agents.test.ts` from here and fails if they drift.

To run an agent locally against real records, clone both repos side by side and link the records
into this checkout: `ln -s ../novawerk/records records` (gitignored here).

## Run an agent by hand

- On GitHub: the private repo's Actions → "Agent: <id>" → Run workflow (fill in the inputs).
- From the CLI: `gh workflow run -R Novawerk/novawerk agent-sponsor-outreach.yml -f partnerId=acme-foundation -f intent=intro`.
- Locally: `pnpm agent <id> --input '<json>'` (reads `.env`). `pnpm agent <id> --help` lists
  the inputs, secrets and effects. Add `--dry-run` to see what it would do with no secrets.

## Approve an email

Agents never send. They queue `pending` rows in the `outbox` table.

1. In the admin panel, open the outbox. Check the recipient (discovered contacts are
   **unverified**), the subject and the body, and the record it is about.
2. Approve → the API calls `approveEmail()` then `sendApproved()`; the row becomes `sent` with a
   Resend id. Reject → `rejected`; it can never be sent. If the API has no `RESEND_API_KEY`
   (local dev), the row stays `approved` and the panel says so; **Send now** sends it once the
   key is set.
3. A `failed` row shows the Resend error. Fix the cause (often the sender domain) and approve again.

**A row that is `approved`, has `sent_at` set and no `provider_message_id`** was interrupted
mid-send. We never resend it automatically. Check Resend's log for that recipient; if it did not
go out, set the row's `status` to `failed` and `sent_at` to null, then approve it again.

## A run failed

Open the run in the Actions tab and read the failed step. Common causes:

- `Missing required environment variables: …` → add the repository secret named there.
- `jira init` failed → check `JIRA_*` secrets and the `JIRA_BOARD` repository variable
  (defaults to "Novawerk").
- `ClaudeRefusalError` / rate limits → re-run the job; intake also retries on its next sweep.
- Push rejected after a records commit → someone pushed at the same time; re-run the job.

Re-run with "Re-run failed jobs". Every agent is safe to re-run: intake and outreach never queue
the same email twice, the digest appends a dated section, the agenda never overwrites.

## Pause an agent

`gh workflow disable -R Novawerk/novawerk agent-<id>.yml` (or the private repo's Actions → the
workflow → "Disable workflow"). `gh workflow enable -R Novawerk/novawerk agent-<id>.yml` to
resume. GitHub also pauses cron on a repo with no activity for 60 days.

## Rotate a secret

1. Generate the new value (Anthropic / Jira / Resend / Vercel Blob / Neon / the Slack webhook).
2. Update the GitHub Actions repository secret (Settings → Secrets and variables → Actions) in
   the repo that uses it (agents: the private repo; deploys: this repo), the
   Vercel env for the apps if they use it, and your local `.env`.
3. Run one affected agent from the Actions tab to confirm it still authenticates.
4. Revoke the old value.

Secrets the agents use: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `JIRA_BASE_URL`, `JIRA_EMAIL`,
`JIRA_API_TOKEN`. `RESEND_API_KEY` and `EMAIL_FROM` belong to the API only — never add them to an
agent workflow.

## The task board and GitHub

- **A PR didn't move its task.** Check that it names the task (`Task: NW-42` in the body, or
  NW-42 in the title or branch), that the task is assigned, and that the PR's author is the
  GitHub account the assignee linked. App settings → Advanced → Recent deliveries shows what
  GitHub sent and what we answered (`{"result": …}`). GitHub doesn't retry a failed delivery by
  itself: redeliver it from there. Each delivery id is handled once; one that failed is
  forgotten so a redelivery runs, and one whose handling was cut off (a timeout) can be claimed
  again after 5 minutes. The safety net is the nightly `/cron/github-sync`: it runs the last
  week's PRs through the same rules and checks every task in review against its PR. Run it by
  hand with `curl -H "Authorization: Bearer $CRON_SECRET" https://api.novawerk.io/cron/github-sync`;
  its `errors` list names any GitHub call that failed.
- **The assignee links a PR by hand** on the task page when the webhook missed it. The API reads
  the PR from GitHub first: it must be open, from their linked account, and name the task.
  Without the App variables linking by hand answers 503.
- **A task sits in review on a PR that went away** (closed, deleted, retargeted to another task,
  or not by the assignee): the nightly sync puts it back to assigned with a note on the timeline.
- **Werk was wrong** (a revert, a PR that shouldn't have counted): add a member adjustment with a
  reason. Never edit or delete a `werk_ledger` row.
- **Idle tasks**: a reminder event after 7 quiet days, back on the board after 14 (21 with
  "a week more", once). Both run in `/cron/github-sync`.
- **Rotate the App's private key**: generate a new one in the App settings, set
  `GITHUB_APP_PRIVATE_KEY` in Vercel, redeploy, then delete the old key in the App settings.
  The webhook secret: set the new one in the App and in Vercel at the same time (deliveries in
  between fail with 401; redeliver them).

## Backups

One Postgres holds everything that changes, including pending outbox approvals. Neon keeps
point-in-time history; we also keep our own dump: `DATABASE_URL=… pnpm backup`, then test a
restore into a scratch database. Vercel Blob is durable but has no object lock: keep your own copy of signed contracts too.

## Posts for a project

The promo agent plans and drafts them; nothing is posted automatically.

1. Set the project's status (and, when launching, its launch date) on its page under
   **Projects**. The posts it has reached appear under **Posts** and on the project's Posts tab.
2. Open a post and tell the **Writer** in the agent rail on the right what it should say (this
   week's story, real quotes, real numbers). It keeps the brief, asks for what's missing and has
   the promo agent rewrite the draft; or edit the draft yourself. Fill every 【待补充】 /
   [To fill in] placeholder.
3. **Approve**, then **Copy text**, download the picture in the platform's size, post it, and
   press **Mark as posted**.
4. A draft that never arrives: the API drafts it within a minute; look for `[promo]` in the
   `novawerk-api` logs on Vercel. Without `ANTHROPIC_API_KEY` on the API, requests wait for the
   daily `agent-promo` run (05:40 UTC); the Actions tab has those.

## Any other post

**Posts → New post**: pick the project (or Novawerk itself), the kind (自由帖 for anything that
isn't a lifecycle moment, with a name), the date, the languages and the platforms, and whether the
template card goes first. Leave the promo agent on for a first draft, or switch it off and write
it yourself. Add the post's own pictures under **Pictures** (upload, a link, or the project's).
The preview shows it per platform; **Download** gives the card in that platform's size and the
post's own pictures, numbered in order.

## Write a post in the repo

1. `pnpm post new --name "Open day" --date 2026-10-18` (or the **In the repo** tab of New post,
   which builds the command), then ask Claude Code to write it: it has the `nw-posts` skill.
   To continue a post from the admin panel: … → **Continue in the repo**, run the command it shows.
2. `pnpm post render <folder>` and look at the cards; `pnpm post check <folder>`.
3. Open a pull request. CI runs `pnpm post check`. When it merges, the deploy workflow's
   **sync posts** job writes it into the admin panel as approved; post it from there.
4. A post that didn't arrive: the **sync posts** job's log names each folder and what happened
   (created, updated, unchanged, kept, skipped, failed and why). Pictures need the
   `BLOB_PUBLIC_READ_WRITE_TOKEN` repository secret.
5. Locally: `pnpm post sync --local` writes the folders into the database in `apps/api/.env`; the
   local API serves their pictures (DEV_LOGIN only).

## Accept a pitch or an application

Pitches are the first column of the **Projects** board; applications are in the inbox. Open one
and press **Accept and create project** (a pitch) or
**Accept as member** (an application). Each is one step: the project draft or the Member is
created together with the status change. Accepting a pitch also queues our acceptance email (what
happens next and how we work) and **Decline** queues a short no; both are fixed templates and wait
in the outbox for a member's approval (switch them off in the dialog). **Invite to a call** has the
API's language model draft an invite from the pitch and the times you offer; you edit it and send it
to the outbox. The person who pitched becomes the project's Initiator as soon as
they are a Member (NB-ADR-0005).

## Add a member

1. Most members arrive through an accepted application. Otherwise: admin panel → Members →
   **Add member** (handle, name, the Google account email, admin access if they need the panel).
   Without the panel: `pnpm provision:member <id> "<Name>" <google-email> [--admin]` prints the
   SQL; review and run it.
2. Add them to `records/people/roster.md` in the private repo.
3. If they work on the agents or records, give them access to the private repo. Anyone can
   contribute code here.
