// /admin/projects: portfolio CRUD, the team, and the website refresh after every change.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { members, projectMembers, projects, type Database } from "@nw/db";

import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

const HOOK = { url: "https://novawerk.io/api/revalidate", secret: "s3cret" };

let db: Database;
let fetchSpy: MockInstance<typeof fetch>;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});
afterEach(() => {
  fetchSpy.mockRestore();
});

const KIEZ = { slug: "kiez-pantry", title: "Kiez Pantry", description: "Surplus food from small shops." };

describe("POST /admin/projects", () => {
  it("creates a draft by default and pings the website", async () => {
    const { app } = makeApp(db, { env: { webRevalidate: HOOK } });
    const res = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, tagline: "", link: "" }, 201);
    expect(res).toMatchObject({
      project: { ...KIEZ, status: "draft", tagline: null, link: null, featured: false, sortOrder: 100, team: [] },
      website: "updated",
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(HOOK.url);
    expect(init).toMatchObject({ method: "POST", headers: { "x-revalidate-secret": "s3cret" } });
  });

  it("says when the website hook is not set up or fails, and still saves", async () => {
    const plain = await adminJson(makeApp(db).app, "POST", "/admin/projects", KIEZ, 201);
    expect(plain.website).toBe("not-configured");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { app, logger } = makeApp(db, { env: { webRevalidate: HOOK } });
    const failed = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, slug: "other" }, 201);
    expect(failed.website).toBe("failed");
    expect(logger.warn).toHaveBeenCalled();

    fetchSpy.mockResolvedValueOnce(new Response("no", { status: 401 }));
    const refused = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, slug: "third" }, 201);
    expect(refused.website).toBe("failed");
    expect(await db.select().from(projects)).toHaveLength(3);
  });

  it("refuses a taken slug and bad links", async () => {
    const { app } = makeApp(db);
    await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    const clash = await adminFetch(app, "POST", "/admin/projects", KIEZ);
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ issues: { slug: ["Another project already uses this slug"] } });

    const badCover = await adminFetch(app, "POST", "/admin/projects", { ...KIEZ, slug: "x-y", coverUrl: "http://x.org/a.png" });
    expect(badCover.status).toBe(400);
    expect(((await badCover.json()) as { issues: object }).issues).toHaveProperty("coverUrl");
  });
});

describe("GET /admin/projects", () => {
  it("lists every status in website order, with each team", async () => {
    const { app } = makeApp(db);
    const a = await adminJson(app, "POST", "/admin/projects", { slug: "aa", title: "Zeta", status: "launched", featured: true }, 201);
    await adminJson(app, "POST", "/admin/projects", { slug: "bb", title: "Alpha", status: "archived", sortOrder: 5 }, 201);
    await adminJson(app, "POST", "/admin/projects", { slug: "cc", title: "Beta" }, 201);
    await adminJson(app, "PUT", `/admin/projects/${a.project.id}/members`, { members: [{ memberId: "grace", role: "Developer" }] });

    const list = await adminJson(app, "GET", "/admin/projects");
    expect(list.map((p: { title: string }) => p.title)).toEqual(["Zeta", "Alpha", "Beta"]);
    expect(list[0].team).toEqual([{ memberId: "grace", displayName: "Grace", role: "Developer" }]);

    const one = await adminJson(app, "GET", `/admin/projects/${a.project.id}`);
    expect(one).toMatchObject({ slug: "aa", team: [{ memberId: "grace" }] });
    expect((await adminFetch(app, "GET", "/admin/projects/00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});

describe("PATCH /admin/projects/:id", () => {
  it("updates fields, clears with null, and pings the website", async () => {
    const { app } = makeApp(db, { env: { webRevalidate: HOOK } });
    const { project } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, tagline: "Old" }, 201);
    fetchSpy.mockClear();

    const res = await adminJson(app, "PATCH", `/admin/projects/${project.id}`, {
      status: "planning",
      featured: true,
      sortOrder: 1,
      body: "# Kiez Pantry\n\nWe share food.",
      coverUrl: "https://cdn.novawerk.io/kiez.png",
      tagline: null,
    });
    expect(res).toMatchObject({
      project: { status: "planning", featured: true, sortOrder: 1, tagline: null, coverUrl: "https://cdn.novawerk.io/kiez.png" },
      website: "updated",
    });
    expect(fetchSpy).toHaveBeenCalledOnce();

    // The public list now shows it.
    const publicList = (await (await app.request("/public/projects")).json()) as { slug: string }[];
    expect(publicList.map((p) => p.slug)).toEqual(["kiez-pantry"]);
  });

  it("refuses a slug another project uses; 404 for unknown; 400 for empty", async () => {
    const { app } = makeApp(db);
    await adminJson(app, "POST", "/admin/projects", { slug: "taken", title: "T" }, 201);
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    expect((await adminFetch(app, "PATCH", `/admin/projects/${project.id}`, { slug: "taken" })).status).toBe(409);
    expect((await adminFetch(app, "PATCH", "/admin/projects/00000000-0000-0000-0000-000000000000", { title: "x" })).status).toBe(404);
    expect((await adminFetch(app, "PATCH", `/admin/projects/${project.id}`, {})).status).toBe(400);
  });
});

describe("PUT /admin/projects/:id/members", () => {
  it("replaces the whole team", async () => {
    const { app } = makeApp(db, { env: { webRevalidate: HOOK } });
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    await adminJson(app, "PUT", `/admin/projects/${project.id}/members`, {
      members: [
        { memberId: "ada", role: "Initiator" },
        { memberId: "grace", role: "Developer" },
      ],
    });
    const res = await adminJson(app, "PUT", `/admin/projects/${project.id}/members`, {
      members: [{ memberId: "grace", role: "Design" }],
    });
    expect(res).toEqual({ team: [{ memberId: "grace", displayName: "Grace", role: "Design" }], website: "updated" });
    expect(await db.select().from(projectMembers)).toHaveLength(1);

    expect(await adminJson(app, "PUT", `/admin/projects/${project.id}/members`, { members: [] })).toMatchObject({ team: [] });
  });

  it("refuses unknown members and duplicates; 404 for unknown projects", async () => {
    const { app } = makeApp(db);
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    const unknown = await adminFetch(app, "PUT", `/admin/projects/${project.id}/members`, {
      members: [{ memberId: "nobody", role: "Developer" }],
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ issues: { members: ["Unknown member: nobody"] } });
    const dup = await adminFetch(app, "PUT", `/admin/projects/${project.id}/members`, {
      members: [
        { memberId: "ada", role: "A" },
        { memberId: "ada", role: "B" },
      ],
    });
    expect(dup.status).toBe(400);
    const missing = await adminFetch(app, "PUT", "/admin/projects/00000000-0000-0000-0000-000000000000/members", { members: [] });
    expect(missing.status).toBe(404);
  });
});

describe("DELETE /admin/projects/:id", () => {
  it("deletes the project and its team, then pings the website", async () => {
    const { app } = makeApp(db, { env: { webRevalidate: HOOK } });
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    await adminJson(app, "PUT", `/admin/projects/${project.id}/members`, { members: [{ memberId: "ada", role: "Initiator" }] });
    fetchSpy.mockClear();

    expect(await adminJson(app, "DELETE", `/admin/projects/${project.id}`)).toEqual({ ok: true, website: "updated" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(await db.select().from(projects)).toEqual([]);
    expect(await db.select().from(projectMembers)).toEqual([]);
    expect((await adminFetch(app, "DELETE", `/admin/projects/${project.id}`)).status).toBe(404);
  });
});
