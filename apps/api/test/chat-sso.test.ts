// Novawerk Chat signs in through GET /auth/chat (NB-ADR-0014): a 60-second ticket for the
// signed-in account, signed with CHAT_SSO_SECRET, and nothing for anyone else.

import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { members, werkLedger, type Database } from "@nw/db";

import { readEnv } from "../src/deps.js";
import { TEST_MEMBERS, WEB_ORIGIN, adminFetch, createTestDb, makeApp, resetDb, sessionCookie } from "./helpers.js";

const CHAT = "https://chat.novawerk.io";
const SECRET = "chat-sso-secret-0123456789-abcdefghij";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  // Set up on novawerk.io (handle and pledge), as the chat needs.
  await db.insert(members).values(TEST_MEMBERS.map((m) => ({ ...m, pledgeAcceptedAt: new Date() })));
});

const chatApp = () => makeApp(db, { env: { chatSso: { url: CHAT, secret: SECRET } } }).app;

async function goToChat(who?: string) {
  const res = await chatApp().request("/auth/chat", who ? { headers: { Cookie: await sessionCookie(who) } } : {});
  expect(res.status).toBe(302);
  return { res, location: new URL(res.headers.get("location")!) };
}

describe("GET /auth/chat", () => {
  it("hands a signed-in member to the chat with a short ticket", async () => {
    await db.update(members).set({ avatarUrl: "https://avatars.example/ada", bio: "Builds things" }).where(eq(members.id, "ada"));
    const { res, location } = await goToChat("ada");
    expect(`${location.origin}${location.pathname}`).toBe(`${CHAT}/sso/novawerk`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { payload, protectedHeader } = await jwtVerify(location.searchParams.get("ticket")!, new TextEncoder().encode(SECRET), {
      issuer: "nw-api",
      audience: "novawerk-chat",
      algorithms: ["HS256"],
    });
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload).toMatchObject({
      sub: "ada",
      email: "ada@novawerk.io",
      name: "Ada",
      handle: "ada",
      avatar: "https://avatars.example/ada",
      bio: "Builds things",
      role: "maintainer",
      // A private profile (the default): no Werk, no link.
      public: false,
      werk: null,
      profile_url: null,
    });
    expect(payload.exp! - payload.iat!).toBe(60);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gives a member the member role, and a GitHub-only account its GitHub address", async () => {
    await db.insert(members).values({ id: "lena", handle: "lena", displayName: "Lena", githubId: 3, notifyEmail: "lena@gh.example", pledgeAcceptedAt: new Date() });
    const { location } = await goToChat("lena");
    const { payload } = await jwtVerify(location.searchParams.get("ticket")!, new TextEncoder().encode(SECRET));
    expect(payload).toMatchObject({ sub: "lena", email: "lena@gh.example", role: "member" });
  });

  it("sends someone signed out to the website's sign-in, which comes back to the chat", async () => {
    const { location } = await goToChat();
    expect(location.toString()).toBe(`${WEB_ORIGIN}/sign-in?returnTo=${encodeURIComponent(`${CHAT}/`)}`);
  });

  it("sends a new account to set itself up on the website first, which then comes back to the chat", async () => {
    await db.insert(members).values([
      // An email sign-up still on its placeholder handle, pledge accepted.
      { id: "c1", handle: "contributor-1a2b", displayName: "contributor-1a2b", email: "new@example.org", pledgeAcceptedAt: new Date() },
      // A GitHub sign-up that hasn't accepted the pledge yet.
      { id: "c2", handle: "octo", displayName: "Octo", githubId: 5, notifyEmail: "octo@gh.example" },
    ]);
    const setupFirst = `${WEB_ORIGIN}/sign-in?returnTo=${encodeURIComponent(`${CHAT}/`)}`;
    expect((await goToChat("c1")).location.toString()).toBe(setupFirst);
    expect((await goToChat("c2")).location.toString()).toBe(setupFirst);
  });

  it("issues nothing to a suspended account or one without an address", async () => {
    await db.insert(members).values([
      { id: "sam", handle: "sam", displayName: "Sam", email: "sam@example.org", suspendedAt: new Date() },
      { id: "nia", handle: "nia", displayName: "Nia", githubId: 4 },
    ]);
    expect((await goToChat("sam")).location.toString()).toBe(`${WEB_ORIGIN}/settings?error=chat-suspended`);
    expect((await goToChat("nia")).location.toString()).toBe(`${WEB_ORIGIN}/settings?error=chat-no-email`);
  });

  it("is a 404 without the chat configured", async () => {
    const res = await makeApp(db).app.request("/auth/chat", { headers: { Cookie: await sessionCookie("ada") } });
    expect(res.status).toBe(404);
  });
});

