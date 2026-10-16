// The contributor task board over HTTP: signing in (GitHub, emailed code), who may call what
// (anonymous, contributor, member), the limits, and what public responses never contain.
// The rules themselves are tested in packages/tasks.

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { members, signInCodes, tasks, type Database } from "@nw/db";

import { createGitHubOAuth, type GitHubOAuth } from "../src/github-auth.js";
import { readEnv } from "../src/deps.js";
import { issueCode } from "../src/sign-in-codes.js";
import {
  ADMIN_ORIGIN,
  TEST_MEMBERS,
  TEST_SECRET,
  WEB_ORIGIN,
  contributorCookie,
  createTestDb,
  makeApp,
  postJson,
  resetDb,
  sessionCookie,
  type TestApp,
} from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

/**
 * Fake GitHub: the code `gh:<id>:<login>` belongs to that user. Like GitHub, it refuses an
 * exchange whose PKCE verifier doesn't match the challenge it was given.
 */
const challenges: string[] = [];
const fakeGitHub: GitHubOAuth = {
  authorizeUrl: (state, redirectUri, codeChallenge) => {
    challenges.push(codeChallenge);
    return `https://github.test/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  },
  exchange: async (code, _redirectUri, codeVerifier) => {
    const [, id, login] = code.split(":");
    if (!code.startsWith("gh:") || !id || !login) throw new Error("bad code");
    if (!challenges.includes(createHash("sha256").update(codeVerifier).digest("base64url"))) throw new Error("PKCE mismatch");
    return { id: Number(id), login, name: null, avatarUrl: `https://avatars.example/${id}` };
  },
};

const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0];

/** Runs the GitHub flow end to end and returns the contributor cookie. */
async function signInWithGitHub(app: TestApp, code: string, opts: { cookie?: string; returnTo?: string } = {}) {
  const start = await app.request(
    `/auth/contributor/github/start${opts.returnTo ? `?returnTo=${encodeURIComponent(opts.returnTo)}` : ""}`,
    { headers: opts.cookie ? { Cookie: opts.cookie } : {} },
  );
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const stateCookie = cookieOf(start, "nw_github_state")!;
  const callback = await app.request(`/auth/contributor/github/callback?code=${encodeURIComponent(code)}&state=${state}`, {
    headers: { Cookie: stateCookie },
  });
  return { callback, cookie: cookieOf(callback, "nw_session") };
}

async function json(app: TestApp, method: string, path: string, cookie: string | null, body?: unknown) {
  const headers: Record<string, string> = {};
  // A browser sends its Origin with every write.
  if (cookie) Object.assign(headers, { Cookie: cookie, Origin: WEB_ORIGIN });
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: (await res.json()) as any, res };
}

async function contributor(fields: Partial<typeof members.$inferInsert> & { handle: string }) {
  const [row] = await db
    .insert(members)
    .values({ displayName: fields.handle, ...fields })
    .returning();
  return { row: row!, cookie: await contributorCookie(row!.id) };
}

async function openTask(fields: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db
    .insert(tasks)
    .values({ title: "Dark mode toggle", area: "web", size: "M", status: "open", criteria: ["Works"], ...fields })
    .returning();
  return row!;
}

const plan = { approach: "Add a toggle to the header", testing: "A Playwright check", eta: "week", readCriteria: true };

