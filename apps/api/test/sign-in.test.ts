// One sign-in for everyone (NB-ADR-0014): GitHub, Google or an emailed code, all onto one account,
// which can link more than one of them.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, type Database } from "@nw/db";

import { TEST_MEMBERS, TEST_SECRET, createTestDb, makeApp, postJson, resetDb, sessionCookie } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0];

function codeApp() {
  const sent: { to: string; code: string }[] = [];
  const { app } = makeApp(db, { sendSignInCode: async (to, code) => void sent.push({ to, code }) });
  return { app, sent };
}

describe("one account, several ways in", () => {
  it("signs in to the same account with Google and with an emailed code", async () => {
    const { app, sent } = codeApp();
    const google = await app.request("/auth/google", postJson({ credential: "google:mira@example.com" }));
    const first = (await google.json()) as { id: string };
    await app.request("/auth/email/start", postJson({ email: "Mira@Example.com" }));
    const code = await app.request("/auth/email/verify", postJson({ email: "mira@example.com", code: sent[0]!.code }));
    expect(await code.json()).toMatchObject({ id: first.id });
    expect(await db.select().from(members).where(eq(members.email, "mira@example.com"))).toHaveLength(1);
  });

  it("links an address to a GitHub-only account, once", async () => {
    const { app } = makeApp(db);
    await db.insert(members).values({ id: "lena", handle: "lena", displayName: "Lena", githubId: 9 });
    const lena = await sessionCookie("lena");

    // Without a session there is nothing to link to.
    const anonymous = await app.request("/auth/google", postJson({ credential: "google:lena@example.com", link: true }));
    expect(anonymous.status).toBe(401);

    const linked = await app.request("/auth/google", postJson({ credential: "google:lena@example.com", link: true }, { Cookie: lena }));
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({ id: "lena", email: "lena@example.com", github: { id: 9 } });
    // A new way in ends the old sessions; the answer's cookie works.
    expect((await app.request("/auth/me", { headers: { Cookie: lena } })).status).toBe(401);
    const fresh = cookieOf(linked)!;
    expect((await app.request("/auth/me", { headers: { Cookie: fresh } })).status).toBe(200);

    // Google alone now finds the same account.
    const again = await app.request("/auth/google", postJson({ credential: "google:lena@example.com" }));
    expect(await again.json()).toMatchObject({ id: "lena" });

    // One address per account, and an address belongs to one account.
    const second = await app.request("/auth/google", postJson({ credential: "google:lena@other.example", link: true }, { Cookie: fresh }));
    expect(second.status).toBe(409);
    const taken = await app.request("/auth/google", postJson({ credential: "google:grace@novawerk.io", link: true }, { Cookie: fresh }));
    expect(taken.status).toBe(409);
    const [row] = await db.select().from(members).where(eq(members.id, "lena"));
    expect(row?.email).toBe("lena@example.com");
  });

  it("answers /auth/me with the role and whether the admin panel opens", async () => {
    const { app } = makeApp(db);
    expect((await app.request("/auth/me")).status).toBe(401);
    const ada = await app.request("/auth/me", { headers: { Cookie: await sessionCookie("ada") } });
    expect(await ada.json()).toMatchObject({ id: "ada", role: "maintainer", adminPanel: true });
    const grace = await app.request("/auth/me", { headers: { Cookie: await sessionCookie("grace") } });
    expect(await grace.json()).toMatchObject({ id: "grace", role: "member", adminPanel: false });
    // An inactive account is signed out everywhere.
    expect((await app.request("/auth/me", { headers: { Cookie: await sessionCookie("linus") } })).status).toBe(401);
  });

  it("refuses the session cookies of the two-account days", async () => {
    const { app } = makeApp(db);
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(TEST_SECRET);
    for (const audience of ["nw-admin", "nw-contributor"]) {
      const old = await new SignJWT({ ims: Date.now() })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject("ada")
        .setIssuer("nw-api")
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key);
      for (const name of ["nw_session", "nw_contributor"]) {
        expect((await app.request("/auth/me", { headers: { Cookie: `${name}=${old}` } })).status, `${name} ${audience}`).toBe(401);
        expect((await app.request("/admin/me", { headers: { Cookie: `${name}=${old}` } })).status, `${name} ${audience}`).toBe(401);
      }
    }
  });
});