describe("the profile in the chat", () => {
  it("carries Werk and the profile link only for a public profile", async () => {
    await db.update(members).set({ public: true }).where(eq(members.id, "ada"));
    await db.insert(werkLedger).values([
      { contributorId: "ada", delta: 8, reason: "Merged NW-1", pr: "https://github.com/x/y/pull/1" },
      { contributorId: "ada", delta: -1, reason: "Correction" },
    ]);
    const { location } = await goToChat("ada");
    const { payload } = await jwtVerify(location.searchParams.get("ticket")!, new TextEncoder().encode(SECRET));
    expect(payload).toMatchObject({ handle: "ada", public: true, werk: 7, profile_url: `${WEB_ORIGIN}/u/ada` });
  });
});

describe("telling the chat about accounts", () => {
  const sent: { url: string; claims: Record<string, unknown> }[] = [];
  beforeEach(() => {
    sent.length = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const token = String((init.headers as Record<string, string>).Authorization).replace(/^Bearer /, "");
      const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), { issuer: "nw-api", audience: "novawerk-chat-events" });
      sent.push({ url, claims: payload });
      return new Response(null, { status: 204 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("on suspending, closing, a role change and a deleted account", async () => {
    const app = chatApp();
    await db.insert(members).values({ id: "lena", handle: "lena", displayName: "Lena", email: "lena@example.org", githubId: 9 });

    // An older account's id is a handle, not a uuid: it can be suspended too.
    expect((await adminFetch(app, "POST", "/admin/contributors/grace/suspend", { reason: "Spam" })).status).toBe(200);
    expect((await adminFetch(app, "PATCH", "/admin/members/lena", { role: "maintainer" })).status).toBe(200);
    expect((await adminFetch(app, "PATCH", "/admin/members/lena", { active: false })).status).toBe(200);
    expect((await adminFetch(app, "PATCH", "/admin/members/lena", { displayName: "Lena K" })).status).toBe(200);
    await db.update(members).set({ active: true }).where(eq(members.id, "lena"));
    const gone = await app.request("/contrib/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, Cookie: await sessionCookie("lena") },
      body: JSON.stringify({ confirmHandle: "lena" }),
    });
    expect(gone.status).toBe(200);

    expect(sent.map((e) => [e.url, e.claims.sub, e.claims.kind, e.claims.email])).toEqual([
      [`${CHAT}/sso/novawerk/events`, "grace", "closed", "grace@novawerk.io"],
      [`${CHAT}/sso/novawerk/events`, "lena", "role", "lena@example.org"],
      [`${CHAT}/sso/novawerk/events`, "lena", "closed", "lena@example.org"],
      [`${CHAT}/sso/novawerk/events`, "lena", "deleted", "lena@example.org"],
    ]);
    expect(sent[1]!.claims.role).toBe("maintainer");
    expect(sent.every((e) => (e.claims.exp as number) - (e.claims.iat as number) === 60)).toBe(true);
  });

  it("sends the profile after an edit and after a Werk correction", async () => {
    const app = chatApp();
    const edit = await app.request("/contrib/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, Cookie: await sessionCookie("grace") },
      body: JSON.stringify({ public: true, handle: "grace-h", bio: "Ships things" }),
    });
    expect(edit.status).toBe(200);
    // An older account's id is a handle: Werk corrections take it too.
    expect((await adminFetch(app, "POST", "/admin/werk", { contributorId: "grace", delta: 3, reason: "Pairing" })).status).toBe(201);
    expect(sent.map((e) => [e.claims.kind, e.claims.handle, e.claims.public, e.claims.werk, e.claims.profile_url, e.claims.bio])).toEqual([
      ["profile", "grace-h", true, 0, `${WEB_ORIGIN}/u/grace-h`, "Ships things"],
      ["profile", "grace-h", true, 3, `${WEB_ORIGIN}/u/grace-h`, "Ships things"],
    ]);
  });

  it("never fails the request when the chat is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("connection refused");
    });
    expect((await adminFetch(chatApp(), "POST", "/admin/contributors/grace/suspend", { reason: "Spam" })).status).toBe(200);
  });
});

describe("CHAT_URL and CHAT_SSO_SECRET in readEnv", () => {
  const base = { DATABASE_URL: "postgres://x", GOOGLE_CLIENT_ID: "g", SESSION_SECRET: "s".repeat(32) };
  it("needs both, a long secret and an https origin", () => {
    expect(() => readEnv({ ...base, CHAT_URL: CHAT })).toThrow(/CHAT_URL and CHAT_SSO_SECRET/);
    expect(() => readEnv({ ...base, CHAT_URL: CHAT, CHAT_SSO_SECRET: "short" })).toThrow(/at least 32/);
    expect(() => readEnv({ ...base, CHAT_URL: "http://chat.example", CHAT_SSO_SECRET: SECRET })).toThrow(/https origin/);
    expect(readEnv({ ...base, CHAT_URL: `${CHAT}/rooms`, CHAT_SSO_SECRET: SECRET }).config.chatSso).toEqual({ url: CHAT, secret: SECRET });
    expect(readEnv(base).config.chatSso).toBeUndefined();
  });
});
