---
name: nw-pull-request
description: Open a pull request in Novawerk/novawerk-workspace the way the board expects. Every PR that changes code has a task on novawerk.io/tasks first, so find the task, or create one (S is yours at once, M opens for discussion, L and XL wait for review), then put `Task: NW-<n>` in the PR body, sign off every commit and fill in the template. Use before opening or preparing any pull request here, when asked to "open a PR", "ship this" or "send it for review", or when unsure which task a change belongs to.
---

# Opening a pull request

The task board is how Novawerk sees what is being worked on and who earns Werk for it. Our
GitHub App links a pull request to a task when its body says `Task: NW-<n>` and its author holds
that task. So the task comes first, the pull request second.

## 1. Does this PR need a task?

Yes, when it changes code: anything under `apps/`, `packages/`, `agents/`, `scripts/` or
`.github/`.

No, when it only touches `docs/`, `posts/`, `videos/`, `tasks/` or `knowledge/`, or fixes a
typo. Then the body says `Task: none (<why>)`, e.g. `Task: none (a cover for Klarpost)`.

## 2. Find the task

Look on the board before you make a new one:

- MCP (`https://api.novawerk.io/mcp`): `list_tasks` with `q` and `area`, then `get_task`.
  `my_tasks` lists what the person holds.
- Without MCP: `GET https://api.novawerk.io/public/tasks?q=<words>` and
  `GET https://api.novawerk.io/public/tasks/NW-<n>`.

Use it if it fits the change and the person holds it (status `assigned`, they are the
assignee). If it is open, propose a plan on it (`propose`) and wait: that's the normal flow
(CONTRIBUTING.md). If someone else holds it, stop and tell the person.

## 3. No task? Create one

MCP `create_task` (token scope `tasks:work`), or `POST /contrib/tasks` with the same fields:
`title`, `body` (what and why, 20+ characters), `criteria` (one or more "done when" lines a
reviewer can check), `area`, `size`, optional `summary` and `skills`. It is public: no secrets,
no names of people outside Novawerk, nothing from `records/`. Pick the size honestly; it sets
the Werk (S 1, M 3, L 8, XL 20) and what happens next:

| Size | What happens | Then |
|------|--------------|------|
| **S** (an hour or two, one small change) | yours at once (`assigned`) | open the PR |
| **M** | open on the board, no review | propose a plan; start when a maintainer chooses it |
| **L**, **XL** | waits for a maintainer's review (the suggestions queue) | don't start until it's accepted |

The answer has the id (`NW-<n>`), the status and a `next` line: follow it. Up to 3 new tasks a
day per person; an S task needs GitHub linked. Don't make a task bigger or smaller to get around
a step; split real work into S tasks instead when it can be split.

No token? The person makes one at novawerk.io/settings/tokens and adds the server once, in
their own terminal (never paste the token into the chat; the `nw-contribute` skill has the
steps):

```bash
claude mcp add --scope user --transport http novawerk https://api.novawerk.io/mcp --header "Authorization: Bearer $(pbpaste)"
```

## 4. Open the pull request

- Branch: in the contributor's fork, or a `claude/<topic>` branch for maintainers.
- `pnpm typecheck && pnpm test && pnpm lint` pass.
- Every commit signed off: `git commit -s`. The sign-off is the person's.
- Title like the log: `Area: what changed` (`Web: …`, `API: …`, `Board: …`, `Docs: …`).
- Body: `.github/pull_request_template.md`, first line `Task: NW-<n>`. UI changes need
  screenshots (light and dark, desktop and phone).

Once it's open the board moves the task to `in_review` by itself. If it doesn't (the body
had no task line), use MCP `link_pr`.
