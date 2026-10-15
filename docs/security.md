# Security & access

How we keep the private side private. Companion docs: [`architecture.md`](architecture.md),
[`runbook.md`](runbook.md).

## What's sensitive here

Contracts and NDAs (private Vercel Blob store), the finance ledger, partner CRM, submissions and applications (Postgres),
member records, and the secrets that let agents act (Anthropic, Jira, Neon, Vercel Blob) and that send
email (Resend). None of that is in this repo.

The code is public (`Novawerk/novawerk-workspace`, MIT). Anyone can read it, so it must hold
nothing secret. The boundary is the private repo `Novawerk/novawerk` (records, agent workflows,
account details), the secrets in Vercel and GitHub Actions, and the database. Never copy record
text, account ids or addresses into this repo, an issue or a pull request.

## The guarantees we build in

- **Outbound email is gated.** Agents can only `queueEmail()` a `pending` outbox row.
  `sendApproved()` refuses any row a member did not approve or that was already sent, and claims
  the row with a conditional update so it is sent at most once. Tested in
  `packages/email/src/outbox.test.ts`, including two senders racing.
- **Contributor notices are fixed and go to the contributor only.** `sendContributorNotice()`
  takes one of the `CONTRIBUTOR_NOTICE_KINDS` and nothing else: a task number and title, a
  number or date, a member's note, all escaped. The cron sends it to `contributors.email`, which
  only an emailed sign-in code sets, never to an address someone typed. Each queued notice has a
  unique key, is claimed before it is sent and carries a Resend idempotency key, so it goes out
  at most once (a run that dies mid-send leaves it `failed`, maybe sent, never resent); suspended accounts,
  accounts without an address and kinds turned off in settings get nothing (NB-ADR-0013).
  Tested in `apps/api/test/contributor-notices.test.ts` and
  `packages/email/src/contributor-notices.test.ts`.
- **Sign-in codes are short-lived.** An emailed code lives 10 minutes, allows 5 tries, works
  once, and only its keyed hash is stored; at most 3 per address per 15 minutes. Asking for one
  doesn't reveal who is a member. Tested in `apps/api/test/member-portal.test.ts`.
- **Members see their own projects only.** Without `can_admin`, a member reaches only the
  projects they are on (404 for the rest) and none of the admin pages (403): no pitches,
  applications, outbox, partners, finance, documents or assistant. Same test file.
- **Agents cannot reach Resend.** Agent workflows never receive `RESEND_API_KEY`;
  `agents/agents.test.ts` fails if one does.
- **Least secrets per job.** Each workflow passes only the secrets its agent declares, and
  `@nw/config` loads only those sections. No `secrets: inherit`.
- **Untrusted input stays data.** Form text is wrapped as data in the summary prompt and never
  shapes an outbound email: the intake acknowledgement is a fixed template.
- **Agents write only records.** `@nw/records` refuses any path outside `records/**/*.md` and any
  `*.private.*` file; the workflow stages only `records/` and commits it to the private repo.
  `records` is gitignored here, so a local link to the private records can't be committed.
- **Per-member isolation.** A member only touches keys under their own file prefix (`<id>/…`),
  enforced by `assertMemberPrefix` in `@nw/object-store`, and `owner`-scoped rows. Tested,
  including the `ada` vs `ada-evil` lookalike.
- **Secrets never touch git.** Real values live in GitHub Actions secrets, the hosting platform,
  or `.env` (gitignored). `@nw/config` is the only shared module that reads env.
- **Binaries never touch git.** Contracts and receipts live in the private Blob store; a `documents` row links
  them. Visitors' CVs live there too (`_resumes/…`), linked from their pitch or application; the
  public ticket route only issues 5 MB PDF/Word uploads, and unsent CVs are swept daily.
- **Webhooks are signed.** `POST /webhooks/resend` refuses a request without Resend's signature
  or older than 5 minutes, and posts to Slack only mail with the info@ group's `List-ID`. The
  sender's text is escaped, so it can't ping the channel or hide a link. Tested in
  `apps/api/test/inbound-mail.test.ts`.
- **GitHub moves tasks only when it should.** `POST /webhooks/github` checks
  `X-Hub-Signature-256` (HMAC-SHA256 of the raw body, constant time) and handles each
  `X-GitHub-Delivery` once. A PR counts only when its author's numeric GitHub id is the one the
  assignee linked; anyone else's PR moves nothing and earns no Werk. Werk is awarded once per
  task and PR (a unique key). The App's private key and the webhook secret live only in Vercel
  env; the App has no Contents permission. Tested in `packages/github`, `packages/tasks`
  (github.test.ts) and `apps/api/test/github.test.ts`.
- **The README workflow runs no outside code.** `contributors.yml` runs on a schedule, a manual
  run or a repository_dispatch, checks out `main`, reads our public API and commits only
  `README.md`. It is the only workflow with `contents: write`; nothing here uses
  `pull_request_target`.
- **Pinned tools.** The `jira` CLI download in CI is checked against a pinned SHA-256.

## Periodic access review (quarterly)

Run this list and write the result into a dated record under `records/operations/` (private repo):

- [ ] Collaborators on the private repo, write access on this one, and org members match the
      roster. Remove anyone who left.
- [ ] `members` rows: `active` and `can_admin` are right for everyone. Everyone active can sign
      in, so take people who left off (`active = false`) and off project teams.
- [ ] Repository secrets: only the ones in the runbook; none unused. No agent workflow references
      `RESEND_API_KEY` (the test also checks).
- [ ] Anthropic / Jira / Resend / Vercel Blob / Neon keys: rotate on the runbook schedule; revoke unused.
- [ ] The Postgres backup ran, and a restore was tested this quarter.
- [ ] Outbox: no row stuck `approved` with `sent_at` set and no provider id.
- [ ] No secret, record text or account detail has landed in this public repo (`git log -p`
      spot-check; `.env` and `records` still gitignored).
- [ ] `novawerk-private` is still a private Blob store, and only the API project holds its token.
- [ ] `#info-inbox` in Slack is private, and its members are Members. Only `novawerk-api` holds
      `RESEND_RECEIVING_API_KEY` (full access) and the Slack webhook URL.

## If a secret leaks

Follow the runbook's "Rotate a secret": generate the new value, update the GitHub secret (and
Vercel/`.env`), run one agent to confirm, then revoke the old value. Check the Actions run logs
and the provider's audit log for use you don't recognise. For a Blob token, also check the store's
access logs.
