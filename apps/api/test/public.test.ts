import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  memberApplications,
  members,
  newsletterSubscribers,
  projectMembers,
  projectSubmissions,
  projects,
  type Database,
} from "@nw/db";

import { SIGNUPS_PER_HOUR } from "../src/routes/public.js";
import {
  WEB_ORIGIN,
  createTestDb,
  type TestApp,
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

describe("GET /health", () => {
  it("answers ok", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("is reachable through the typed RPC client", async () => {
    const res = await testClient(makeApp(db).app).health.$get();
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("CORS on public routes", () => {
  const preflight = (origin: string) =>
    new Request("http://localhost/public/submissions", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });

  it("allows a configured origin", async () => {
    const res = await makeApp(db).app.request(preflight(WEB_ORIGIN));
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
  });

  it("does not allow an unknown origin", async () => {
    const res = await makeApp(db).app.request(preflight("https://evil.example"));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("GET /public/projects", () => {
  beforeEach(async () => {
    await db.insert(members).values([
      { id: "ada", displayName: "Ada", email: "ada@novawerk.io" },
      { id: "grace", displayName: "Grace", email: "grace@novawerk.io" },
    ]);
    const rows = await db
      .insert(projects)
      .values([
        { slug: "draft-one", title: "Draft", status: "draft" },
        { slug: "old-one", title: "Archived", status: "archived" },
        { slug: "zeta", title: "Zeta", status: "building", sortOrder: 10 },
        { slug: "alpha", title: "Alpha", status: "planning", sortOrder: 10 },
        { slug: "early", title: "Early", status: "launched", sortOrder: 1 },
        { slug: "star", title: "Star", status: "launched", featured: true, sortOrder: 500, year: 2026 },
      ])
      .returning({ id: projects.id, slug: projects.slug });
    const id = (slug: string) => rows.find((r) => r.slug === slug)!.id;
    await db.insert(projectMembers).values([
      { projectId: id("star"), memberId: "grace", role: "Developer" },
      { projectId: id("star"), memberId: "ada", role: "Initiator" },
      { projectId: id("draft-one"), memberId: "ada", role: "Initiator" },
    ]);
  });

  it("lists only public statuses: featured, then sort order, then title", async () => {
    const res = await makeApp(db).app.request("/public/projects");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string }[];
    expect(body.map((p) => p.slug)).toEqual(["star", "early", "alpha", "zeta"]);
  });

  it("returns the PublicProject shape with the team joined from members", async () => {
    const res = await testClient(makeApp(db).app).public.projects.$get();
    const [star, early] = await res.json();
    expect(star).toEqual({
      slug: "star",
      title: "Star",
      tagline: null,
      description: "",
      status: "launched",
      year: 2026,
      link: null,
      coverUrl: null,
      featured: true,
      team: [
        { name: "Ada", role: "Initiator" },
        { name: "Grace", role: "Developer" },
      ],
    });
    expect(early?.team).toEqual([]);
  });

  it("returns an empty list when nothing is public", async () => {
    await db.delete(projects);
    const res = await makeApp(db).app.request("/public/projects");
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /public/submissions", () => {
  it("stores the pitch, notifies the team and answers 201", async () => {
    const { app, sent } = makeApp(db);
    const res = await app.request("/public/submissions", postJson(validSubmission));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);

    const [row] = await db.select().from(projectSubmissions);
    expect(row).toMatchObject({
      id: body.id,
      name: "Ada Lovelace",
      projectName: "Bouldering routes",
      links: "https://example.com/deck",
      status: "new",
    });
    expect(row?.consentAt).toBeInstanceOf(Date);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ subject: "New project pitch: Bouldering routes", replyTo: "ada@example.com" });
    for (const value of Object.values(validSubmission)) {
      if (typeof value === "string") expect(sent[0]?.text).toContain(value);
    }
    expect(sent[0]?.text).toContain(body.id);
  });

  it("stores empty links as null", async () => {
    const { app } = makeApp(db);
    await app.request("/public/submissions", postJson({ ...validSubmission, links: "" }));
    const [row] = await db.select().from(projectSubmissions);
    expect(row?.links).toBeNull();
  });

  it("answers 400 with field issues and stores nothing", async () => {
    const { app, notify } = makeApp(db);
    const res = await app.request(
      "/public/submissions",
      postJson({ ...validSubmission, product: "short", email: "nope", consent: false }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: Record<string, string[]> };
    expect(body.error).toBe("Validation failed");
    expect(Object.keys(body.issues).sort()).toEqual(["consent", "email", "product"]);
    expect(body.issues.product?.[0]).toMatch(/20\+ characters/);
    expect(await db.select().from(projectSubmissions)).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("answers 200 to a filled honeypot and does nothing, even if the rest is invalid", async () => {
    const { app, notify } = makeApp(db);
    for (const body of [{ ...validSubmission, website: "http://spam" }, { website: "x" }]) {
      const res = await app.request("/public/submissions", postJson(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(await db.select().from(projectSubmissions)).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("still answers 201 when the notification fails, and logs it", async () => {
    const { app, logger } = makeApp(db, { notify: async () => Promise.reject(new Error("Resend down")) });
    const res = await app.request("/public/submissions", postJson(validSubmission));
    expect(res.status).toBe(201);
    expect(await db.select().from(projectSubmissions)).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("rejects malformed JSON and non-JSON bodies with 400", async () => {
    const { app } = makeApp(db);
    const malformed = await app.request("/public/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{nope",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Malformed JSON in request body" });

    const plain = await app.request("/public/submissions", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(validSubmission),
    });
    expect(plain.status).toBe(400);
    expect(await db.select().from(projectSubmissions)).toHaveLength(0);
  });
});

describe("POST /public/applications", () => {
  it("stores the application with functions, availability and consent", async () => {
    const { app, sent } = makeApp(db);
    const res = await app.request("/public/applications", postJson(validApplication));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const [row] = await db.select().from(memberApplications);
    expect(row).toMatchObject({
      id,
      email: "grace@example.com",
      city: "Berlin",
      functions: ["developer", "research"],
      availability: "2to5",
      links: null,
      status: "new",
    });
    expect(row?.consentAt).toBeInstanceOf(Date);

    expect(sent[0]).toMatchObject({ subject: "New member application: Grace Hopper", replyTo: "grace@example.com" });
    expect(sent[0]?.text).toContain("Developer, Research");
    expect(sent[0]?.text).toContain("2–5 hours a week");
    expect(sent[0]?.text).toContain(validApplication.motivation);
  });

  it("answers 400 with field issues", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/public/applications", postJson({ ...validApplication, functions: [], consent: false }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: Record<string, string[]> };
    expect(Object.keys(body.issues).sort()).toEqual(["consent", "functions"]);
    expect(await db.select().from(memberApplications)).toHaveLength(0);
  });

  it("answers 200 to a filled honeypot and stores nothing", async () => {
    const { app, notify } = makeApp(db);
    const res = await app.request("/public/applications", postJson({ ...validApplication, website: "spam" }));
    expect(res.status).toBe(200);
    expect(await db.select().from(memberApplications)).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("newsletter", () => {
  const subscribe = (app: TestApp, body: unknown, ip = "203.0.113.7") =>
    app.request("/public/subscribe", postJson(body, { "x-forwarded-for": ip }));

  /** An app whose confirmation emails land in `mails`. */
  function newsletterApp() {
    const mails: { to: string; url: string }[] = [];
    const made = makeApp(db, {
      sendNewsletterConfirmation: async (to, url) => {
        mails.push({ to, url });
      },
    });
    return { ...made, mails };
  }
  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
  /** The Confirm button on the page the link opens: where it lands. */
  const confirm = async (app: TestApp, token: string) =>
    (await app.request(`/public/newsletter/confirm?token=${token}`, { method: "POST" })).headers.get("location");
  const SUBSCRIBED = `${WEB_ORIGIN}/newsletter/subscribed`;
  const EXPIRED = `${WEB_ORIGIN}/newsletter/link-expired`;
  const row = async (email = "ada@example.com") =>
    (await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)))[0]!;

  it("stores a pending row and emails a confirmation link, never the token itself", async () => {
    const { app, mails } = newsletterApp();
    const res = await subscribe(app, { email: " Ada@Example.com " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("ada@example.com");
    expect(mails[0]!.url).toMatch(/^https:\/\/api\.novawerk\.io\/public\/newsletter\/confirm\?token=[A-Za-z0-9_-]{43}$/);

    const stored = await row();
    expect(stored).toMatchObject({ subscribed: true, confirmedAt: null, source: "website", confirmSendCount: 1 });
    expect(stored.confirmTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.confirmTokenHash).not.toContain(tokenOf(mails[0]!.url));
    expect(stored.confirmTokenExpiresAt!.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
  });

  it("answers the same for a new, pending and confirmed address", async () => {
    const { app, mails } = newsletterApp();
    const answers: [number, unknown][] = [];
    for (let i = 0; i < 2; i++) {
      const res = await subscribe(app, { email: "ada@example.com" });
      answers.push([res.status, await res.json()]);
    }
    await confirm(app, tokenOf(mails[1]!.url));
    expect((await row()).confirmedAt).not.toBeNull();
    const res = await subscribe(app, { email: "ada@example.com" });
    answers.push([res.status, await res.json()]);

    expect(answers).toEqual(Array(3).fill([200, { ok: true }]));
    // A confirmed address gets no new email.
    expect(mails).toHaveLength(2);
    expect(await db.select().from(newsletterSubscribers)).toHaveLength(1);
  });

  it("sends at most 3 confirmations per address per day, still answering 200", async () => {
    const { app, mails } = newsletterApp();
    for (let i = 0; i < 5; i++) {
      expect((await subscribe(app, { email: "ada@example.com" }, `198.51.100.${i}`)).status).toBe(200);
    }
    expect(mails).toHaveLength(3);
    // The window passes: one more may go out.
    await db
      .update(newsletterSubscribers)
      .set({ confirmWindowStartedAt: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(newsletterSubscribers.email, "ada@example.com"));
    await subscribe(app, { email: "ada@example.com" });
    expect(mails).toHaveLength(4);
    expect((await row()).confirmSendCount).toBe(1);
  });

  it("limits signups per network", async () => {
    const { app } = newsletterApp();
    for (let i = 0; i < SIGNUPS_PER_HOUR; i++) {
      expect((await subscribe(app, { email: `p${i}@example.com` })).status).toBe(200);
    }
    expect((await subscribe(app, { email: "one-more@example.com" })).status).toBe(429);
  });

  it("opens a page on GET, so a mail scanner confirms nothing; the page's POST confirms", async () => {
    const { app, mails } = newsletterApp();
    await subscribe(app, { email: "ada@example.com" });
    const token = tokenOf(mails[0]!.url);
    const page = await app.request(`/public/newsletter/confirm?token=${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    // The button's redirect lands on the website: the CSP must allow it, or the browser stops there.
    expect(page.headers.get("content-security-policy")).toContain(`form-action 'self' ${WEB_ORIGIN};`);
    const html = await page.text();
    expect(html).toContain(`<form method="post" action="?token=${token}">`);
    expect(html).not.toContain("<script");
    expect((await row()).confirmedAt).toBeNull();
    for (const bad of ["", "?token=short", "?token=x&token=y"]) {
      expect((await app.request(`/public/newsletter/confirm${bad}`)).headers.get("location")).toBe(`${WEB_ORIGIN}/newsletter/link-expired`);
    }
    expect(await confirm(app, "short")).toBe(EXPIRED);
  });

  it("confirms with the latest link only, and only until it expires", async () => {
    const { app, mails } = newsletterApp();
    await subscribe(app, { email: "ada@example.com" });
    await subscribe(app, { email: "ada@example.com" });
    const [first, second] = mails.map((m) => tokenOf(m.url));

    expect(await confirm(app, first!)).toBe(EXPIRED);
    expect((await row()).confirmedAt).toBeNull();

    expect(await confirm(app, second!)).toBe(SUBSCRIBED);
    const confirmedAt = (await row()).confirmedAt;
    expect(confirmedAt).not.toBeNull();

    // A second click is fine and keeps the first confirmation time.
    expect(await confirm(app, second!)).toBe(SUBSCRIBED);
    expect((await row()).confirmedAt).toEqual(confirmedAt);
  });

  it("refuses an expired link", async () => {
    const { app, mails } = newsletterApp();
    await subscribe(app, { email: "ada@example.com" });
    await db.update(newsletterSubscribers).set({ confirmTokenExpiresAt: new Date(Date.now() - 1000) });
    expect(await confirm(app, tokenOf(mails[0]!.url))).toBe(EXPIRED);
    expect((await row()).confirmedAt).toBeNull();
  });

  it("unsubscribes on POST (RFC 8058 one-click), never on GET, and keeps only the marker", async () => {
    const { app, mails } = newsletterApp();
    await subscribe(app, { email: "ada@example.com" });
    const confirmToken = tokenOf(mails[0]!.url);
    await confirm(app, confirmToken);
    const { unsubscribeToken } = await row();

    const page = await app.request(`/public/newsletter/unsubscribe?token=${unsubscribeToken}`);
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe(`${WEB_ORIGIN}/newsletter/unsubscribe?token=${unsubscribeToken}`);
    expect((await row()).subscribed).toBe(true);

    const oneClick = await app.request(`/public/newsletter/unsubscribe?token=${unsubscribeToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(oneClick.status).toBe(200);
    expect(await row()).toMatchObject({
      subscribed: false,
      confirmedAt: null,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      unsubscribeToken,
    });

    // Idempotent, and the old confirmation link can't bring them back.
    expect((await app.request(`/public/newsletter/unsubscribe?token=${unsubscribeToken}`, { method: "POST" })).status).toBe(200);
    expect(await confirm(app, confirmToken)).toBe(EXPIRED);
    expect((await row()).subscribed).toBe(false);
  });

  it("answers 400 to a malformed unsubscribe token, and GET still lands on the page", async () => {
    const { app } = newsletterApp();
    const res = await app.request("/public/newsletter/unsubscribe?token=nope", { method: "POST" });
    expect(res.status).toBe(400);
    expect((await app.request("/public/newsletter/unsubscribe?token=nope")).headers.get("location")).toBe(
      `${WEB_ORIGIN}/newsletter/unsubscribe`,
    );
  });

  it("stays unsubscribed after a new signup until the new link is clicked", async () => {
    const { app, mails } = newsletterApp();
    await db.insert(newsletterSubscribers).values({ email: "ada@example.com", subscribed: false });
    await subscribe(app, { email: "ada@example.com" });
    expect(mails).toHaveLength(1);
    expect((await row()).subscribed).toBe(false);

    await confirm(app, tokenOf(mails[0]!.url));
    expect(await row()).toMatchObject({ subscribed: true, confirmedAt: expect.any(Date) });
  });

  it("leaves rows from before double opt-in pending, and emails nobody on its own", async () => {
    await db.insert(newsletterSubscribers).values({ email: "early@example.com" });
    expect(await row("early@example.com")).toMatchObject({ subscribed: true, confirmedAt: null });
    expect((await row("early@example.com")).unsubscribeToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("logs a failed confirmation email and still answers 200", async () => {
    const { app, logger } = makeApp(db, {
      sendNewsletterConfirmation: async () => {
        throw new Error("Resend down");
      },
    });
    expect((await subscribe(app, { email: "ada@example.com" })).status).toBe(200);
    expect(logger.error).toHaveBeenCalledWith("[newsletter] confirmation email failed:", expect.any(Error));
  });

  it("answers 503 without a way to send confirmations", async () => {
    const { app } = makeApp(db);
    expect((await subscribe(app, { email: "ada@example.com" })).status).toBe(503);
    expect(await db.select().from(newsletterSubscribers)).toHaveLength(0);
  });

  it("answers 400 to a bad email and 200 to a filled honeypot", async () => {
    const { app, mails } = newsletterApp();
    const bad = await subscribe(app, { email: "nope" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { issues: object }).issues).toHaveProperty("email");

    expect((await subscribe(app, { email: "bot@example.com", website: "x" })).status).toBe(200);
    expect(await db.select().from(newsletterSubscribers)).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
});

describe("fallbacks", () => {
  it("answers unknown routes with a JSON 404", async () => {
    const res = await makeApp(db).app.request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
