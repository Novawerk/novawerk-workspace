# Analytics — visit counts and metrics

How we count what visitors do on novawerk.io, and what the admin panel's **Metrics** page
shows. Companion docs: [`architecture.md`](architecture.md), [`infra.md`](infra.md).
The privacy notice explains it to visitors: `knowledge/legal/privacy.md`, "How we count visits".

## The rules

- **No cookies, nothing stored in the browser.** A visit is a random id made per page load
  (`window.__nwAnalytics`, in memory). We can't recognise a returning visitor, on purpose.
- **No IP, no user agent, no city, no free text.** The API keeps the event name, the path,
  enum-like props, the external referrer's host, `mobile`/`desktop`, country and region.
- **First party.** Events go to our API (`POST /public/events`) and into Postgres
  (`analytics_events`). No analytics company sees them.
- **Paths, never query strings.** The newsletter pages carry tokens in the address
  (`/newsletter/unsubscribe?token=…`); a page view keeps only `/newsletter/unsubscribe`. A
  newsletter signup counts as `form_submitted` / `form_received` with no address in it.
- **Do Not Track / Global Privacy Control** → we don't count that browser at all.
- **13 months**, then `GET /cron/analytics-cleanup` (Vercel Cron, daily) deletes them.

A new event that needs anything outside these rules needs a privacy-notice change first.

## How it flows

```
browser                                   apps/api                         Postgres
lib/analytics.ts track() ─ batch, 3 s ─▶ POST /public/events ─ validate ─▶ analytics_events
instrumentation-client.ts                 (webEventsInput, Origin,          source = web
  first page view, navigations, clicks    bots, rate limit, geo headers)
                                          intake chat / forms routes ────▶ source = api
                                          recordServerEvent()
admin panel /metrics ◀─────────────────── GET /admin/metrics (loadMetrics)
```

- `apps/web/lib/analytics.ts` — `track(name, props)`, `trackClick()` for links in Server
  Components, the batching and the `keepalive` flush when the page hides. It imports only types
  from `@nw/contracts`, so zod stays out of the first download.
- `apps/web/instrumentation-client.ts` — the first page view (with referrer and utm tags), every
  client navigation (`onRouterTransitionStart`) and the click listener for `trackClick()`.
- `apps/api/src/analytics/` — `ingest.ts` (the public route), `record.ts` (server events),
  `metrics.ts` (the numbers), `cleanup.ts`.
- Country and region come from Vercel's `x-vercel-ip-country` and `x-vercel-ip-country-region`
  headers. Locally they're missing, so local visits count as "couldn't place".

## Browser events (`source = web`)

The schema is `webEventInput` in `@nw/contracts`; the API stores nothing else.

| Event | Props | When |
|-------|-------|------|
| `page_view` | `utmSource`, `utmMedium`, `utmCampaign` (first view only) | page load and each client navigation |
| `cta_click` | `target` submit/contribute/tasks/agent (join: old events), `placement` header/hero/get-involved/footer/contribute | a call to action: "Pitch a project", "Contribute", "Find a task", "Set up your agent" |
| `project_click` | `project` (slug) | a portfolio card's outbound link |
| `intake_open` | `mode`, `resumed` | the chat loaded (new or resumed) |
| `intake_unavailable` | `mode` | the assistant is off, the plain form shows |
| `intake_message` | `mode`, `turn`, `suggestion` | the visitor sent a message (`suggestion`: a starter chip) |
| `intake_reply_failed` | `mode`, `reason` network/busy/limit/gone/unavailable/error | a reply didn't arrive |
| `intake_stop` | `mode` | the visitor pressed Stop |
| `intake_field_edit` | `mode`, `field` (key only) | first edit of a draft field in the panel |
| `intake_tab` | `mode`, `tab` chat/draft | tab switch on phones |
| `intake_draft_ready` | `mode`, `turns` | every required field is filled (once per chat) |
| `intake_submitted` | `mode`, `turns` | Send went through |
| `intake_submit_failed` | `mode`, `reason` invalid/error | Send didn't go through |
| `intake_start_over` | `mode`, `turns` | Start over |
| `intake_close` | `mode`, `turns`, `filled`, `required`, `submitted` | the dialog closed, the route hid, or the tab went away |
| `form_step` | `form` pitch/join, `step`, `of` | a plain-form step is shown |
| `form_submitted` | `form` pitch/join/newsletter | a plain form or the newsletter went through |
| `form_failed` | `form`, `reason` invalid/unavailable | it didn't |
| `task_view` | `status` | a task page opened (no task id) |
| `task_filter` | `filter` search/area/size/status/skills/sort/view | a board control changed (which one, never its value) |
| `propose_open` | `edit`, `signedIn` | "Propose a plan" or "Edit proposal" pressed |
| `propose_sent` | `edit` | a proposal sent, edited or confirmed from an agent's draft |
| `propose_failed` | `reason` invalid/limit/unavailable | it didn't go through |
| `proposal_withdrawn` | — | a pending proposal withdrawn |
| `post_sent` | `reply` | a post or reply in a task thread |
| `vote` | `on` | a +1 given (`on: true`) or taken back |
| `suggestion_sent` | `kind` improvement/bug | a task suggested |
| `sign_in_open` | `placement` page/dialog | the sign-in page or dialog shown |
| `sign_in_start` | `method` github/email | "Continue with GitHub" or "Send code" pressed |
| `sign_in_done` | `method`, `firstRun` | an email sign-in finished (GitHub returns through the API) |
| `profile_saved` | — | the profile editor saved |
| `account_deleted` | — | a contributor deleted their account |

## Server events (`source = api`)

No visit id, no path: these only count.

| Event | Props | Written by |
|-------|-------|------------|
| `intake_session_created` | `mode` | `POST /public/intake/sessions` |
| `agent_turn` | `agent` intake/admin-assistant, `mode`, `turn`, `steps`, `ms`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `error` (code), `aborted` | every chat message, after the reply |
| `form_received` | `form` pitch/join/newsletter, `via` form/chat, `turns` | every stored pitch, application or signup |

## The Metrics page

`GET /admin/metrics?days=7|30|90` → `AdminMetrics` (field docs in `@nw/contracts`). Days are
calendar days in Europe/Berlin, today included.

- **Traffic** — visits (distinct page loads) and page views per day; top pages, referrers,
  campaigns, countries, regions; phone vs computer; CTA and project clicks.
- **Intake funnel** (browser) — per mode, page loads that opened the chat → sent a message →
  had a complete draft → sent it. **Where people left**: each page load's last `intake_close`
  that wasn't sent, as "before the first message", "while drafting", "with the draft ready".
- **Chats** (server) — started, with at least one message, sent, messages per sent chat. Ad
  blockers can hide browser events, never these, so the server numbers are the truth and the
  browser funnel shows the shape.
- **Agents** — turns, errors, p50/p95 reply time (errors and aborted turns excluded), tokens.
- **Received** — new pitches, applications and signups from their own tables, and how many
  came through the chat.
- **Inbox now** — status counts, the oldest unreviewed item, pending outbox emails.

## Adding an event

1. Add it to `webEventInput` in `packages/contracts/src/index.ts` (enum-like props only).
2. Call `track("name", props)` where it happens (or `trackClick()` on a link).
3. Use it in `apps/api/src/analytics/metrics.ts` and `AdminMetrics` if the page should show it.
4. Add it to the tables above. If it records something new about a person, change the
   privacy notice first.

Try it locally: the API stores events in your Docker database, or
`node apps/web/scripts/mock-intake-api.mjs` prints each event it receives.
