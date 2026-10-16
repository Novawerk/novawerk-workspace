// Novawerk Chat signs in through GET /auth/chat (NB-ADR-0014): a 60-second ticket for the
// signed-in account, signed with CHAT_SSO_SECRET, and nothing for anyone else.

import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, type Database } from "@nw/db";

import { readEnv } from "../src/deps.js";
import { TEST_MEMBERS, WEB_ORIGIN, createTestDb, makeApp, resetDb, sessionCookie } from "./helpers.js";

const CHAT = "https://chat.novawerk.io";
const SECRET = "chat-sso-secret-0123456789-abcdefghij";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
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
    });
    expect(payload.exp! - payload.iat!).toBe(60);
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gives a member the member role, and a GitHub-only account its GitHub address", async () => {
    await db.insert(members).values({ id: "lena", handle: "lena", displayName: "Lena", githubId: 3, notifyEmail: "lena@gh.example" });
    const { location } = await goToChat("lena");
    const { payload } = await jwtVerify(location.searchParams.get("ticket")!, new TextEncoder().encode(SECRET));
    expect(payload).toMatchObject({ sub: "lena", email: "lena@gh.example", role: "member" });
  });

  it("sends someone signed out to the website's sign-in, which comes back to the chat", async () => {
    const { location } = await goToChat();
    expect(location.toString()).toBe(`${WEB_ORIGIN}/sign-in?returnTo=${encodeURIComponent(`${CHAT}/`)}`);
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
