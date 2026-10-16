// Accepting a pitch (→ draft project, and the pitcher becomes a Member and its Initiator) and an
// application (→ member), each in one transaction, plus the Initiator rule from src/admin/accept.ts.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  members,
  memberApplications,
  outbox,
  projectMembers,
  projectSubmissions,
  projects,
  type Database,
} from "@nw/db";

import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

const pitch = (overrides: Partial<typeof projectSubmissions.$inferInsert> = {}) => ({
  name: "Lena Hoffmann",
  email: "lena@example.org",
  projectName: "Kiez Pantry",
  product: "p",
  userJourney: "u",
  referencesAndInnovation: "r",
  team: "t",
  timeline: "tl",
  consentAt: new Date(),
  ...overrides,
});

const application = (overrides: Partial<typeof memberApplications.$inferInsert> = {}) => ({
  name: "Noor Haddad",
  email: "Noor@Example.org",
  functions: ["design"],
  background: "b",
  motivation: "m",
  availability: "2to5",
  consentAt: new Date(),
  ...overrides,
});

async function insertPitch(overrides: Parameters<typeof pitch>[0] = {}) {
  const [row] = await db.insert(projectSubmissions).values(pitch(overrides)).returning();
  return row!;
}

async function insertApplication(overrides: Parameters<typeof application>[0] = {}) {
  const [row] = await db.insert(memberApplications).values(application(overrides)).returning();
  return row!;
}

describe("POST /admin/submissions/:id/accept", () => {
  it("creates a draft project linked to the pitch and accepts it", async () => {
    const { id } = await insertPitch();
    const result = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(result).toMatchObject({
      submission: { id, status: "accepted" },
      project: {
        slug: "kiez-pantry",
        title: "Kiez Pantry",
        status: "draft",
        submissionId: id,
        year: new Date().getUTCFullYear(),
      },
      projectCreated: true,
      initiator: { id: "lena-hoffmann", displayName: "Lena Hoffmann" },
      memberCreated: true,
      addedAsMember: true,
    });
    expect(await db.select().from(projectMembers)).toEqual([
      { projectId: result.project.id, memberId: "lena-hoffmann", role: "Initiator" },
    ]);

    const detail = await adminJson(makeApp(db).app, "GET", `/admin/submissions/${id}`);
    expect(detail.projectId).toBe(result.project.id);
  });

  it("links the Initiator right away when the submitter is already a member", async () => {
    const { id } = await insertPitch({ email: "GRACE@novawerk.io" });
    const result = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(result.initiator).toEqual({ id: "grace", displayName: "Grace" });
    expect(await db.select().from(projectMembers)).toEqual([
      { projectId: result.project.id, memberId: "grace", role: "Initiator" },
    ]);
  });

  it("takes a custom slug and title, refuses a taken slug, and makes free slugs otherwise", async () => {
    const { app } = makeApp(db);
    await db.insert(projects).values({ slug: "kiez-pantry", title: "Taken" });

    const first = await insertPitch();
    const auto = await adminJson(app, "POST", `/admin/submissions/${first.id}/accept`, {});
    expect(auto.project.slug).toBe("kiez-pantry-2");

    const second = await insertPitch();
    const custom = await adminJson(app, "POST", `/admin/submissions/${second.id}/accept`, {
      slug: "pantry",
      title: "Pantry",
    });
    expect(custom.project).toMatchObject({ slug: "pantry", title: "Pantry" });

    const third = await insertPitch();
    const clash = await adminFetch(app, "POST", `/admin/submissions/${third.id}/accept`, { slug: "pantry" });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ issues: { slug: ["Another project already uses this slug"] } });
    // Nothing changed for the refused pitch (one transaction).
    const [row] = await db.select().from(projectSubmissions).where(eq(projectSubmissions.id, third.id));
    expect(row!.status).toBe("new");
  });

  it("is idempotent: accepting again reuses the project", async () => {
    const { app } = makeApp(db);
    const { id } = await insertPitch();
    const first = await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    await adminJson(app, "PATCH", `/admin/submissions/${id}`, { status: "discussing" });
    const again = await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(again).toMatchObject({ projectCreated: false, project: { id: first.project.id } });
    expect(await db.select().from(projects)).toHaveLength(1);
  });

  it("answers 404 for unknown pitches", async () => {
    const { app } = makeApp(db);
    expect((await adminFetch(app, "POST", "/admin/submissions/00000000-0000-0000-0000-000000000000/accept", {})).status).toBe(404);
    expect((await adminFetch(app, "POST", "/admin/submissions/nope/accept", {})).status).toBe(404);
  });

  it("PATCH cannot set accepted without a project; with one it can", async () => {
    const { app } = makeApp(db);
    const { id } = await insertPitch();
    const res = await adminFetch(app, "PATCH", `/admin/submissions/${id}`, { status: "accepted" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ issues: { status: [expect.stringContaining("Accept and create project")] } });

    await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    await adminJson(app, "PATCH", `/admin/submissions/${id}`, { status: "discussing" });
    expect((await adminFetch(app, "PATCH", `/admin/submissions/${id}`, { status: "accepted" })).status).toBe(200);
  });
});

