// Accepting a pitch (→ draft project) and an application (→ member), each in one transaction,
// plus the Initiator rule from src/admin/accept.ts.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  memberApplications,
  members,
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
      initiator: null,
    });
    // The submitter is not a member yet: no Initiator row.
    expect(await db.select().from(projectMembers)).toEqual([]);

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

  it("links (and reactivates) the member who already has the applicant's email", async () => {
    const { id } = await insertApplication({ email: "Linus@Novawerk.io" });
    const result = await adminJson(makeApp(db).app, "POST", `/admin/applications/${id}/accept`, { memberId: "ignored" });
    expect(result).toMatchObject({ memberCreated: false, member: { id: "linus", active: true } });
    expect(await db.select({ id: members.id }).from(members)).toHaveLength(3);
  });

  it("makes the new member the Initiator of their accepted pitch", async () => {
    const { app } = makeApp(db);
    const p = await insertPitch({ email: "noor@example.org" });
    const accepted = await adminJson(app, "POST", `/admin/submissions/${p.id}/accept`, {});
    expect(accepted.initiator).toBeNull();

    const a = await insertApplication();
    const result = await adminJson(app, "POST", `/admin/applications/${a.id}/accept`, {});
    expect(result.initiatorOf).toEqual([accepted.project.id]);
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
