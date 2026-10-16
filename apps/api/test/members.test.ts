import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { members, projectMembers, projectSubmissions, projects, type Database } from "@nw/db";

import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, joinATeam, makeApp, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

describe("GET /admin/members", () => {
  it("lists active members first, then by name", async () => {
    const { app } = makeApp(db);
    const rows = await adminJson<{ id: string; active: boolean }[]>(app, "GET", "/admin/members");
    expect(rows.map((r) => r.id)).toEqual(["ada", "grace", "linus"]);
    expect(rows.at(-1)).toMatchObject({ id: "linus", active: false });
  });
});

describe("POST /admin/members", () => {
  it("adds a member with a lowercased email, joined today", async () => {
    const { app } = makeApp(db);
    const res = await adminFetch(app, "POST", "/admin/members", {
      id: "margaret",
      displayName: "Margaret Hamilton",
      email: "Margaret@Example.org",
      canAdmin: true,
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      id: "margaret",
      email: "margaret@example.org",
      canAdmin: true,
      active: true,
      joinedOn: new Date().toISOString().slice(0, 10),
      initiatorOf: [],
    });
  });

  it("refuses a taken handle or a taken email (any case)", async () => {
    const { app } = makeApp(db);
    const taken = await adminFetch(app, "POST", "/admin/members", { id: "grace", displayName: "G", email: "g2@x.org" });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ issues: { id: ["Another member or contributor already has this handle"] } });

    const sameEmail = await adminFetch(app, "POST", "/admin/members", {
      id: "grace-two",
      displayName: "G",
      email: "GRACE@novawerk.io",
    });
    expect(sameEmail.status).toBe(409);
    expect(await sameEmail.json()).toMatchObject({ issues: { email: ["grace already uses this email"] } });
  });

  it("validates the handle", async () => {
    const res = await adminFetch(makeApp(db).app, "POST", "/admin/members", {
      id: "Not A Handle",
      displayName: "X",
      email: "x@example.org",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: object }).issues).toHaveProperty("id");
  });

  it("makes a new member the Initiator of projects from their accepted pitches", async () => {
    const [pitch] = await db
      .insert(projectSubmissions)
      .values({
        name: "Lena",
        email: "Lena@Example.org",
        projectName: "Kiez Pantry",
        product: "p",
        userJourney: "u",
        referencesAndInnovation: "r",
        team: "t",
        timeline: "tl",
        consentAt: new Date(),
        status: "accepted",
      })
      .returning();
    const [project] = await db
      .insert(projects)
      .values({ slug: "kiez-pantry", title: "Kiez Pantry", submissionId: pitch!.id })
      .returning();

    const created = await adminJson(
      makeApp(db).app,
      "POST",
      "/admin/members",
      { id: "lena", handle: "lena", displayName: "Lena", email: "lena@example.org" },
      201,
    );
    expect(created.initiatorOf).toEqual([project!.id]);
    expect(await db.select().from(projectMembers)).toEqual([
      { projectId: project!.id, memberId: "lena", role: "Initiator" },
    ]);
  });
});

describe("PATCH /admin/members/:id", () => {
  it("updates name, admin access and active", async () => {
    const { app } = makeApp(db);
    const res = await adminFetch(app, "PATCH", "/admin/members/grace", {
      displayName: "Grace Hopper",
      canAdmin: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "grace", displayName: "Grace Hopper", canAdmin: true, active: true });

    await adminJson(app, "PATCH", "/admin/members/grace", { active: false });
    const [row] = await db.select().from(members).where(eq(members.id, "grace"));
    expect(row).toMatchObject({ active: false, role: "maintainer" });
  });

  it("does not let you lock yourself out", async () => {
    const { app } = makeApp(db);
    const admin = await adminFetch(app, "PATCH", "/admin/members/ada", { canAdmin: false });
    expect(admin.status).toBe(400);
    expect(await admin.json()).toMatchObject({ issues: { canAdmin: ["You can't remove your own admin access"] } });
    expect((await adminFetch(app, "PATCH", "/admin/members/ada", { active: false })).status).toBe(400);
    // Renaming yourself is fine.
    expect((await adminFetch(app, "PATCH", "/admin/members/ada", { displayName: "Ada L." })).status).toBe(200);
  });

  it("answers 404 for an unknown member and 400 for an empty patch", async () => {
    const { app } = makeApp(db);
    expect((await adminFetch(app, "PATCH", "/admin/members/nobody", { active: true })).status).toBe(404);
    expect((await adminFetch(app, "PATCH", "/admin/members/grace", {})).status).toBe(400);
  });

  it("revoking admin access closes the admin areas at once; the member can still sign in", async () => {
    const { app } = makeApp(db);
    await joinATeam(db, "grace");
    await adminJson(app, "PATCH", "/admin/members/grace", { canAdmin: true });
    expect((await adminFetch(app, "GET", "/admin/outbox", undefined, "grace")).status).toBe(200);
    await adminJson(app, "PATCH", "/admin/members/grace", { canAdmin: false });
    expect((await adminFetch(app, "GET", "/admin/outbox", undefined, "grace")).status).toBe(403);
    expect((await adminFetch(app, "GET", "/admin/me", undefined, "grace")).status).toBe(200);
  });
});
