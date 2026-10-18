# Contributing to Novawerk

**Languages:** English | [简体中文](CONTRIBUTING.zh-CN.md)

Thanks for helping. This repo is the software Novawerk runs on: the website, the admin panel,
the API and the agents. You can help build it, one task at a time.

## What contributing means here

- **You pick a task, we review your pull request.** That's the whole deal.
- **Everyone is a member.** Signing in on novawerk.io makes your Novawerk account: one account
  for the task board, the team chat, and the admin panel once you are on a project's team. There
  are no tiers or ranks.
- **Maintainers run Novawerk.** They write tasks, pick a plan for each one, approve CI runs,
  review and merge pull requests, and keep the board tidy. Being a maintainer is a role, not a
  rank.
- **We don't mentor whole projects.** We don't have the people for it. We write tasks small
  enough to finish on your own, and we answer questions on the task.
- **Merged work earns Werk.** Werk is recognition: it shows on your profile and the contributor
  wall. It is never money, and it is never rank.

## The task board

Tasks live at [novawerk.io/tasks](https://novawerk.io/tasks). Please don't open pull requests
for code that has no task. Found a bug or have an idea? Suggest it on the board
([novawerk.io/tasks/suggest](https://novawerk.io/tasks/suggest)); a maintainer turns it into a
task.

Know exactly what you want to build? Create the task yourself, with an agent and your token
(MCP `create_task`, see [AGENTS.md](AGENTS.md)). Give it a title, what and why, the "done when"
lines and a size:

- **S** (an hour or two): it's yours at once. Open your pull request.
- **M**: it opens on the board, and people can discuss it. Propose your plan on it like anyone
  else; a maintainer picks one.
- **L** and **XL**: a maintainer reviews it first, in the suggestions queue.

Up to 10 new tasks a day. Changes to docs, posts and videos, and typo fixes, don't need a task:
write `Task: none` and why.

## How it works

1. **Pick a task** at novawerk.io/tasks. Anyone can browse; no account needed.
2. **Propose a plan.** Sign in at [novawerk.io/sign-in](https://novawerk.io/sign-in) with
   GitHub or a code we email you (Google too, once we switch it on), and say how you'd do it
   and when. Proposing needs GitHub linked (Settings → Link GitHub), so we can match your pull
   request to the task. Several people may propose. A maintainer picks one plan, assigns the task and sends you the
   task's guide. An **S** task needs no maintainer: the first plan from someone who can take a
   task now gets it at once, and the guide opens on the task.
3. **Fork this repo** and work on a branch in your fork.
4. **Open a pull request** against `main`. Its body has the line `Task: NW-<n>` (the template
   has it). Our GitHub App links the pull request to the task only if you are the assignee.
5. **We review.** A maintainer approves the CI run first (fork pull requests don't run CI until
   then), then reviews the code. Every merge needs a maintainer's review.
6. **Merged → done.** The task closes and you earn its Werk.

No time after all? Release the task from the board. It goes back to Open and nothing counts
against you. A task with no activity for 14 days is released on its own; we remind you at 7.

## The team chat

[chat.novawerk.io](https://chat.novawerk.io) is where members talk: say hello, ask how something
works, share what you're building. Open it from **Team chat** in the site's header. It signs you
in with your Novawerk account, so there's no second password, and it shows your name, @handle and
picture from your profile (edit them on novawerk.io). It needs an email address on your account;
a GitHub-only account can add one in Settings.

- **#All Talk** is for everyone, and everyone is in it.
- **Questions about a task go on the task**, in its discussion, so the answer stays with the task
  for whoever picks it up next. Use the chat for everything else.
- **On your phone**, open the chat in the browser and add it to your home screen. It then works
  like an app and can notify you; choose per room what you hear about with the bell.
- **Never post secrets** (keys, tokens, passwords) or anything private about other people. Rooms
  are shared, and messages stay.

## Local setup

You need Node 22+, pnpm 10 and Docker (or OrbStack) for the local Postgres.

```bash
nvm use                 # Node 22, from .nvmrc
corepack enable         # pnpm 10, from package.json
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

In `apps/api/.env` set these (everything else can stay empty):

```bash
DATABASE_URL=postgres://novawerk:novawerk@localhost:5432/novawerk
GOOGLE_CLIENT_ID=local                    # any placeholder
SESSION_SECRET=<32+ random characters>    # openssl rand -base64 48
DEV_LOGIN=true
LLM_PROVIDER=mock                         # the chats and the post writer answer from a script, no key
WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate
WEB_REVALIDATE_SECRET=change-me           # the REVALIDATE_SECRET in apps/web/.env.local
```

and `VITE_DEV_LOGIN=true` in `apps/admin/.env.local`. Then:

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed:dev
pnpm dev                # web on :3000, admin on :5173, api on :8787
```

You don't need any real keys for most tasks.

### Signing in locally

- **On the site** (localhost:3000): sign in with any email. Without a Resend key the code is
  printed in the API's log (`sign-in code for you@example.com: 123456`).
- **With GitHub**: "Continue with GitHub" (or Settings → Link GitHub) opens a local page instead
  of github.com. Type any GitHub login: the same login is always the same account. Proposing on a
  task and taking an S task need GitHub linked, so this is how you test them. `lena-k` is the
  seeded contributor who holds tasks.
- **In the admin** (localhost:5173): use the local dev sign-in with a seeded account:
  `maintainer@example.com` is a maintainer (accepts suggestions, assigns tasks), `mara@example.com`
  a member. Set `VITE_DEV_LOGIN_EMAIL` to fill it in. The site and the admin share one session,
  so sign out of one account before you sign in as another.

### Uploads

With `DEV_LOGIN=true` and no `BLOB_*` token, every upload (suggestion screenshots, CVs, project
pictures, documents and project files) goes to `.local-files/` in the repo instead of Vercel
Blob. You don't need a Vercel account. Public files are served by the API at
`http://localhost:8787/dev/files/…`; private ones sit in `.local-files/_private/`, and the API
streams them only to whoever may open them, as in production. Delete the folder to start over.
Never put production's Blob tokens in your `.env`.

### Pull requests and the task board

Without our GitHub App's keys the API simulates GitHub at
[localhost:8787/dev/github](http://localhost:8787/dev/github). Open a pull request there as the
GitHub login you linked, with `Task: NW-<n>` in the body: the board links it and the task goes to
review, as with a real PR. Merge it there and the task is done. "Link a PR by hand" on a task
finds the PRs opened there too. They live in memory until the API restarts.

### Seeing your changes on the site

The site caches projects and tasks (Next.js Cache Components). The `WEB_REVALIDATE_*` lines
above let the API refresh it after a change; without them a change in the admin shows only
after a while.

### What stays off locally

The team chat (chat.novawerk.io is a separate app), Google sign-in (needs our OAuth client), and
the agents that run from GitHub Actions in the private repo (`pnpm agent <id> --dry-run` works).

### Working with an agent

Using Claude Code or another coding agent? It reads [AGENTS.md](AGENTS.md). In Claude Code the
`nw-contribute` skill walks it through this setup, connecting the task board (MCP) and finding
or creating your task.

## Before you open a pull request

```bash
pnpm typecheck && pnpm test && pnpm lint
```

All three must pass. CI runs the same checks. For UI changes, add screenshots (light and dark,
desktop and phone) to the pull request.

## Conventions

- **Read [CLAUDE.md](CLAUDE.md).** It has the full rules. Most matter only for certain tasks.
- **Squash merge.** One pull request becomes one commit on `main`, so its title becomes the
  commit message. Write it like the log: `Area: what changed`, in plain words. For example:
  `Agents: accept the private repo's workflows under ops/`.
- **Validate input at both ends.** Form and API inputs use the zod schemas in
  `packages/contracts`, in the browser and in the API.
- **Schema changes:** edit `packages/db/src/schema.ts`, run `pnpm db:generate`, commit the
  migration. Never edit files in `packages/db/migrations/` by hand.
- **Env:** in shared packages only `packages/config` reads `process.env`. Apps read their env
  at the edge and pass values in.
- **Outbound email** to anyone outside Novawerk goes through the outbox and waits for a
  maintainer. Don't add a path around it.
- **Plain language** in copy and docs: short sentences, "we", present tense. No _leverage /
  ecosystem / stakeholders / synergy / disrupt / transform_.
- **Next.js 16** has breaking changes. Read `apps/web/node_modules/next/dist/docs/` before you
  write Next code.

## Sign off your commits (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/). There is no
CLA. Signing off says you wrote the change, or have the right to submit it, under the repo's
MIT licence.

```bash
git commit -s -m "Web: fix the footer link"
```

This adds `Signed-off-by: Your Name <you@example.com>` to the message. It must match the
commit's author. A check on every pull request reads the commit messages and fails if a
sign-off is missing. Forgot? `git rebase --signoff main`, then `git push --force-with-lease`.

## What we review for

- **It does what the task says**, and its "done when" holds.
- **It follows the rules** in CLAUDE.md: contracts at both ends, schema through migrations,
  the outbox gate, env read in one place.
- **It is small and clear.** No unrelated changes. Names and comments read like the code
  around them.
- **It is tested** where the code has tests, and the checks pass.
- **It is safe:** no secrets, no personal data in logs or analytics events, no new
  dependencies without a reason in the pull request.
- **Copy fits the voice.**

We may ask for changes. That's normal. If we can't merge it, we say why.

## What never goes in this repo

- **Secrets.** Keys and tokens live in Vercel and GitHub Actions secrets, or your local `.env`
  (ignored).
- **Records and account details.** Minutes, decisions, finance and partner notes live in a
  private repo. `records/` is gitignored here.
- **Workflows that run fork code with secrets.** Never use `pull_request_target`.

## Security

Found a vulnerability? Don't open an issue, a task or a pull request. Email
**security@novawerk.io**. See [SECURITY.md](SECURITY.md).

## Using a coding agent?

Point it at [AGENTS.md](AGENTS.md). You are still the author: you review what it writes, and
you sign off the commits.
