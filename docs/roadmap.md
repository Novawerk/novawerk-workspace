# Roadmap — agents and records

The plan of record for the back-office side. Read this first if you're picking
up agent work in a fresh session. Companion docs: [`architecture.md`](architecture.md) (the
design), [`runbook.md`](runbook.md) (operations), [`security.md`](security.md).

## Context

Novawerk is an early-stage open non-profit community (founded 2025, a handful of members,
tagline *"An open workshop for early ideas"*). Canonical facts live in `knowledge/`. The private
layer — minutes, finances, contracts, member and partner records — lives in `records/` in the
private repo `Novawerk/novawerk`, and in Postgres. This repo holds the code, in the open. The
agents do the repetitive work around it; anything that leaves Novawerk waits for a member.

## Decisions of record

- **Runtime: GitHub Actions** — one workflow per agent, no server
  (NB-ADR-0004,
  reversing the Windmill choice in NB-ADR-0001).
- **Approvals: the `outbox` table.** Agents queue; a member approves in the admin panel; only
  `sendApproved()` sends, once. Discovery and drafting stay autonomous
  (NB-ADR-0003).
- **Two repos** (NB-ADR-0012): code here, public; records and agent workflows in the private repo.
- **Storage tiers:** narrative → `records/` (private repo); structured → Postgres (Neon); binary → Vercel Blob.
- **Agents:** logic in tested `packages/*`; `agents/<id>/index.ts` only wires config + packages.
- **Everyone is a member** (NB-ADR-0014): one account each. Maintainers (`role`) run Novawerk;
  project teams are a relationship, not a role.

## Status

**Done (in repo)**

- Packages wired and tested: `@nw/email` outbox gate, `@nw/config` per-caller sections,
  `@nw/agent-core` (Claude via `@anthropic-ai/sdk`, `defineAgent`/`runAgent`), `@nw/intake`,
  `@nw/ceremonies`, `@nw/partners`, `@nw/jira`, `@nw/records`, `@nw/kb`, `@nw/object-store`.
- Seven agents with dry runs: `intake`, `promo`, `sponsor-discovery`, `sponsor-outreach`,
  `standup-digest`, `all-hands-prep`, `jira-automation`.
- Project lifecycle and posts (NB-ADR-0007): status history, launch date, deliverables; posts
  planned from them, drafted by `promo` in both languages, reviewed and posted by hand in the
  admin panel; pictures assembled from templates by `POST /admin/cards`.
- Member sign-in (NB-ADR-0008): every member signs in with Google or an emailed code; a
  project's team edits its content, deliverables, posts and files; admins keep the rest.
- One workflow per agent (in the private repo); least-secret env; records committed as
  `novawerk-bot`.
- The code moved to this public repo; records and agent workflows stayed private (NB-ADR-0012).
- Windmill, the VM stack and the flow bundler removed.

**Next (needs people / other parts of the repo)**

1. **Secrets.** Add the repository secrets listed in the runbook. Set the `JIRA_BOARD`
   variable if the board isn't called "Novawerk".
2. **Admin panel outbox page.** List `pending` rows; approve → `approveEmail()` +
   `sendApproved()`; reject → `rejectEmail()`. Show `failed` errors.
3. **API → intake.** After saving a submission or application, the API runs intake itself
   (`apps/api/src/agents.ts`, NB-ADR-0010; the cron sweep catches misses).
4. **Email domain.** `EMAIL_FROM` must be a verified Resend sender.
5. **All-hands anchor.** Confirm `ALL_HANDS_ANCHOR` in `agents/all-hands-prep/index.ts` is the
   Monday of a real all-hands week.
6. **First live runs.** Run each agent once from the Actions tab and read the output.
7. **Backups.** Schedule `pnpm backup` (or rely on Neon PITR) and test a restore.

**Later**

- Posts: auto-post to Discord through a webhook once the server exists (approved posts only).
- Posts: a newsletter digest that gathers the month's published posts.

- A Postgres role for agents that can insert into `outbox` but not update it.
- Ground `sponsor-discovery` with web search so candidates and contacts are real.
- An outbox `sending` status (or a `claimed_at` column) instead of using `sent_at` as the claim.

## How to verify

- `pnpm install && pnpm typecheck && pnpm test` pass.
- `pnpm agent <id> --dry-run` works for every agent with an empty environment.
- `pnpm demo:pipeline` shows discovery → queued draft → the gate refusing a pending send.
- A live intake run leaves `ai_summary` set and one `pending` outbox row per new row — and no
  email sent until a member approves it.
