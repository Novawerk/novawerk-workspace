---
name: nw-setup
description: Get a contributor going in Novawerk/novawerk-workspace. Set up the stack locally (env files, Postgres, seed, dev sign-in, uploads without Vercel, the site's cache), connect the task board's MCP server with the person's own token, then find or claim the task to work on. Use when someone says "help me contribute", "set this repo up", "how do I run it locally", "connect the task board / MCP", "how do I test uploads/screenshots locally", or starts work here without a running stack or a task.
---

# Setting up to contribute to Novawerk

Three things, in order: a running local stack, the task board connected, a task the person holds.
The human-facing version is CONTRIBUTING.md (#local-setup); AGENTS.md has the rules for the
work itself. Opening the PR is the `nw-pull-request` skill.

## 1. The local stack

Needs Node 22+, pnpm 10, Docker or OrbStack. Check with `node -v`, `pnpm -v`, `docker info`.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

Fill in `apps/api/.env`. These are local values, not secrets; write them yourself:

```bash
DATABASE_URL=postgres://novawerk:novawerk@localhost:5432/novawerk
GOOGLE_CLIENT_ID=local
SESSION_SECRET=<openssl rand -base64 48>
DEV_LOGIN=true
LLM_PROVIDER=mock
WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate
WEB_REVALIDATE_SECRET=change-me
```

`apps/admin/.env.local`: `VITE_DEV_LOGIN=true`, `VITE_DEV_LOGIN_EMAIL=maintainer@example.com`.
The web's `.env.example` works as it is.

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed:dev
pnpm dev     # web :3000, admin :5173, api :8787
```

`db:migrate` reads `DATABASE_URL` from `apps/api/.env`, so the env file comes first. Ports taken
by something else? Change `PORT` (API), `--port` (web, admin), then `ALLOWED_ORIGINS`,
`ADMIN_ORIGINS`, `PUBLIC_API_URL`, `PUBLIC_WEB_URL` and the apps' API URLs to match.

What works without any account:

- **Site sign-in**: any email; the code is in the API log (`sign-in code for …: 123456`).
- **Admin sign-in**: the dev form on /login. Seeded: `maintainer@example.com` (maintainer:
  triage, accept, assign), `mara@example.com` (member). One session for site and admin: sign
  out before switching accounts.
- **Uploads**: with `DEV_LOGIN` and no `BLOB_*` token they go to `.local-files/` (private ones
  in `.local-files/_private/`, never served). The API logs `Uploads go to …` at start. Never
  use production's Blob tokens or database locally.
- **GitHub**: "Continue with GitHub" and Link GitHub open a local page; type any login (the same
  login is always the same account). `lena-k` is the seeded contributor holding tasks. Pull
  requests: open, merge or close them at `http://localhost:8787/dev/github`; with
  `Task: NW-<n>` in the body they move the task like real ones.
- **The chats and the post writer**: `LLM_PROVIDER=mock` answers from a script.
- **Email**: printed in the API log without `RESEND_API_KEY`; an approved outbox email stays
  "Approved, not sent".
- **Crons**: set `CRON_SECRET` (16+ characters) and `curl -H "Authorization: Bearer …"
  localhost:8787/cron/<name>` (`github-sync` for reminders and releases, `contributor-notices`).
- **A local MCP**: a token from localhost:3000/settings/tokens and the server
  `http://localhost:8787/mcp`, under its own name (e.g. `novawerk-local`). Never point the
  person's real `novawerk` server at localhost.

Test whole flows, e.g.:

- A suggestion with a screenshot: sign in on the site, /tasks/suggest, attach a PNG, send; sign
  in to the admin as the maintainer, Suggestions → Accept. The task page shows the screenshot.
- Taking and finishing a task: sign in with GitHub (any login), propose on an open S task (it's
  yours at once), open a PR on /dev/github with `Task: NW-<n>`, merge it: the task is done.

`pnpm typecheck && pnpm test && pnpm lint` need no Docker (tests use PGlite).

## 2. The task board (MCP)

Reading the board needs nothing: `GET https://api.novawerk.io/public/tasks?q=…`, or the MCP's
`list_tasks` and `get_task`. Acting (create a task, propose, link a PR, post) needs the
person's own token.

The token is theirs. Never ask for it in chat, never type it, never print it. Have them:

1. Make a token at https://novawerk.io/settings/tokens (sign in with GitHub, so their pull
   requests match their tasks). Scopes: `tasks:read`, `proposals:write`, `discussion:write`,
   `tasks:work`; `suggestions:write` to suggest. Copy it.
2. Run this in their own terminal, not in the chat. It reads the clipboard (macOS `pbpaste`;
   paste the token in place of `$(pbpaste)` elsewhere) and works in every checkout:

   ```bash
   claude mcp add --scope user --transport http novawerk https://api.novawerk.io/mcp --header "Authorization: Bearer $(pbpaste)"
   ```

   It prints the header, token included: clear the terminal afterwards.
3. Start a new Claude Code session; a running one doesn't load new servers. Check with the
   `whoami` tool: it shows their handle and the token's scopes.

## 3. The task

- `my_tasks`: what they hold already. Work on an `assigned` task of theirs.
- Otherwise `list_tasks` (`q`, `area`), read it with `get_task`, and `propose` a plan. The
  proposal is a draft until they confirm it on novawerk.io: give them the `confirm_url`. An S
  task goes to the first plan from someone who can take it; M and bigger, a maintainer chooses.
- Their own idea: `create_task`. S is theirs at once; M opens for discussion; L and XL wait for
  review. Details and the size table: the `nw-pull-request` skill.

Then do the task (AGENTS.md), and open the pull request with `nw-pull-request`.
