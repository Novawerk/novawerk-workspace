# @nw/web — novawerk.io

The public site: `/` (portfolio), `/about`, and the forms `/submit` and `/join`.
Next.js 16 App Router with Cache Components, Tailwind v4.

```bash
cp .env.example .env.local   # optional: without it the site runs on fallbacks
pnpm --filter @nw/web dev    # http://localhost:3000
pnpm --filter @nw/web build && pnpm --filter @nw/web start
```

- **Portfolio** — `lib/projects.ts` fetches `GET ${API_URL}/public/projects` inside `"use cache"`,
  tagged `projects`. The API calls `POST /api/revalidate` (header `x-revalidate-secret`) after a
  change. No `API_URL`, or the API fails → the two projects in `lib/fallback-projects.ts`.
- **About copy** — `lib/knowledge.ts` reads `knowledge/` at the repo root (mission, principles,
  four steps). Edit the Markdown there, not here. A `summary` frontmatter field wins
  over the derived text.
- **Submit / Join** — a full-page Intake Agent (`components/intake/`, `lib/intake/`). The chat
  streams from `POST ${NEXT_PUBLIC_API_URL}/public/intake/sessions/:id/messages` (SSE read with
  `fetch`, not EventSource); the draft panel shows the agent's `draft` events live, saves the
  visitor's own edits with a debounced `PATCH …/draft`, and enables Send once the shared
  `intakeDraftIssues` check passes and consent is ticked. The session
  id lives in localStorage (`nw:intake:pitch`, `nw:intake:join`), so a reload resumes the chat.
- **Plain forms** — "Prefer a plain form?", or a 503 from the API, swaps in the step-by-step
  wizards (`app/submit/submission-wizard.tsx`, `app/join/application-wizard.tsx`), seeded with
  what the chat collected. react-hook-form + the `@nw/contracts` schemas, posting to
  `${NEXT_PUBLIC_API_URL}/public/*`. API `issues` land on the matching fields.
- **Design tokens** — `app/globals.css` (`@theme`). White, near-black, grey, one green.

## Working on the Intake Agent without the API

`scripts/mock-intake-api.mjs` is a dev-only stand-in for the intake routes: canned replies,
in-memory sessions, streamed `text_delta` / `tool_call` / `tool_result` / `draft` events.

```bash
node apps/web/scripts/mock-intake-api.mjs        # http://localhost:8799 (PORT=… to change)
NEXT_PUBLIC_API_URL=http://localhost:8799 pnpm --filter @nw/web exec next dev --port 3002
```

In the chat, `fill` completes the draft, `/slow` gives you time to press Stop, `/error` and
`/drop` break the turn. `GET /__mock/unavailable?on=1` makes every route answer 503 (the
plain-form fallback); `?on=0` undoes it. An email containing `taken` makes Send fail with a
field issue. The real backend works too: `LLM_PROVIDER=mock pnpm --filter @nw/api dev`
(needs `DATABASE_URL`).
