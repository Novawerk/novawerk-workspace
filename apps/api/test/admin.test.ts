import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { memberApplications, members, projectSubmissions, type Database } from "@nw/db";

import {
  ADMIN_ORIGIN,
  WEB_ORIGIN,
  createTestDb,
  joinATeam,
  makeApp,
  postJson,
  resetDb,
  sessionCookie,
} from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    { id: "ada", handle: "ada", displayName: "Ada", email: "Ada@Novawerk.io", role: "maintainer" },
    { id: "grace", handle: "grace", displayName: "Grace", email: "grace@novawerk.io" },
    { id: "linus", handle: "linus", displayName: "Linus", email: "linus@novawerk.io", role: "maintainer", active: false },
  ]);
  await joinATeam(db, "grace");
});

const get = async (app: ReturnType<typeof makeApp>["app"], path: string, memberId?: string) =>
  app.request(path, memberId ? { headers: { Cookie: await sessionCookie(memberId) } } : {});

const patch = async (app: ReturnType<typeof makeApp>["app"], path: string, body: unknown, memberId = "ada") =>
  app.request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: await sessionCookie(memberId) },
    body: JSON.stringify(body),
  });

describe("session guard on /admin/*", () => {
  // Every admin route, with a body that would pass validation, so only the session can stop it.
  const id = "00000000-0000-0000-0000-000000000000";
  const ROUTES: [string, string, unknown?][] = [
    ["GET", "/admin/me"],
    ["GET", "/admin/submissions"],
    ["GET", `/admin/submissions/${id}`],
    ["PATCH", `/admin/submissions/${id}`, { notes: "x" }],
    ["POST", `/admin/submissions/${id}/accept`, {}],
    ["GET", `/admin/submissions/${id}/transcript`],
    ["GET", "/admin/applications"],
    ["GET", `/admin/applications/${id}`],
    ["PATCH", `/admin/applications/${id}`, { notes: "x" }],
    ["POST", `/admin/applications/${id}/accept`, {}],
    ["GET", `/admin/applications/${id}/transcript`],
    ["GET", "/admin/members"],
    ["POST", "/admin/members", { id: "mallory", displayName: "M", email: "m@example.org", role: "maintainer" }],
    ["PATCH", "/admin/members/ada", { role: "member" }],
    ["GET", "/admin/outbox"],
    ["GET", `/admin/outbox/${id}`],
    ["POST", "/admin/outbox", { to: "a@example.org", subject: "s", body: "b" }],
    ["PATCH", `/admin/outbox/${id}`, { body: "b" }],
    ["POST", `/admin/outbox/${id}/approve`],
    ["POST", `/admin/outbox/${id}/reject`],
    ["GET", "/admin/projects"],
    ["GET", `/admin/projects/${id}`],
    ["POST", "/admin/projects", { slug: "x-y", title: "X" }],
    ["PATCH", `/admin/projects/${id}`, { title: "X" }],
    ["DELETE", `/admin/projects/${id}`],
    ["PUT", `/admin/projects/${id}/members`, { members: [] }],
    ["GET", "/admin/partners"],
    ["POST", "/admin/partners", { id: "acme", name: "Acme" }],
    ["PATCH", "/admin/partners/acme", { stage: "closed" }],
    ["DELETE", "/admin/partners/acme"],
    ["GET", "/admin/finance"],
    ["POST", "/admin/finance", { entryDate: "2026-10-03", direction: "in", amountCents: 100 }],
    ["GET", "/admin/subscribers"],
    ["GET", "/admin/subscribers/export"],
    ["GET", "/admin/documents"],
    ["POST", "/admin/documents/upload", { filename: "a.pdf", contentType: "application/pdf", size: 1 }],
    ["POST", "/admin/documents", { pathname: "ada/a.pdf", kind: "other", title: "x" }],
    ["GET", "/admin/documents/1/file"],
    ["DELETE", "/admin/documents/1"],
    ["POST", "/admin/uploads/image", { filename: "a.png", contentType: "image/png", size: 1 }],
    ["GET", "/admin/metrics"],
    ["GET", `/admin/submissions/${id}/resume`],
    ["GET", `/admin/applications/${id}/resume`],
    ["POST", "/admin/chat/sessions"],
    ["GET", `/admin/chat/sessions/${id}`],
    ["POST", `/admin/chat/sessions/${id}/messages`, { text: "hi" }],
    ["GET", "/admin/unknown"],
  ];

  it("rejects every admin route without a session", async () => {
    const { app } = makeApp(db);
    for (const [method, path, body] of ROUTES) {
      const res = await app.request(path, {
        method,
        ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(await res.json()).toEqual({ error: "Not signed in" });
    }
  });

  // What a member without admin access gets: their own view, their own (here: no) projects,
  // the member list for pickers, and a 403 everywhere that is for admins.
  const AS_MEMBER: Record<string, number> = {
    "GET /admin/me": 200,
    "GET /admin/members": 200,
    "GET /admin/projects": 200,
    [`GET /admin/projects/${id}`]: 404,
    [`PATCH /admin/projects/${id}`]: 404,
    [`DELETE /admin/projects/${id}`]: 404,
    [`PUT /admin/projects/${id}/members`]: 404,
    "POST /admin/uploads/image": 503,
    "GET /admin/unknown": 404,
  };

  it("lets members without admin access in only where members belong", async () => {
    const { app } = makeApp(db);
    for (const [method, path, body] of ROUTES) {
      const res = await app.request(path, {
        method,
        headers: {
          Cookie: await sessionCookie("grace"),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(AS_MEMBER[`${method} ${path}`] ?? 403);
    }
    expect(await db.select().from(members)).toHaveLength(3);
  });

  it("hides email addresses in the member list from members without admin access", async () => {
    const list = (await (await get(makeApp(db).app, "/admin/members", "grace")).json()) as { email: string }[];
    expect(list.map((m) => m.email)).toEqual(["", "", ""]);
  });

  it("rejects a garbage cookie and one signed with another secret", async () => {
    const { app } = makeApp(db);
    const garbage = await app.request("/admin/me", { headers: { Cookie: "nw_session=not-a-jwt" } });
    expect(garbage.status).toBe(401);
    const forged = await app.request("/admin/me", {
      headers: { Cookie: await sessionCookie("ada", "some-other-secret-that-is-long-enough") },
    });
    expect(forged.status).toBe(401);
  });

  it("accepts a session cookie minted with the test secret", async () => {
    const res = await get(makeApp(db).app, "/admin/me", "ada");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "ada",
      displayName: "Ada",
      email: "Ada@Novawerk.io",
      role: "maintainer",
      publicProfile: false,
      profileHandle: "ada",
      profileBio: null,
    });
  });

  it("signs out a member who is no longer active, and says who is not an admin", async () => {
    const { app } = makeApp(db);
    const grace = await get(app, "/admin/me", "grace");
    expect(grace.status).toBe(200);
    expect(await grace.json()).toMatchObject({ id: "grace", role: "member" });
    expect((await get(app, "/admin/me", "linus")).status).toBe(401);
    expect((await get(app, "/admin/me", "nobody")).status).toBe(401);
  });
});

describe("POST /auth/google", () => {
  it("signs in an active admin and sets an httpOnly, SameSite=Lax session cookie", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/auth/google", postJson({ credential: "google:ada@novawerk.io" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "ada", role: "maintainer", adminPanel: true });

    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^nw_session=[\w-]+\.[\w-]+\.[\w-]+;/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain("Secure"); // plain-http localhost

    const me = await app.request("/admin/me", { headers: { Cookie: cookie.split(";")[0]! } });
    expect(me.status).toBe(200);
  });

  it("marks the cookie Secure off localhost", async () => {
    const { app } = makeApp(db);
    const res = await app.request(
      "https://api.novawerk.io/auth/google",
      postJson({ credential: "google:ada@novawerk.io" }),
    );
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("signs in members without admin rights too, when they are on a project's team", async () => {
    const res = await makeApp(db).app.request("/auth/google", postJson({ credential: "google:grace@novawerk.io" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "grace", role: "member", adminPanel: true });
  });

  it("keeps members on no project's team out of the admin panel (NB-ADR-0014)", async () => {
    const { app } = makeApp(db);
    await db.insert(members).values({ id: "lena", handle: "lena", displayName: "Lena", email: "lena@example.org" });
    const signIn = await app.request("/auth/google", postJson({ credential: "google:lena@example.org" }));
    expect(await signIn.json()).toMatchObject({ id: "lena", adminPanel: false });
    const cookie = { headers: { Cookie: signIn.headers.get("set-cookie")!.split(";")[0]! } };
    expect((await app.request("/admin/me", cookie)).status).toBe(403);
    expect((await get(app, "/admin/me", "lena")).status).toBe(403);
    expect((await get(app, "/admin/members", "lena")).status).toBe(403);
  });

  it("answers 403 to inactive members; a stranger gets a new account, without the admin panel", async () => {
    const { app } = makeApp(db);
    const linus = await app.request("/auth/google", postJson({ credential: "google:linus@novawerk.io" }));
    expect(linus.status).toBe(403);
    expect(linus.headers.get("set-cookie")).toBeNull();
    const stranger = await app.request("/auth/google", postJson({ credential: "google:someone@gmail.com" }));
    expect(await stranger.json()).toMatchObject({ role: "member", email: "someone@gmail.com", adminPanel: false });
    const cookie = { headers: { Cookie: stranger.headers.get("set-cookie")!.split(";")[0]! } };
    expect((await app.request("/admin/me", cookie)).status).toBe(403);
  });

  it("answers 403 when Google rejects the token, 400 when it is missing", async () => {
    const { app, logger } = makeApp(db);
    const bad = await app.request("/auth/google", postJson({ credential: "forged" }));
    expect(bad.status).toBe(403);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect((await app.request("/auth/google", postJson({}))).status).toBe(400);
  });
});

describe("POST /auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await makeApp(db).app.request("/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^nw_session=;.*Max-Age=0/);
  });
});

describe("CORS on credentialed routes", () => {
  const preflight = (origin: string) =>
    new Request("http://localhost/admin/submissions", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "PATCH" },
    });

  it("allows the admin origin with credentials", async () => {
    const res = await makeApp(db).app.request(preflight(ADMIN_ORIGIN));
    expect(res.headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    for (const method of ["PUT", "DELETE"]) {
      expect(res.headers.get("access-control-allow-methods"), method).toContain(method);
    }
  });

  it("does not allow the public website origin", async () => {
    const res = await makeApp(db).app.request(preflight(WEB_ORIGIN));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("/admin/submissions", () => {
  const base = {
    email: "x@example.com",
    product: "p",
    userJourney: "u",
    referencesAndInnovation: "r",
    team: "t",
    timeline: "tl",
    consentAt: new Date(),
  };
  let ids: Record<string, string>;

  beforeEach(async () => {
    const rows = await db
      .insert(projectSubmissions)
      .values([
        { ...base, name: "Old", projectName: "Old", createdAt: new Date("2026-09-01T00:00:00Z") },
        { ...base, name: "Mid", projectName: "Mid", status: "discussing", createdAt: new Date("2026-09-15T00:00:00Z") },
        { ...base, name: "New", projectName: "New", createdAt: new Date("2026-10-01T00:00:00Z") },
      ])
      .returning({ id: projectSubmissions.id, name: projectSubmissions.name });
    ids = Object.fromEntries(rows.map((r) => [r.name, r.id]));
  });

  it("lists newest first and filters by status", async () => {
    const { app } = makeApp(db);
    const all = (await (await get(app, "/admin/submissions", "ada")).json()) as { name: string }[];
    expect(all.map((s) => s.name)).toEqual(["New", "Mid", "Old"]);

    const fresh = (await (await get(app, "/admin/submissions?status=new", "ada")).json()) as { name: string }[];
    expect(fresh.map((s) => s.name)).toEqual(["New", "Old"]);

    expect((await get(app, "/admin/submissions?status=bogus", "ada")).status).toBe(400);
  });

  it("gets one by id, 404 for unknown or malformed ids", async () => {
    const { app } = makeApp(db);
    const res = await get(app, `/admin/submissions/${ids.Mid}`, "ada");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: ids.Mid, status: "discussing" });

    expect((await get(app, "/admin/submissions/00000000-0000-0000-0000-000000000000", "ada")).status).toBe(404);
    expect((await get(app, "/admin/submissions/not-a-uuid", "ada")).status).toBe(404);
  });

  it("PATCH updates status, reviewer and notes", async () => {
    const { app } = makeApp(db);
    const res = await patch(app, `/admin/submissions/${ids.New}`, {
      status: "discussing",
      reviewerId: "grace",
      notes: "Call on Friday",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "discussing", reviewerId: "grace", notes: "Call on Friday" });

    const cleared = await patch(app, `/admin/submissions/${ids.New}`, { reviewerId: null });
    expect(await cleared.json()).toMatchObject({ status: "discussing", reviewerId: null, notes: "Call on Friday" });
  });

  it("PATCH rejects unknown reviewers, bad statuses and empty updates", async () => {
    const { app } = makeApp(db);
    const unknown = await patch(app, `/admin/submissions/${ids.New}`, { reviewerId: "nobody" });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Validation failed", issues: { reviewerId: ["Unknown member"] } });

    const badStatus = await patch(app, `/admin/submissions/${ids.New}`, { status: "reviewing" });
    expect(badStatus.status).toBe(400);
    expect(((await badStatus.json()) as { issues: object }).issues).toHaveProperty("status");

    const empty = await patch(app, `/admin/submissions/${ids.New}`, {});
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "Validation failed", issues: { _form: ["Nothing to update"] } });
  });

  it("PATCH answers 404 for an unknown id and 401 without a session", async () => {
    const { app } = makeApp(db);
    const missing = await patch(app, "/admin/submissions/00000000-0000-0000-0000-000000000000", { status: "declined" });
    expect(missing.status).toBe(404);

    const anonymous = await app.request(`/admin/submissions/${ids.New}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "declined" }),
    });
    expect(anonymous.status).toBe(401);
    const [row] = await db.select().from(projectSubmissions).where(eq(projectSubmissions.id, ids.New!));
    expect(row?.status).toBe("new");
  });
});

describe("/admin/applications", () => {
  let id: string;
  beforeEach(async () => {
    const [row] = await db
      .insert(memberApplications)
      .values({
        name: "Grace",
        email: "grace@example.com",
        functions: ["developer"],
        background: "b",
        motivation: "m",
        availability: "2to5",
        consentAt: new Date(),
      })
      .returning({ id: memberApplications.id });
    id = row!.id;
  });

  it("lists, filters, gets and patches", async () => {
    const { app } = makeApp(db);
    expect(((await (await get(app, "/admin/applications", "ada")).json()) as unknown[]).length).toBe(1);
    expect(((await (await get(app, "/admin/applications?status=accepted", "ada")).json()) as unknown[]).length).toBe(0);
    expect((await get(app, `/admin/applications/${id}`, "ada")).status).toBe(200);

    const res = await patch(app, `/admin/applications/${id}`, { status: "accepted", memberId: "grace" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "accepted", memberId: "grace" });

    const unknown = await patch(app, `/admin/applications/${id}`, { memberId: "nobody" });
    expect(unknown.status).toBe(400);
    const wrongEnum = await patch(app, `/admin/applications/${id}`, { status: "discussing" });
    expect(wrongEnum.status).toBe(400);
  });
});