describe("accepting a pitch makes the pitcher a Member", () => {
  it("creates the Member with the pitch's name and email, no admin rights, joined today", async () => {
    const { id } = await insertPitch({ name: "  Lena Hoffmann ", email: "Lena@Example.org" });
    const { app } = makeApp(db);
    const result = await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    const [member] = await db.select().from(members).where(eq(members.id, "lena-hoffmann"));
    expect(member).toMatchObject({
      displayName: "Lena Hoffmann",
      email: "lena@example.org",
      role: "member",
      active: true,
      joinedOn: new Date().toISOString().slice(0, 10),
    });
    // They sign in to the admin panel and see their own project, nothing else.
    const projectsSeen = await adminFetch(app, "GET", "/admin/projects", undefined, "lena-hoffmann");
    expect(((await projectsSeen.json()) as { id: string }[]).map((p) => p.id)).toEqual([result.project.id]);
    expect((await adminFetch(app, "GET", "/admin/submissions", undefined, "lena-hoffmann")).status).toBe(403);
  });

  it("is idempotent: accepting twice makes one Member and one Initiator row", async () => {
    const { id } = await insertPitch();
    const { app } = makeApp(db);
    await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    const again = await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(again).toMatchObject({ projectCreated: false, memberCreated: false, addedAsMember: false, initiator: { id: "lena-hoffmann" } });
    expect(await db.select().from(members).where(eq(members.email, "lena@example.org"))).toHaveLength(1);
    expect(await db.select().from(projectMembers)).toHaveLength(1);
  });

  it("links the active Member for a second pitch from the same address, as they are", async () => {
    const { app } = makeApp(db);
    const first = await insertPitch({ projectName: "First" });
    const second = await insertPitch({ name: "Lena H.", email: "LENA@example.org", projectName: "Second" });
    await adminJson(app, "POST", `/admin/submissions/${first.id}/accept`, {});
    const result = await adminJson(app, "POST", `/admin/submissions/${second.id}/accept`, {});
    expect(result).toMatchObject({
      memberCreated: false,
      addedAsMember: false,
      initiator: { id: "lena-hoffmann", displayName: "Lena Hoffmann" },
    });
    expect(await db.select().from(projectMembers)).toHaveLength(2);
  });

  it("never reactivates a deactivated member, and never touches admin rights", async () => {
    // linus (TEST_MEMBERS) is an admin who was deactivated.
    const { app } = makeApp(db);
    const { id } = await insertPitch({ name: "Linus", email: "LINUS@novawerk.io", projectName: "Takeover" });
    const res = await adminFetch(app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Linus (linus) is deactivated. Reactivate them in Members first." });
    expect((await db.select().from(members).where(eq(members.id, "linus")))[0]).toMatchObject({ active: false, role: "maintainer" });
    // Nothing else happened either: the whole accept rolled back.
    expect(await db.select().from(projects)).toEqual([]);
    expect((await db.select().from(projectSubmissions))[0]?.status).toBe("new");
    // Their old session stays useless.
    expect((await adminFetch(app, "GET", "/admin/submissions", undefined, "linus")).status).toBe(401);
  });

  it("re-accepting leaves membership and the team alone after a handover", async () => {
    const { app } = makeApp(db);
    const { id } = await insertPitch();
    const first = await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    // Lena hands over to Grace and leaves.
    await db.delete(projectMembers);
    await db.insert(projectMembers).values({ projectId: first.project.id, memberId: "grace", role: "Initiator" });
    await db.update(members).set({ active: false }).where(eq(members.id, "lena-hoffmann"));
    const again = await adminJson(app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(again).toMatchObject({ firstAcceptance: false, initiator: { id: "grace" }, emailQueued: false });
    expect((await db.select().from(members).where(eq(members.id, "lena-hoffmann")))[0]?.active).toBe(false);
    expect(await db.select().from(projectMembers)).toEqual([{ projectId: first.project.id, memberId: "grace", role: "Initiator" }]);
  });

  it("makes one Member and queues one note when two accepts race", async () => {
    const { app } = makeApp(db);
    const a = await insertPitch({ projectName: "A" });
    const b = await insertPitch({ projectName: "B" });
    const [ra, rb] = await Promise.all([
      adminFetch(app, "POST", `/admin/submissions/${a.id}/accept`, {}),
      adminFetch(app, "POST", `/admin/submissions/${b.id}/accept`, {}),
    ]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(await db.select().from(members).where(eq(members.email, "lena@example.org"))).toHaveLength(1);
    // A double click on the same pitch: one acceptance note.
    const c = await insertPitch({ projectName: "C" });
    await Promise.all([1, 2].map(() => adminFetch(app, "POST", `/admin/submissions/${c.id}/accept`, {})));
    expect(await db.select().from(outbox).where(eq(outbox.relatedId, c.id))).toHaveLength(1);
  });

  it("falls back to the email's local part when the name gives fewer than 2 characters", async () => {
    const { app } = makeApp(db);
    const zh = await insertPitch({ name: "林晨", email: "lin.chen@example.org", projectName: "血压记录" });
    expect((await adminJson(app, "POST", `/admin/submissions/${zh.id}/accept`, {})).initiator.id).toBe("lin-chen");
    const one = await insertPitch({ name: "A", email: "ab@example.org", projectName: "One letter" });
    expect((await adminJson(app, "POST", `/admin/submissions/${one.id}/accept`, {})).initiator.id).toBe("ab");
  });

  it("says before accepting what will happen about the pitcher", async () => {
    const { app } = makeApp(db);
    const fresh = await insertPitch();
    expect((await adminJson(app, "GET", `/admin/submissions/${fresh.id}`)).pitcher).toEqual({ kind: "create", handle: "lena-hoffmann" });
    const known = await insertPitch({ email: "Grace@novawerk.io", projectName: "Known" });
    expect((await adminJson(app, "GET", `/admin/submissions/${known.id}`)).pitcher).toEqual({
      kind: "link",
      member: { id: "grace", displayName: "Grace", active: true, canAdmin: false },
    });
    const gone = await insertPitch({ email: "linus@novawerk.io", projectName: "Gone" });
    expect((await adminJson(app, "GET", `/admin/submissions/${gone.id}`)).pitcher).toMatchObject({
      kind: "link",
      member: { id: "linus", active: false, canAdmin: true },
    });
    // The preview writes nothing.
    expect(await db.select().from(members).where(eq(members.id, "lena-hoffmann"))).toEqual([]);
  });

  it("takes a handle no contributor, member or reserved word has", async () => {
    await db.insert(members).values({ handle: "lena-hoffmann", displayName: "Someone else" });
    await db.insert(members).values({ id: "lena-hoffmann-2", handle: "lena-hoffmann-2", displayName: "Another Lena", email: "other@example.org" });
    const { id } = await insertPitch();
    const result = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(result.initiator.id).toBe("lena-hoffmann-3");

    // A name that makes a reserved id ("admin", "novawerk", "support", "team") gets "member-" in front.
    for (const name of ["Admin", "Novawerk", "Support", "Team"]) {
      const p = await insertPitch({ name, email: `${name.toLowerCase()}-pitcher@example.org`, projectName: `Reserved ${name}` });
      const accepted = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${p.id}/accept`, {});
      expect(accepted.initiator.id).toBe(`member-${name.toLowerCase()}`);
    }
  });

  it("puts the account that already has the pitch's email on the team (one account, NB-ADR-0014)", async () => {
    const [lena] = await db
      .insert(members)
      .values({ handle: "lena-builds", displayName: "Lena", email: "lena@example.org" })
      .returning();
    const { id } = await insertPitch();
    const result = await adminJson(makeApp(db).app, "POST", `/admin/submissions/${id}/accept`, {});
    expect(result).toMatchObject({ memberCreated: false, initiator: { id: lena!.id } });
    expect(await db.select({ id: members.id }).from(members).where(eq(members.email, "lena@example.org"))).toEqual([
      { id: lena!.id },
    ]);
  });

  it("creates nothing when a pitch is declined", async () => {
    const { id } = await insertPitch();
    const before = await db.select({ id: members.id }).from(members);
    expect((await adminFetch(makeApp(db).app, "POST", `/admin/submissions/${id}/decline`, { email: false })).status).toBe(200);
    expect(await db.select({ id: members.id }).from(members)).toEqual(before);
    expect(await db.select().from(projectMembers)).toEqual([]);
  });
});

describe("POST /admin/applications/:id/accept", () => {
  it("creates a member from the application and links it", async () => {
    const { id } = await insertApplication();
    const result = await adminJson(makeApp(db).app, "POST", `/admin/applications/${id}/accept`, {});
    expect(result).toMatchObject({
      application: { id, status: "accepted", memberId: "noor-haddad" },
      member: {
        id: "noor-haddad",
        displayName: "Noor Haddad",
        email: "noor@example.org",
        canAdmin: false,
        active: true,
        joinedOn: new Date().toISOString().slice(0, 10),
      },
      memberCreated: true,
      initiatorOf: [],
    });
  });

  it("takes a chosen handle and name, refuses a taken handle, and picks a free one otherwise", async () => {
    const { app } = makeApp(db);
    const a = await insertApplication({ name: "Grace", email: "grace2@example.org" });
    const auto = await adminJson(app, "POST", `/admin/applications/${a.id}/accept`, {});
    expect(auto.member.id).toBe("grace-2");

    const b = await insertApplication({ email: "b@example.org" });
    const custom = await adminJson(app, "POST", `/admin/applications/${b.id}/accept`, {
      memberId: "noor",
      displayName: "Noor",
    });
    expect(custom.member).toMatchObject({ id: "noor", displayName: "Noor" });

    const c = await insertApplication({ email: "c@example.org" });
    const clash = await adminFetch(app, "POST", `/admin/applications/${c.id}/accept`, { memberId: "ada" });
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({ issues: { memberId: ["Another member or contributor already has this handle"] } });
    const [row] = await db.select().from(memberApplications).where(eq(memberApplications.id, c.id));
    expect(row).toMatchObject({ status: "new", memberId: null });
  });

  it("counts past a contributor's handle and steps around reserved words when it picks the id", async () => {
    const { app } = makeApp(db);
    await db.insert(members).values({ handle: "lena-k", displayName: "Lena" });
    const lena = await insertApplication({ name: "Lena K", email: "lena@example.org" });
    expect((await adminJson(app, "POST", `/admin/applications/${lena.id}/accept`, {})).member.id).toBe("lena-k-2");
    const admin = await insertApplication({ name: "Admin", email: "admin@example.org" });
    expect((await adminJson(app, "POST", `/admin/applications/${admin.id}/accept`, {})).member.id).toBe("member-admin");
    const typed = await insertApplication({ email: "t@example.org" });
    const reserved = await adminFetch(app, "POST", `/admin/applications/${typed.id}/accept`, { memberId: "settings" });
    expect(reserved.status).toBe(400);
  });

  it("links (and reactivates) the member who already has the applicant's email", async () => {
    const { id } = await insertApplication({ email: "Linus@Novawerk.io" });
    const result = await adminJson(makeApp(db).app, "POST", `/admin/applications/${id}/accept`, { memberId: "ignored" });
    expect(result).toMatchObject({ memberCreated: false, member: { id: "linus", active: true } });
    expect(await db.select({ id: members.id }).from(members)).toHaveLength(3);
  });

  it("links the member an accepted pitch already made, who stays its Initiator", async () => {
    const { app } = makeApp(db);
    const p = await insertPitch({ name: "Noor Haddad", email: "noor@example.org" });
    const accepted = await adminJson(app, "POST", `/admin/submissions/${p.id}/accept`, {});
    expect(accepted.initiator).toEqual({ id: "noor-haddad", displayName: "Noor Haddad" });

    const a = await insertApplication();
    const result = await adminJson(app, "POST", `/admin/applications/${a.id}/accept`, {});
    expect(result).toMatchObject({ memberCreated: false, member: { id: "noor-haddad" }, initiatorOf: [] });
    expect(await db.select().from(projectMembers)).toEqual([
      { projectId: accepted.project.id, memberId: "noor-haddad", role: "Initiator" },
    ]);
  });

  it("PATCH cannot set accepted without a member; linking one works", async () => {
    const { app } = makeApp(db);
    const { id } = await insertApplication();
    const res = await adminFetch(app, "PATCH", `/admin/applications/${id}`, { status: "accepted" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ issues: { status: [expect.stringContaining("Accept as member")] } });
    expect((await adminFetch(app, "PATCH", `/admin/applications/${id}`, { status: "accepted", memberId: "grace" })).status).toBe(200);
  });
});
