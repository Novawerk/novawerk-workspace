// The welcome email (NB-ADR-0014): once per account, when it is made, to the address the sign-in
// just proved. Never on a later sign-in or a newly linked way in.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, type Database } from "@nw/db";

import { welcomeOnce } from "../src/welcome.js";
import { TEST_MEMBERS, createTestDb, makeApp, postJson, resetDb, sessionCookie } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS.map((m) => ({ ...m, welcomeSentAt: new Date() })));
});

function welcomeApp() {
  const welcomed: { to: string; name: string; key: string }[] = [];
  const codes: string[] = [];
  const { app } = makeApp(db, {
    sendWelcome: async (to, name, { idempotencyKey }) => void welcomed.push({ to, name, key: idempotencyKey }),
    sendSignInCode: async (_to, code) => void codes.push(code),
  });
  return { app, welcomed, codes };
}

describe("the welcome email", () => {
  it("goes once to a new account made with Google", async () => {
    const { app, welcomed } = welcomeApp();
    const first = await app.request("/auth/google", postJson({ credential: "google:mira@example.com" }));
    const { id } = (await first.json()) as { id: string };
    await app.request("/auth/google", postJson({ credential: "google:mira@example.com" }));
    expect(welcomed).toEqual([{ to: "mira@example.com", name: "", key: `welcome:${id}` }]);
    const [row] = await db.select().from(members).where(eq(members.id, id));
    expect(row?.welcomeSentAt).toBeInstanceOf(Date);
  });

  it("greets an email sign-up without its neutral handle, and never again on the next code", async () => {
    const { app, welcomed, codes } = welcomeApp();
    for (let i = 0; i < 2; i++) {
      await app.request("/auth/email/start", postJson({ email: "new@example.com" }));
      expect((await app.request("/auth/email/verify", postJson({ email: "new@example.com", code: codes.at(-1)! }))).status).toBe(200);
    }
    expect(welcomed).toEqual([expect.objectContaining({ to: "new@example.com", name: "" })]);
  });

  it("isn't sent to accounts from before it, or when a way in is linked", async () => {
    const { app, welcomed } = welcomeApp();
    expect((await app.request("/auth/google", postJson({ credential: "google:grace@novawerk.io" }))).status).toBe(200);
    await db.insert(members).values({ id: "lena", handle: "lena", displayName: "Lena", githubId: 3, welcomeSentAt: new Date() });
    const linked = await app.request("/auth/google", postJson({ credential: "google:lena@example.com", link: true }, { Cookie: await sessionCookie("lena") }));
    expect(linked.status).toBe(200);
    expect(welcomed).toEqual([]);
  });

  it("goes to GitHub's verified address, or is settled without one, once even when asked twice at once", async () => {
    const welcomed: string[] = [];
    const send = async (to: string, name: string) => void welcomed.push(`${name} <${to}>`);
    await db.insert(members).values([
      { id: "gh", handle: "gh", displayName: "Gh", githubId: 5, notifyEmail: "gh@users.example" },
      { id: "nomail", handle: "nomail", displayName: "No mail", githubId: 6 },
    ]);
    const [gh] = await db.select().from(members).where(eq(members.id, "gh"));
    const [nomail] = await db.select().from(members).where(eq(members.id, "nomail"));
    await Promise.all([welcomeOnce(db, gh!, send, console), welcomeOnce(db, gh!, send, console)]);
    await welcomeOnce(db, nomail!, send, console);
    expect(welcomed).toEqual(["Gh <gh@users.example>"]);
    const [settled] = await db.select().from(members).where(eq(members.id, "nomail"));
    expect(settled?.welcomeSentAt).toBeInstanceOf(Date);
  });

  it("never blocks signing in when the email fails", async () => {
    const { app } = makeApp(db, {
      sendWelcome: async () => {
        throw new Error("Resend is down");
      },
    });
    const res = await app.request("/auth/google", postJson({ credential: "google:new@example.org" }));
    expect(res.status).toBe(200);
  });
});
