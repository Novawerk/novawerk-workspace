// Usage analytics: what the browser may send (and what we keep of it), the events the API
// writes itself, the numbers on the Metrics page, and the 13-month cleanup.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockProvider } from "@nw/agent-harness";
import {
  analyticsEvents,
  memberApplications,
  members,
  outbox,
  projectSubmissions,
  type Database,
  type NewAnalyticsEvent,
} from "@nw/db";

import { ANALYTICS_RETENTION_MONTHS, deleteExpiredAnalyticsEvents } from "../src/analytics/cleanup.js";
import { externalHost } from "../src/analytics/ingest.js";
import { loadMetrics } from "../src/analytics/metrics.js";
import {
  TEST_MEMBERS,
  WEB_ORIGIN,
  adminFetch,
  adminJson,
  createTestDb,
  makeApp,
  postJson,
  resetDb,
  validApplication,
  validSubmission,
} from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});

const VISIT = "6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

const events = () => db.select().from(analyticsEvents).orderBy(analyticsEvents.id);

// ─── POST /public/events ─────────────────────────────────────────────────────

describe("POST /public/events", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    makeApp(db).app.request("/public/events", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: WEB_ORIGIN, "User-Agent": FIREFOX, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("stores a batch sent as text/plain: name, path, props, visit, device, referrer host", async () => {
    const res = await post(
      {
        visit: VISIT,
        events: [
          {
            name: "page_view",
            path: "/",
            referrer: "https://www.linkedin.com/feed/?trk=abc",
            props: { utmSource: "LinkedIn", utmCampaign: "launch-2026" },
          },
          { name: "cta_click", path: "/", props: { target: "submit", placement: "hero" } },
          { name: "intake_open", path: "/submit", props: { mode: "pitch", resumed: false } },
        ],
      },
      { "User-Agent": IPHONE },
    );
    expect(res.status).toBe(204);

    const rows = await events();
    expect(rows.map((r) => r.name)).toEqual(["page_view", "cta_click", "intake_open"]);
    expect(rows[0]).toMatchObject({
      source: "web",
      visitId: VISIT,
      path: "/",
      referrer: "linkedin.com",
      device: "mobile",
      props: { utmSource: "linkedin", utmCampaign: "launch-2026" },
    });
    expect(rows[1]).toMatchObject({ referrer: null, props: { target: "submit", placement: "hero" } });
    expect(rows[2]).toMatchObject({ path: "/submit", props: { mode: "pitch", resumed: false } });
  });

  it("keeps country and region from Vercel's geolocation, never the city", async () => {
    await post(
      { visit: VISIT, events: [{ name: "page_view", path: "/", props: {} }] },
      { "X-Vercel-IP-Country": "DE", "X-Vercel-IP-Country-Region": "BE", "X-Vercel-IP-City": "Berlin" },
    );
    await post({ visit: VISIT, events: [{ name: "page_view", path: "/about", props: {} }] }, { "X-Vercel-IP-Country": "nl" });
    await post({ visit: VISIT, events: [{ name: "page_view", path: "/join", props: {} }] }, { "X-Vercel-IP-Country": "<script>" });
    const rows = await events();
    expect(rows.map((r) => [r.country, r.region])).toEqual([
      ["DE", "DE-BE"],
      ["NL", null],
      [null, null],
    ]);
    expect(JSON.stringify(rows)).not.toContain("Berlin");
  });

  it("reads mobile or desktop from Client Hints first", async () => {
    await post(
      { visit: VISIT, events: [{ name: "page_view", path: "/about", props: {} }] },
      { "User-Agent": IPHONE, "Sec-CH-UA-Mobile": "?0" },
    );
    expect((await events())[0]?.device).toBe("desktop");
  });

  it("only takes events from our own pages", async () => {
    const batch = { visit: VISIT, events: [{ name: "page_view", path: "/", props: {} }] };
    expect((await post(batch, { Origin: "https://evil.example" })).status).toBe(403);
    const noOrigin = await makeApp(db).app.request("/public/events", postJson(batch, { "User-Agent": FIREFOX }));
    expect(noOrigin.status).toBe(403);
    expect(await events()).toEqual([]);
  });

  it("drops bots quietly", async () => {
    const batch = { visit: VISIT, events: [{ name: "page_view", path: "/", props: {} }] };
    expect((await post(batch, { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" })).status).toBe(204);
    expect((await post(batch, { "User-Agent": "" })).status).toBe(204);
    expect(await events()).toEqual([]);
  });

  it("rejects anything outside the catalog: unknown events, free text, queries in paths", async () => {
    const one = (event: unknown) => post({ visit: VISIT, events: [event] });
    expect((await one({ name: "keystroke", path: "/", props: {} })).status).toBe(400);
    expect((await one({ name: "intake_message", path: "/submit", props: { mode: "pitch", turn: 1, suggestion: false, text: "my idea" } })).status).toBe(400);
    expect((await one({ name: "page_view", path: "/?email=ada@example.com", props: {} })).status).toBe(400);
    expect((await one({ name: "cta_click", path: "/", props: { target: "donate", placement: "hero" } })).status).toBe(400);
    expect((await post({ visit: "not-a-uuid", events: [{ name: "page_view", path: "/", props: {} }] })).status).toBe(400);
    expect((await post({ visit: VISIT, events: [] })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
    expect(await events()).toEqual([]);
  });

  it("keeps only an external referrer's host", () => {
    const own = new Set(["novawerk.io", "www.novawerk.io", "localhost"]);
    expect(externalHost("https://news.ycombinator.com/item?id=1", own)).toBe("news.ycombinator.com");
    expect(externalHost("https://www.novawerk.io/about", own)).toBeNull();
    expect(externalHost("http://localhost:3000/", own)).toBeNull();
    expect(externalHost("android-app://com.google.android.gm/", own)).toBeNull();
    expect(externalHost("", own)).toBeNull();
    expect(externalHost(undefined, own)).toBeNull();
  });
});

// ─── Events the API writes itself ────────────────────────────────────────────

describe("server events", () => {
  it("counts plain-form pitches, applications and newsletter signups", async () => {
    const { app } = makeApp(db, { sendNewsletterConfirmation: async () => undefined });
    expect((await app.request("/public/submissions", postJson(validSubmission))).status).toBe(201);
    expect((await app.request("/public/applications", postJson(validApplication))).status).toBe(201);
    expect((await app.request("/public/subscribe", postJson({ email: "ada@example.com" }))).status).toBe(200);

    const rows = await events();
    expect(rows.map((r) => [r.name, r.source, r.props])).toEqual([
      ["form_received", "api", { form: "pitch", via: "form", turns: null }],
      ["form_received", "api", { form: "join", via: "form", turns: null }],
      ["form_received", "api", { form: "newsletter", via: "form", turns: null }],
    ]);
    // Nothing that identifies the sender.
    expect(rows.every((r) => r.visitId === null && r.path === null && r.device === null)).toBe(true);
  });

  it("follows an intake chat: started, each turn with tokens and timing, sent", async () => {
    const provider = new MockProvider([() => ({ text: "Tell me more.", toolCalls: [] })]);
    const { app } = makeApp(db, { intakeChat: { provider } });
    const headers = { "Content-Type": "application/json" };

    const start = await app.request("/public/intake/sessions", { method: "POST", headers, body: JSON.stringify({ mode: "pitch" }) });
    const { id } = (await start.json()) as { id: string };
    const turn = await app.request(`/public/intake/sessions/${id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: "A map of bouldering routes" }),
    });
    await turn.text();
    const { consent: _, ...pitch } = validSubmission;
    await app.request(`/public/intake/sessions/${id}/draft`, { method: "PATCH", headers, body: JSON.stringify({ pitch }) });
    const sent = await app.request(`/public/intake/sessions/${id}/submit`, { method: "POST", headers, body: JSON.stringify({ consent: true }) });
    expect(sent.status).toBe(201);

    const rows = await events();
    expect(rows.map((r) => r.name)).toEqual(["intake_session_created", "agent_turn", "form_received"]);
    expect(rows[0]!.props).toEqual({ mode: "pitch" });
    expect(rows[1]!.props).toMatchObject({ agent: "intake", mode: "pitch", turn: 1, steps: 1, error: null, aborted: false });
    expect(rows[1]!.props.inputTokens).toBeGreaterThan(0);
    expect(rows[1]!.props.outputTokens).toBeGreaterThan(0);
    expect(rows[2]!.props).toEqual({ form: "pitch", via: "chat", turns: 1 });
    // The visitor's words never reach the events.
    expect(JSON.stringify(rows)).not.toContain("bouldering");
  });

  it("records a failed turn with its error code", async () => {
    const provider = new MockProvider([
      () => {
        throw new Error("upstream 500");
      },
    ]);
    const { app } = makeApp(db, { intakeChat: { provider } });
    const headers = { "Content-Type": "application/json" };
    const { id } = (await (
      await app.request("/public/intake/sessions", { method: "POST", headers, body: JSON.stringify({ mode: "join" }) })
    ).json()) as { id: string };
    await (await app.request(`/public/intake/sessions/${id}/messages`, { method: "POST", headers, body: JSON.stringify({ text: "hi" }) })).text();

    const [, turn] = await events();
    expect(turn!.props).toMatchObject({ agent: "intake", mode: "join", turn: 1, error: "model_error" });
  });
});

// ─── GET /admin/metrics ──────────────────────────────────────────────────────

const NOW = new Date("2026-10-20T10:00:00Z"); // 12:00 in Berlin
const at = (iso: string) => new Date(iso);

async function seed(rows: (Partial<NewAnalyticsEvent> & { name: string })[]) {
  await db.insert(analyticsEvents).values(rows.map((r) => ({ source: "web", props: {}, ...r })));
}

type EventProps = NonNullable<NewAnalyticsEvent["props"]>;

const visit = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("loadMetrics", () => {
  it("counts traffic per Berlin day, zero-fills the range and ranks pages, referrers and campaigns", async () => {
    await seed([
      // 22:30 UTC on the 19th is 00:30 on the 20th in Berlin.
      { name: "page_view", visitId: visit(1), path: "/", referrer: "github.com", device: "desktop", country: "DE", region: "DE-BE", createdAt: at("2026-10-19T22:30:00Z") },
      { name: "page_view", visitId: visit(1), path: "/submit", device: "desktop", country: "DE", region: "DE-BE", createdAt: at("2026-10-19T22:31:00Z") },
      { name: "page_view", visitId: visit(2), path: "/", referrer: "github.com", device: "mobile", country: "DE", region: "DE-BY", props: { utmSource: "newsletter" }, createdAt: at("2026-10-18T09:00:00Z") },
      { name: "page_view", visitId: visit(3), path: "/about", device: "mobile", createdAt: at("2026-10-14T09:00:00Z") },
      // Outside a 7-day range (the 14th is its first day).
      { name: "page_view", visitId: visit(4), path: "/", device: "mobile", createdAt: at("2026-10-13T21:59:00Z") },
      { name: "cta_click", visitId: visit(1), path: "/", props: { target: "submit", placement: "hero" }, createdAt: at("2026-10-19T22:30:30Z") },
      { name: "project_click", visitId: visit(2), path: "/", props: { project: "food-map" }, createdAt: at("2026-10-18T09:01:00Z") },
    ]);

    const m = await loadMetrics(db, 7, NOW);
    expect(m.range).toEqual({ days: 7, from: "2026-10-14", to: "2026-10-20" });
    expect(m.traffic).toMatchObject({ visits: 3, pageViews: 4 });
    expect(m.traffic.daily).toHaveLength(7);
    expect(m.traffic.daily[0]).toEqual({ date: "2026-10-14", visits: 1, pageViews: 1 });
    expect(m.traffic.daily[6]).toEqual({ date: "2026-10-20", visits: 1, pageViews: 2 });
    expect(m.traffic.daily[5]).toEqual({ date: "2026-10-19", visits: 0, pageViews: 0 });
    expect(m.traffic.topPages).toEqual([
      { path: "/", views: 2 },
      { path: "/about", views: 1 },
      { path: "/submit", views: 1 },
    ]);
    expect(m.traffic.topReferrers).toEqual([{ host: "github.com", visits: 2 }]);
    expect(m.traffic.topCampaigns).toEqual([{ source: "newsletter", visits: 1 }]);
    expect(m.traffic.topCountries).toEqual([{ country: "DE", visits: 2 }]);
    expect(m.traffic.topRegions).toEqual([
      { region: "DE-BE", visits: 1 },
      { region: "DE-BY", visits: 1 },
    ]);
    expect(m.traffic.unknownLocation).toBe(1);
    expect(m.traffic.devices).toEqual({ mobile: 2, desktop: 1 });
    expect(m.traffic.ctaClicks).toEqual([{ target: "submit", placement: "hero", clicks: 1 }]);
    expect(m.traffic.projectClicks).toEqual([{ project: "food-map", clicks: 1 }]);
  });

  it("builds the intake funnel per page load and finds where people left", async () => {
    const t = at("2026-10-20T08:00:00Z");
    const ev = (n: number, name: string, props: EventProps) => ({ name, visitId: visit(n), path: "/submit", props, createdAt: t });
    const close = (n: number, turns: number, filled: number, submitted = false, minutes = 0) => ({
      ...ev(n, "intake_close", { mode: "pitch", turns, filled, required: 8, submitted }),
      createdAt: new Date(t.getTime() + minutes * 60_000),
    });
    await seed([
      // 1: opened, left at once. 2: chatted, left half done. 3: draft ready, didn't send.
      // 4: sent. 5: opened twice: first left empty, then came back and chatted.
      ev(1, "intake_open", { mode: "pitch", resumed: false }),
      close(1, 0, 0),
      ev(2, "intake_open", { mode: "pitch", resumed: false }),
      ev(2, "intake_message", { mode: "pitch", turn: 1, suggestion: true }),
      ev(2, "intake_message", { mode: "pitch", turn: 2, suggestion: false }),
      close(2, 2, 3),
      ev(3, "intake_open", { mode: "pitch", resumed: true }),
      ev(3, "intake_message", { mode: "pitch", turn: 6, suggestion: false }),
      ev(3, "intake_draft_ready", { mode: "pitch", turns: 6 }),
      close(3, 6, 8),
      ev(4, "intake_open", { mode: "pitch", resumed: false }),
      ev(4, "intake_message", { mode: "pitch", turn: 1, suggestion: false }),
      ev(4, "intake_draft_ready", { mode: "pitch", turns: 5 }),
      ev(4, "intake_submitted", { mode: "pitch", turns: 5 }),
      close(4, 5, 8, true),
      ev(5, "intake_open", { mode: "pitch", resumed: false }),
      close(5, 0, 0, false, 1),
      ev(5, "intake_message", { mode: "pitch", turn: 1, suggestion: false }),
      close(5, 1, 1, false, 5),
      ev(6, "intake_open", { mode: "join", resumed: false }),
      ev(6, "intake_unavailable", { mode: "join" }),
      ev(2, "intake_reply_failed", { mode: "pitch", reason: "network" }),
      ev(3, "intake_reply_failed", { mode: "pitch", reason: "network" }),
      ev(3, "intake_reply_failed", { mode: "pitch", reason: "busy" }),
    ]);

    const m = await loadMetrics(db, 30, NOW);
    expect(m.intake.funnel.pitch).toEqual({ opened: 5, engaged: 4, ready: 2, submitted: 1 });
    expect(m.intake.funnel.join).toEqual({ opened: 1, engaged: 0, ready: 0, submitted: 0 });
    expect(m.intake.exits.pitch).toEqual({ beforeFirstMessage: 1, whileDrafting: 2, withDraftReady: 1 });
    expect(m.intake.fallbacks).toBe(1);
    expect(m.intake.replyFailures).toEqual([
      { reason: "network", count: 2 },
      { reason: "busy", count: 1 },
    ]);
  });

  it("uses the server's events for chats, agents and how pitches arrived", async () => {
    const t = at("2026-10-20T08:00:00Z");
    const api = (name: string, props: EventProps) => ({ name, source: "api", props, createdAt: t });
    const turn = (agent: string, mode: string | null, n: number, ms: number, error: string | null = null) =>
      api("agent_turn", { agent, mode, turn: n, steps: 1, ms, inputTokens: 1000, cachedInputTokens: 600, outputTokens: 100, error, aborted: false });
    await seed([
      api("intake_session_created", { mode: "pitch" }),
      api("intake_session_created", { mode: "pitch" }),
      api("intake_session_created", { mode: "join" }),
      turn("intake", "pitch", 1, 2000),
      turn("intake", "pitch", 2, 4000),
      turn("intake", "pitch", 3, 6000),
      turn("intake", "pitch", 4, 8000, "model_error"),
      turn("admin-assistant", null, 1, 3000),
      // A provider that reports a token count as a float doesn't break the page.
      api("agent_turn", { agent: "admin-assistant", mode: null, turn: 2, steps: 1, ms: 3000.0, inputTokens: 1000.5, cachedInputTokens: 0, outputTokens: 0, error: "refusal", aborted: false }),
      api("form_received", { form: "pitch", via: "chat", turns: 3 }),
      api("form_received", { form: "join", via: "form", turns: null }),
      api("form_received", { form: "newsletter", via: "form", turns: null }),
      { name: "form_failed", visitId: visit(9), path: "/join", props: { form: "join", reason: "unavailable" }, createdAt: t },
    ]);
    await db.insert(projectSubmissions).values({ ...validSubmission, consentAt: t, createdAt: t });

    const m = await loadMetrics(db, 30, NOW);
    expect(m.intake.chats.pitch).toEqual({ started: 2, engaged: 1, submitted: 1, avgTurnsToSubmit: 3 });
    expect(m.intake.chats.join).toEqual({ started: 1, engaged: 0, submitted: 0, avgTurnsToSubmit: null });
    expect(m.agents).toEqual([
      { agent: "intake", turns: 4, errors: 1, p50Ms: 4000, p95Ms: 5800, inputTokens: 4000, cachedInputTokens: 2400, outputTokens: 400 },
      { agent: "admin-assistant", turns: 2, errors: 1, p50Ms: 3000, p95Ms: 3000, inputTokens: 2000.5, cachedInputTokens: 600, outputTokens: 100 },
    ]);
    expect(m.forms).toEqual({
      pitch: { submitted: 0, failed: 0 },
      join: { submitted: 1, failed: 1 },
      newsletter: { submitted: 1, failed: 0 },
    });
    expect(m.received).toEqual({ pitches: 1, applications: 0, newsletter: 0, pitchesViaChat: 1, applicationsViaChat: 0 });
  });

  it("shows the inbox as it is now", async () => {
    const old = at("2026-10-01T09:00:00Z");
    await db.insert(projectSubmissions).values([
      { ...validSubmission, consentAt: old, createdAt: old },
      { ...validSubmission, consentAt: NOW, status: "accepted" },
    ]);
    await db.insert(memberApplications).values({ ...validApplication, consentAt: NOW, status: "reviewing" });
    await db.insert(outbox).values({ to: "a@example.com", subject: "Hi", body: "…", draftedBy: "intake", createdAt: old });

    const m = await loadMetrics(db, 7, NOW);
    expect(m.inbox).toEqual({
      submissions: { new: 1, discussing: 0, accepted: 1, declined: 0 },
      applications: { new: 0, reviewing: 1, accepted: 0, declined: 0 },
      oldestNewSubmissionAt: old.toISOString(),
      oldestNewApplicationAt: null,
      outboxPending: 1,
      oldestPendingEmailAt: old.toISOString(),
    });
  });

  it("is all zeros on an empty database", async () => {
    const m = await loadMetrics(db, 30, NOW);
    expect(m.traffic.visits).toBe(0);
    expect(m.traffic.daily).toHaveLength(30);
    expect(m.intake.funnel.pitch).toEqual({ opened: 0, engaged: 0, ready: 0, submitted: 0 });
    expect(m.agents).toEqual([]);
  });
});

describe("GET /admin/metrics", () => {
  beforeEach(async () => {
    await db.insert(members).values(TEST_MEMBERS);
  });

  it("needs an admin session and a sensible range", async () => {
    const { app } = makeApp(db);
    expect((await adminFetch(app, "GET", "/admin/metrics", undefined, null)).status).toBe(401);
    expect((await adminFetch(app, "GET", "/admin/metrics?days=0")).status).toBe(400);
    expect((await adminFetch(app, "GET", "/admin/metrics?days=401")).status).toBe(400);
  });

  it("answers for the default 30 days", async () => {
    const { app } = makeApp(db);
    const m = await adminJson(app, "GET", "/admin/metrics");
    expect(m.range.days).toBe(30);
    expect(m.traffic.daily).toHaveLength(30);
    expect(Object.keys(m.intake.funnel)).toEqual(["pitch", "join"]);
  });
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

describe("deleteExpiredAnalyticsEvents", () => {
  it(`deletes events older than ${ANALYTICS_RETENTION_MONTHS} months`, async () => {
    await seed([
      { name: "page_view", path: "/", createdAt: at("2025-09-19T10:00:00Z") },
      { name: "page_view", path: "/about", createdAt: at("2025-09-21T10:00:00Z") },
    ]);
    expect(await deleteExpiredAnalyticsEvents(db, NOW)).toBe(1);
    expect((await events()).map((e) => e.path)).toEqual(["/about"]);
  });

  it("runs from Vercel Cron", async () => {
    const { app } = makeApp(db, { env: { cronSecret: "cron-secret-0123456789" } });
    const res = await app.request("/cron/analytics-cleanup", { headers: { Authorization: "Bearer cron-secret-0123456789" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 0 });
  });
});