describe("signing in with GitHub", () => {
  it("creates a contributor, sets its own cookie and goes back where they were", async () => {
    const { app } = makeApp(db, { githubOAuth: fakeGitHub });
    const start = await app.request("/auth/contributor/github/start?returnTo=/tasks/NW-42");
    const location = new URL(start.headers.get("location")!);
    expect(location.searchParams.get("redirect_uri")).toBe("https://api.novawerk.io/auth/contributor/github/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(start.headers.get("set-cookie")).toMatch(/nw_github_state=.*HttpOnly/i);

    const { callback, cookie } = await signInWithGitHub(app, "gh:101:Lena-K", { returnTo: "/tasks/NW-42" });
    expect(callback.headers.get("location")).toBe(`${WEB_ORIGIN}/tasks/NW-42`);
    expect(cookie).toBeDefined();
    const me = await json(app, "GET", "/auth/contributor/me", cookie!);
    expect(me.body).toMatchObject({ handle: "lena-k", github: { id: 101, login: "Lena-K" }, public: false, canWork: true, email: null });
  });

  it("refuses a callback whose state doesn't match, and an outside returnTo", async () => {
    const { app } = makeApp(db, { githubOAuth: fakeGitHub });
    const start = await app.request("/auth/contributor/github/start");
    const callback = await app.request("/auth/contributor/github/callback?code=gh:1:x&state=forged", {
      headers: { Cookie: cookieOf(start, "nw_github_state")! },
    });
    expect(callback.headers.get("location")).toBe(`${WEB_ORIGIN}/sign-in?error=github`);
    expect(cookieOf(callback, "nw_session")).toBeUndefined();
    expect((await app.request("/auth/contributor/github/start?returnTo=//evil.example")).status).toBe(400);
    // An address elsewhere goes back to the board; the admin panel is one of ours.
    const evil = await signInWithGitHub(app, "gh:5:eve", { returnTo: "https://evil.example/x" });
    expect(evil.callback.headers.get("location")).toBe(`${WEB_ORIGIN}/tasks`);
    const admin = await signInWithGitHub(app, "gh:5:eve", { returnTo: `${ADMIN_ORIGIN}/projects` });
    expect(admin.callback.headers.get("location")).toBe(`${ADMIN_ORIGIN}/projects`);
  });

  it("links GitHub to an account made by email", async () => {
    const { app } = makeApp(db, { githubOAuth: fakeGitHub });
    const mira = await contributor({ handle: "mira", email: "mira@example.com" });
    const { callback, cookie } = await signInWithGitHub(app, "gh:300:mira-gh", { cookie: mira.cookie });
    expect(callback.status).toBe(302);
    const [row] = await db.select().from(members).where(eq(members.id, mira.row.id));
    expect(row).toMatchObject({ githubId: 300, githubLogin: "mira-gh", email: "mira@example.com" });
    // A new sign-in method ends the old sessions; the callback's new cookie works.
    expect((await json(app, "GET", "/auth/contributor/me", mira.cookie)).status).toBe(401);
    expect((await json(app, "GET", "/auth/contributor/me", cookie!)).status).toBe(200);

    // Another GitHub account never replaces the linked one.
    const other = await signInWithGitHub(app, "gh:301:someone", { cookie: cookie! });
    expect(other.callback.headers.get("location")).toBe(`${WEB_ORIGIN}/settings?error=github-linked-elsewhere`);
    const [after] = await db.select().from(members).where(eq(members.id, mira.row.id));
    expect(after?.githubId).toBe(300);
  });

  it("refuses an exchange without the PKCE verifier GitHub was promised", async () => {
    const { app } = makeApp(db, { githubOAuth: fakeGitHub });
    challenges.length = 0;
    const start = await app.request("/auth/contributor/github/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    challenges.length = 0; // GitHub forgot the challenge: a verifier from elsewhere can't match
    const callback = await app.request(`/auth/contributor/github/callback?code=gh:1:x&state=${state}`, {
      headers: { Cookie: cookieOf(start, "nw_github_state")! },
    });
    expect(callback.headers.get("location")).toBe(`${WEB_ORIGIN}/sign-in?error=github`);
  });

  it("answers 503 when the GitHub App isn't configured", async () => {
    const { app } = makeApp(db);
    expect((await app.request("/auth/contributor/github/start")).status).toBe(503);
  });
});

describe("signing in with an emailed code", () => {
  function codeApp() {
    const sent: { to: string; code: string }[] = [];
    const { app } = makeApp(db, { sendSignInCode: async (to, code) => void sent.push({ to, code }) });
    return { app, sent };
  }

  it("emails a code to any address and creates the account on first use", async () => {
    const { app, sent } = codeApp();
    const start = await app.request("/auth/contributor/email/start", postJson({ email: "New@Example.com" }));
    expect(await start.json()).toEqual({ ok: true });
    const verify = await app.request("/auth/contributor/email/verify", postJson({ email: "new@example.com", code: sent[0]!.code }));
    expect(verify.status).toBe(200);
    const me = (await verify.json()) as { handle: string };
    expect(me).toMatchObject({ email: "new@example.com", canWork: false, defaultHandle: true });
    expect(me.handle).toMatch(/^contributor-[0-9a-f]{4}$/);
    expect(cookieOf(verify, "nw_session")).toBeDefined();
    // Used up.
    expect((await app.request("/auth/contributor/email/verify", postJson({ email: "new@example.com", code: sent[0]!.code }))).status).toBe(400);
  });

  it("stores only a hash, and a code from the two-account days doesn't work", async () => {
    const { app } = codeApp();
    const oldCode = await issueCode(db, "grace@novawerk.io", TEST_SECRET, new Date(), "contributor");
    const res = await app.request("/auth/email/verify", postJson({ email: "grace@novawerk.io", code: oldCode }));
    expect(res.status).toBe(400);
    const rows = await db.select().from(signInCodes);
    expect(rows.every((r) => !r.codeHash.includes(oldCode!))).toBe(true);
  });

  it("answers the same when an address asks too often, and sends nothing more", async () => {
    const { app, sent } = codeApp();
    for (let i = 0; i < 4; i++) {
      const res = await app.request("/auth/contributor/email/start", postJson({ email: "a@example.com" }));
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(sent).toHaveLength(3);
  });

  it("limits code requests per network", async () => {
    const { app } = codeApp();
    const from = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 10; i++) {
      expect((await app.request("/auth/contributor/email/start", postJson({ email: `p${i}@example.com` }, from))).status).toBe(200);
    }
    expect((await app.request("/auth/contributor/email/start", postJson({ email: "p10@example.com" }, from))).status).toBe(429);
  });

  it("counts every try, even when guesses arrive together", async () => {
    for (const [startPath, verifyPath, email] of [
      ["/auth/contributor/email/start", "/auth/contributor/email/verify", "t@example.com"],
      ["/auth/email/start", "/auth/email/verify", "grace@novawerk.io"],
    ] as const) {
      const { app, sent } = codeApp();
      await app.request(startPath, postJson({ email }));
      const real = sent[0]!.code;
      const wrong = real === "000000" ? "111111" : "000000";
      const guesses = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          app.request(verifyPath, postJson({ email, code: wrong }, { "x-forwarded-for": `198.51.100.${i}` })),
        ),
      );
      expect(guesses.every((r) => r.status === 400)).toBe(true);
      const [row] = await db.select().from(signInCodes).where(eq(signInCodes.email, email));
      expect(row?.attempts).toBe(5);
      expect((await app.request(verifyPath, postJson({ email, code: real }))).status).toBe(400);
      await db.delete(signInCodes);
    }
  });

  it("limits code checks per network, on the old path and the new one together", async () => {
    const { app } = codeApp();
    const from = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 30; i++) {
      const path = i % 2 ? "/auth/contributor/email/verify" : "/auth/email/verify";
      expect((await app.request(path, postJson({ email: `v${i}@example.com`, code: "123456" }, from))).status).toBe(400);
    }
    expect((await app.request("/auth/email/verify", postJson({ email: "v@example.com", code: "123456" }, from))).status).toBe(429);
  });

  it("allows five tries per code", async () => {
    const { app, sent } = codeApp();
    await app.request("/auth/contributor/email/start", postJson({ email: "t@example.com" }));
    const wrong = sent[0]!.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await app.request("/auth/contributor/email/verify", postJson({ email: "t@example.com", code: wrong }));
    expect((await app.request("/auth/contributor/email/verify", postJson({ email: "t@example.com", code: sent[0]!.code }))).status).toBe(400);
  });
});

