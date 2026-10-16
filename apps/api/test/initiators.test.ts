// A member's own public profile over HTTP (NB-ADR-0013): only they switch it on, in one place
// (novawerk.io/settings: PATCH /contrib/me/profile, NB-ADR-0014); initiators then show on
// /public/contributors and /public/initiators.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { members, projectMembers, projects, type Database } from "@nw/db";

import { TEST_MEMBERS, WEB_ORIGIN, adminFetch, contributorCookie, createTestDb, makeApp, resetDb } from "./helpers.js";

/** PATCH /contrib/me/profile from the website, as `who`. */
async function editProfile(app: ReturnType<typeof makeApp>["app"], who: string | null, body: unknown) {
  return app.request("/contrib/me/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: WEB_ORIGIN,
      ...(who ? { Cookie: await contributorCookie(who) } : {}),
    },
    body: JSON.stringify(body),
  });
}

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  const [p] = await db.insert(projects).values({ slug: "quiet-desk", title: "Quiet Desk", status: "building" }).returning();
  await db.insert(projectMembers).values({ projectId: p!.id, memberId: "grace", role: "Initiator" });
});

describe("a member's public profile", () => {
  it("lets any member switch on their own public profile, and change its handle", async () => {
    const { app } = makeApp(db);
    const me = await adminFetch(app, "GET", "/admin/me", undefined, "grace");
    expect(await me.json()).toMatchObject({ id: "grace", publicProfile: false, profileHandle: "grace" });

    const on = await editProfile(app, "grace", { public: true, handle: "grace-h", bio: "Started Quiet Desk" });
    expect(await on.json()).toMatchObject({ public: true, handle: "grace-h", bio: "Started Quiet Desk" });
    expect(await (await adminFetch(app, "GET", "/admin/me", undefined, "grace")).json()).toMatchObject({ publicProfile: true, profileHandle: "grace-h" });

    const taken = await editProfile(app, "ada", { handle: "grace-h" });
    expect(taken.status).toBe(409);

    const wall = (await (await app.request("/public/contributors")).json()) as any;
    expect(wall.contributors).toEqual([
      expect.objectContaining({ kind: "initiator", handle: "grace-h", project: { slug: "quiet-desk", title: "Quiet Desk" } }),
    ]);
    expect(JSON.stringify(wall)).not.toContain("@novawerk.io");
    expect(await (await app.request("/public/initiators")).json()).toMatchObject([{ handle: "grace-h", project: { slug: "quiet-desk" } }]);
    expect(await (await app.request("/public/contributors/grace-h")).json()).toMatchObject({ kind: "initiator", name: "Grace" });
  });

  it("needs a session, and changes only the caller", async () => {
    const { app } = makeApp(db);
    expect((await editProfile(app, null, { public: false })).status).toBe(401);
    expect((await adminFetch(app, "PATCH", "/admin/me", { publicProfile: true }, "grace")).status).toBe(404);
    await editProfile(app, "ada", { handle: "ada-l" });
    const grace = (await (await adminFetch(app, "GET", "/admin/me", undefined, "grace")).json()) as any;
    expect(grace.profileHandle).toBe("grace");
  });
});

describe("website cache", () => {
  it("refreshes the wall after a member's profile change and a project change", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { app } = makeApp(db, { env: { webRevalidate: { url: "https://novawerk.io/api/revalidate", secret: "r" } } });
      await editProfile(app, "grace", { handle: "grace-h" });
      const [project] = await db.select().from(projects);
      await adminFetch(app, "PATCH", `/admin/projects/${project!.id}`, { title: "Quiet Desk Berlin" });
      const bodies = fetchMock.mock.calls.map((call) => ((call as unknown[])[1] as RequestInit).body);
      expect(bodies).toEqual([JSON.stringify({ tags: ["contributors"] }), JSON.stringify({ tags: ["projects", "contributors"] })]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("member ids share the handle namespace", () => {
  it("refuses a new member id a contributor already has, and counts up when accepting", async () => {
    await db.insert(members).values({ handle: "lena-k", displayName: "Lena" });
    const { app } = makeApp(db);
    const clash = await adminFetch(app, "POST", "/admin/members", { id: "lena-k", displayName: "Lena Member", email: "lena@novawerk.io" });
    expect(clash.status).toBe(409);
    expect(((await clash.json()) as any).issues.id).toBeDefined();
    expect((await adminFetch(app, "POST", "/admin/members", { id: "lena-m", displayName: "Lena Member", email: "lena@novawerk.io" })).status).toBe(201);
  });
});

describe("suspending someone", () => {
  it("refreshes the wall, where they no longer show", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const [lena] = await db.insert(members).values({ handle: "lena-k", displayName: "Lena" }).returning();
      const { app } = makeApp(db, { env: { webRevalidate: { url: "https://novawerk.io/api/revalidate", secret: "r" } } });
      const res = await adminFetch(app, "POST", `/admin/contributors/${lena!.id}/suspend`, { reason: "Spam" });
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock.mock.calls.map((call) => ((call as unknown[])[1] as RequestInit).body)).toContain(JSON.stringify({ tags: ["contributors"] }));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
