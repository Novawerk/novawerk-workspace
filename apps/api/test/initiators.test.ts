// A Member's own public profile over HTTP (NB-ADR-0013): only they switch it on, through
// PATCH /admin/me; initiators then show on /public/contributors and /public/initiators.

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { members, projectMembers, projects, type Database } from "@nw/db";

import { TEST_MEMBERS, adminFetch, createTestDb, makeApp, resetDb } from "./helpers.js";

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

describe("PATCH /admin/me", () => {
  it("lets any member switch on their own public profile, and change its handle", async () => {
    const { app } = makeApp(db);
    const me = await adminFetch(app, "GET", "/admin/me", undefined, "grace");
    expect(await me.json()).toMatchObject({ id: "grace", publicProfile: false, profileHandle: "grace" });

    const on = await adminFetch(app, "PATCH", "/admin/me", { publicProfile: true, profileHandle: "grace-h", profileBio: "Started Quiet Desk" }, "grace");
    expect(await on.json()).toMatchObject({ publicProfile: true, profileHandle: "grace-h", profileBio: "Started Quiet Desk" });

    const taken = await adminFetch(app, "PATCH", "/admin/me", { profileHandle: "grace-h" }, "ada");
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
    expect((await adminFetch(app, "PATCH", "/admin/me", { publicProfile: false }, null)).status).toBe(401);
    await adminFetch(app, "PATCH", "/admin/me", { profileHandle: "ada" }, "ada");
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
      await adminFetch(app, "PATCH", "/admin/me", { profileHandle: "grace-h" }, "grace");
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