describe("who may call what", () => {
  it("one session opens the board for everyone, and the admin panel only for maintainers and teams", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", githubId: 1 });
    const task = await openTask();
    const adaCookie = await sessionCookie("ada");

    expect((await json(app, "POST", `/contrib/tasks/NW-${task.id}/proposals`, null, plan)).status).toBe(401);
    expect((await json(app, "GET", "/auth/me", adaCookie)).body).toMatchObject({ id: "ada", role: "maintainer", adminPanel: true });
    expect((await json(app, "GET", "/auth/me", lena.cookie)).body).toMatchObject({ role: "member", adminPanel: false });
    expect((await json(app, "GET", "/admin/me", lena.cookie)).status).toBe(403);
    expect((await json(app, "POST", `/contrib/tasks/NW-${task.id}/proposals`, lena.cookie, plan)).status).toBe(201);
    // Ada has no GitHub linked: a maintainer works on tasks under the same rules.
    expect((await json(app, "POST", `/contrib/tasks/NW-${task.id}/proposals`, adaCookie, plan)).status).toBe(403);
  });

  it("signing out ends every session, including a copied cookie", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", githubId: 1 });
    expect((await json(app, "GET", "/auth/contributor/me", lena.cookie)).status).toBe(200);
    const out = await json(app, "POST", "/auth/contributor/logout", lena.cookie);
    expect(out.res.headers.get("set-cookie")).toMatch(/nw_session=;/);
    expect((await json(app, "GET", "/auth/contributor/me", lena.cookie)).status).toBe(401);
    expect((await json(app, "POST", "/contrib/suggestions", lena.cookie, {})).status).toBe(401);
    // Signing in again afterwards works.
    expect((await json(app, "GET", "/auth/contributor/me", await contributorCookie(lena.row.id))).status).toBe(200);
  });

  it("answers 409, not 500, when the same proposal is sent twice at once", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", githubId: 1 });
    const task = await openTask();
    const both = await Promise.all([1, 2].map(() => json(app, "POST", `/contrib/tasks/${task.id}/proposals`, lena.cookie, plan)));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("signs out a deleted account at once", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", githubId: 1 });
    expect((await json(app, "DELETE", "/contrib/me", lena.cookie, { confirmHandle: "lenna" })).status).toBe(400);
    const gone = await json(app, "DELETE", "/contrib/me", lena.cookie, { confirmHandle: "Lena" });
    expect(gone.status).toBe(200);
    expect(gone.res.headers.get("set-cookie")).toMatch(/nw_session=;/);
    expect((await json(app, "GET", "/auth/contributor/me", lena.cookie)).status).toBe(401);
  });

  it("needs GitHub linked to propose, not to post, suggest or +1", async () => {
    const { app } = makeApp(db);
    const mira = await contributor({ handle: "mira", email: "mira@example.com" });
    const task = await openTask();
    const proposal = await json(app, "POST", `/contrib/tasks/${task.id}/proposals`, mira.cookie, plan);
    expect(proposal.status).toBe(403);
    expect(proposal.body.error).toMatch(/GitHub/);
    expect((await json(app, "POST", `/contrib/tasks/${task.id}/posts`, mira.cookie, { body: "A question" })).status).toBe(201);
    const s = await json(app, "POST", "/contrib/suggestions", mira.cookie, {
      title: "Chips overflow",
      kind: "bug",
      body: "On a phone the status chips overflow the screen.",
      where: "site",
    });
    expect(s.status).toBe(201);
    expect(s.body.id).toMatch(/^NW-\d+$/);
    expect((await json(app, "PUT", `/contrib/tasks/${s.body.id}/vote`, mira.cookie)).status).toBe(403); // own suggestion
    const lena = await contributor({ handle: "lena" });
    expect((await json(app, "PUT", `/contrib/tasks/${s.body.id}/vote`, lena.cookie)).status).toBe(200);
  });

  it("maps the rules to statuses: unknown 404, wrong state 409, limits 429, bad input 400", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", githubId: 1 });
    const draft = await openTask({ status: "draft" });
    expect((await json(app, "POST", `/contrib/tasks/${draft.id}/proposals`, lena.cookie, plan)).status).toBe(404);
    expect((await json(app, "POST", "/contrib/tasks/nope/proposals", lena.cookie, plan)).status).toBe(404);
    expect((await json(app, "POST", `/contrib/tasks/${(await openTask()).id}/proposals`, lena.cookie, { ...plan, readCriteria: false })).status).toBe(400);

    const done = await openTask({ status: "done" });
    expect((await json(app, "POST", `/contrib/tasks/${done.id}/proposals`, lena.cookie, plan)).status).toBe(409);

    for (let i = 0; i < 5; i++) {
      expect((await json(app, "POST", `/contrib/tasks/${(await openTask({ title: `T${i}` })).id}/proposals`, lena.cookie, plan)).status).toBe(201);
    }
    const sixth = await json(app, "POST", `/contrib/tasks/${(await openTask()).id}/proposals`, lena.cookie, plan);
    expect(sixth.status).toBe(429);
  });

  it("edits and withdraws only your own proposal", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", githubId: 1 });
    const jonas = await contributor({ handle: "jonas", githubId: 2 });
    const task = await openTask();
    const created = await json(app, "POST", `/contrib/tasks/${task.id}/proposals`, lena.cookie, plan);
    expect((await json(app, "PATCH", `/contrib/proposals/${created.body.id}`, jonas.cookie, { eta: "days" })).status).toBe(403);
    const edited = await json(app, "PATCH", `/contrib/proposals/${created.body.id}`, lena.cookie, { eta: "days" });
    expect(edited.body).toMatchObject({ eta: "days", status: "pending" });
    expect((await json(app, "DELETE", `/contrib/proposals/${created.body.id}`, jonas.cookie)).status).toBe(403);
    expect((await json(app, "DELETE", `/contrib/proposals/${created.body.id}`, lena.cookie)).status).toBe(200);
    expect((await json(app, "GET", "/contrib/me/proposals", lena.cookie)).body).toMatchObject([{ withdrawn: true }]);
  });

  it("updates the profile, and a taken handle is a 409 on that field", async () => {
    const { app } = makeApp(db);
    await contributor({ handle: "taken" });
    const lena = await contributor({ handle: "lena" });
    const clash = await json(app, "PATCH", "/contrib/me/profile", lena.cookie, { handle: "taken" });
    expect(clash.status).toBe(409);
    expect(clash.body.issues).toEqual({ handle: ["That handle is taken"] });
    const ok = await json(app, "PATCH", "/contrib/me/profile", lena.cookie, { public: true, bio: "Builds things", links: ["https://lena.dev"] });
    expect(ok.body).toMatchObject({ public: true, bio: "Builds things", links: ["https://lena.dev"] });
  });
});

