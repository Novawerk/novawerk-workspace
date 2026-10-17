# AGENTS.md

A brief for coding agents working on a contributor's task in this repo. The full rules are in
[CLAUDE.md](CLAUDE.md); read it first. The human side is in [CONTRIBUTING.md](CONTRIBUTING.md).

## The job

- You work on one task from novawerk.io/tasks, assigned to the person you work for. No task
  for the change yet? Create one first (below, and the `nw-pull-request` skill).
- Do what the task says and no more. Keep the diff small. Match the code around it.
- The person reviews your work and opens the pull request. They are the author.

## Commands

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed:dev   # local Postgres (Docker)
pnpm dev                                            # web :3000, admin :5173, api :8787
pnpm typecheck && pnpm test && pnpm lint            # must pass before a pull request
pnpm db:generate                                    # after editing packages/db/src/schema.ts
pnpm --filter <package> test                        # one package
```

Node 22+, pnpm 10. One lockfile at the root. Tests that need Postgres use `@nw/db/testing`
(PGlite in memory); they need no Docker.

## Task and pull request conventions

- Branch in the contributor's fork. The pull request targets `main` in
  `Novawerk/novawerk-workspace`.
- The pull request body has the line `Task: NW-<n>`. Fill in the template. A PR that changes
  code always has a task; only docs, posts, videos and typo fixes may say `Task: none (<why>)`.
- No task yet: `create_task` (MCP) or `POST /contrib/tasks`. **S** is the person's at once:
  open the PR. **M** opens on the board for discussion: propose a plan and wait for a
  maintainer to choose it. **L** and **XL** wait for a maintainer's review: don't start yet.
- Title like the log: `Area: what changed` (`Web: …`, `API: …`, `Admin: …`, `Agents: …`,
  `Docs: …`). We squash merge, so the title becomes the commit.
- Every commit is signed off: `git commit -s`. The sign-off is the person's, not yours.
- UI changes need screenshots in the pull request.

## Rules you will hit most

- Validate inputs with the zod schemas in `packages/contracts`, in the browser and in the API.
- All tables live in `packages/db/src/schema.ts`. Change it, then run `pnpm db:generate`.
- In shared packages only `packages/config` reads `process.env`.
- Email to anyone outside Novawerk goes through the outbox (`queueEmail()`) and waits for a
  Member. Never send it directly.
- Never put what a visitor typed into an analytics event.
- Next.js 16: read `apps/web/node_modules/next/dist/docs/` before writing Next code.
- Copy: short sentences, "we", present tense. No *leverage / ecosystem / stakeholders /
  synergy / disrupt / transform*.

## Never

- Commit secrets, tokens or `.env` files. Don't print them in logs or tests.
- Add records, account ids, owners or addresses. `records/` is private and gitignored here.
- Edit files in `packages/db/migrations/` by hand.
- Use `pull_request_target`, or give a workflow secrets it runs fork code with.
- Weaken the outbox gate, an auth check or a test to make something pass.
- Report a security issue in an issue, task or pull request. Tell the person to email
  security@novawerk.io.

## Task board API and MCP

The MCP server is at `https://api.novawerk.io/mcp`; the person makes a token at
novawerk.io/settings/tokens. Reading needs no token. With one you can read the guide, draft a
proposal (the person confirms it on novawerk.io), create a task, link a pull request and post
on a task. Tools and rules: [apps/web/public/llms.txt](apps/web/public/llms.txt).