describe("public reads", () => {
  it("lists and shows tasks without drafts, private names or any email", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", displayName: "Lena Krause", email: "lena@example.com", githubId: 1 });
    const task = await openTask({ status: "assigned", assigneeId: lena.row.id, summary: "A toggle" });
    await openTask({ title: "Hidden draft", status: "draft" });
    await json(app, "POST", `/contrib/tasks/${task.id}/posts`, lena.cookie, { body: "On it" });

    const list = await json(app, "GET", "/public/tasks?status=all", null);
    expect(list.status).toBe(200);
    expect(list.body.tasks.map((t: { id: string }) => t.id)).toEqual([`NW-${task.id}`]);
    const detail = await json(app, "GET", `/public/tasks/NW-${task.id}`, null);
    expect(detail.body.assignee).toEqual({ kind: "contributor", handle: "lena", name: null, avatarUrl: null, public: false });
    for (const body of [list.body, detail.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain("lena@example.com");
      expect(text).not.toContain("Lena Krause");
    }
    expect((await json(app, "GET", "/public/tasks/NW-2", null)).status).toBe(404);
    expect((await json(app, "GET", "/public/tasks?status=bogus", null)).status).toBe(400);
  });

  it("shows only public profiles; the wall needs merged work", async () => {
    const { app } = makeApp(db);
    const lena = await contributor({ handle: "lena", email: "lena@example.com", public: true });
    await contributor({ handle: "quiet", email: "quiet@example.com" });
    expect((await json(app, "GET", "/public/contributors/quiet", null)).status).toBe(404);
    const profile = await json(app, "GET", "/public/contributors/lena", null);
    expect(profile.status).toBe(200);
    expect(JSON.stringify(profile.body)).not.toContain("@example.com");

    expect((await json(app, "GET", "/public/contributors", null)).body).toEqual({ contributors: [], nextCursor: null });
    await openTask({ status: "done", assigneeId: lena.row.id, doneAt: new Date() });
    const wall = await json(app, "GET", "/public/contributors?sort=az", null);
    expect(wall.body.contributors.map((c: { handle: string }) => c.handle)).toEqual(["lena"]);
    expect((await json(app, "GET", "/public/contributors?cursor=bm9wZQ", null)).status).toBe(400);
    expect((await json(app, "GET", `/public/tasks?cursor=${Buffer.from('["2026-02-31 00:00:00+00",1]').toString("base64url")}`, null)).status).toBe(400);
    expect(JSON.stringify(wall.body)).not.toMatch(/@example\.com|werk/i);
  });
});

describe("CORS", () => {
  const preflight = (app: TestApp, path: string, origin: string) =>
    app.request(path, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });

  it("lets the website call /contrib with credentials, not the admin panel; both sign in at /auth", async () => {
    const { app } = makeApp(db);
    const web = await preflight(app, "/contrib/suggestions", WEB_ORIGIN);
    expect(web.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(web.headers.get("access-control-allow-credentials")).toBe("true");
    expect((await preflight(app, "/contrib/suggestions", ADMIN_ORIGIN)).headers.get("access-control-allow-origin")).toBeNull();
    expect((await preflight(app, "/auth/contributor/email/start", WEB_ORIGIN)).headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    // One sign-in (NB-ADR-0014).
    expect((await preflight(app, "/auth/email/start", ADMIN_ORIGIN)).headers.get("access-control-allow-origin")).toBe(ADMIN_ORIGIN);
    expect((await preflight(app, "/auth/email/start", WEB_ORIGIN)).headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    // /admin stays the admin panel's.
    expect((await preflight(app, "/admin/me", WEB_ORIGIN)).headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("the GitHub App in readEnv", () => {
  const required = { DATABASE_URL: "postgres://localhost/test", GOOGLE_CLIENT_ID: "client", SESSION_SECRET: "x".repeat(40) };

  it("is off without its variables, on with both, and refuses one alone", () => {
    expect(readEnv(required).githubApp).toBeUndefined();
    expect(readEnv({ ...required, GITHUB_APP_CLIENT_ID: "Iv23-test", GITHUB_APP_CLIENT_SECRET: "s" }).githubApp).toEqual({
      clientId: "Iv23-test",
      clientSecret: "s",
    });
    expect(() => readEnv({ ...required, GITHUB_APP_CLIENT_ID: "Iv23-test" })).toThrow(/GITHUB_APP_CLIENT_SECRET/);
  });
});

describe("website cache", () => {
  it("refreshes the contributors pages after a profile change or a deleted account", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { app } = makeApp(db, { env: { webRevalidate: { url: "https://novawerk.io/api/revalidate", secret: "r" } } });
      const lena = await contributor({ handle: "lena", githubId: 1 });
      await json(app, "PATCH", "/contrib/me/profile", lena.cookie, { bio: "Hi" });
      await json(app, "DELETE", "/contrib/me", lena.cookie, { confirmHandle: "lena" });
      expect(fetchMock.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
        expect.objectContaining({ body: JSON.stringify({ tags: ["contributors"] }) }),
        expect.objectContaining({ body: JSON.stringify({ tags: ["contributors"] }) }),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("GitHub's verified email", () => {
  it("is read with the user's token and kept only when primary and verified", async () => {
    const calls: string[] = [];
    const fakeFetch = (emails: unknown) =>
      (async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/access_token")) return Response.json({ access_token: "ghu_x" });
        if (url.endsWith("/user")) return Response.json({ id: 7, login: "neu", name: null, avatar_url: null });
        return Response.json(emails);
      }) as typeof fetch;
    const oauth = (emails: unknown) => createGitHubOAuth({ clientId: "Iv23", clientSecret: "s" }, fakeFetch(emails));
    expect(
      (await oauth([{ email: "Neu@Example.com", primary: true, verified: true }]).exchange("c", "https://x/cb", "v")).email,
    ).toBe("neu@example.com");
    expect((await oauth([{ email: "neu@example.com", primary: true, verified: false }]).exchange("c", "https://x/cb", "v")).email).toBeNull();
    expect((await oauth({ message: "Forbidden" }).exchange("c", "https://x/cb", "v")).email).toBeNull();
    expect(calls).toContain("https://api.github.com/user/emails");
  });
});
