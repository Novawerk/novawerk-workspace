// A project's lifecycle in the admin API: the timeline of status changes, the launch day,
// deliverables, and the posts planned the moment a project reaches a new stage.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { members, posts, projectStatusChanges, projectSubmissions, type Database } from "@nw/db";

import type { PromoRef } from "../src/types.js";
import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb, validSubmission } from "./helpers.js";

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

const today = () => new Date().toISOString().slice(0, 10);
const KIEZ = { slug: "kiez-pantry", title: "Kiez Pantry", description: "Surplus food from small shops." };

function promoApp() {
  const woken: PromoRef[] = [];
  const { app, logger } = makeApp(db, { triggerPromo: async (ref) => void woken.push(ref) });
  return { app, logger, woken };
}

describe("status changes", () => {
  it("start the timeline at creation and add a line for each change, with who did it", async () => {
    const { app } = promoApp();
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { status: "planning" });
    await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { title: "Kiez Pantry Berlin" });
    await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { status: "building" });

    const history = await adminJson(app, "GET", `/admin/projects/${project.id}/history`);
    expect(history.map((h: { fromStatus: string | null; toStatus: string }) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "draft"],
      ["draft", "planning"],
      ["planning", "building"],
    ]);
    expect(history[2]).toMatchObject({ changedBy: "ada", changedByName: "Ada" });
  });

  it("plan the kickoff when a project starts building, and wake the writer once", async () => {
    const { app, woken } = promoApp();
    const { project, postsPlanned } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, status: "planning" }, 201);
    expect(postsPlanned).toBe(0);
    expect(woken).toEqual([]);

    const moved = await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { status: "building" });
    expect(moved.postsPlanned).toBe(1);
    expect(woken).toEqual([{ projectId: project.id }]);
    const [kickoff] = await db.select().from(posts);
    expect(kickoff).toMatchObject({ kind: "kickoff", seq: 0, dueOn: today(), status: "planned" });

    // Other edits don't re-plan or wake anything.
    const edited = await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { tagline: "Food, not waste" });
    expect(edited.postsPlanned).toBe(0);
    expect(woken).toHaveLength(1);
  });

  it("set the launch day on launch unless one is set, and plan the launch post", async () => {
    const { app } = promoApp();
    const { project } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, status: "launching" }, 201);
    const launched = await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { status: "launched" });
    expect(launched.project.launchDate).toBe(today());
    expect((await db.select().from(posts)).map((p) => p.kind)).toEqual(["launch"]);

    const { project: other } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, slug: "other" }, 201);
    const backfilled = await adminJson(app, "PATCH", `/admin/projects/${other.id}`, {
      status: "launched",
      launchDate: "2025-06-01",
    });
    expect(backfilled.project.launchDate).toBe("2025-06-01");
    // Long gone: nothing to post about any more.
    expect(backfilled.postsPlanned).toBe(0);
  });

  it("still save when the agent can't be woken", async () => {
    const { app, logger } = makeApp(db, {
      triggerPromo: async () => {
        throw new Error("GitHub is down");
      },
    });
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    const moved = await adminJson(app, "PATCH", `/admin/projects/${project.id}`, { status: "building" });
    expect(moved.postsPlanned).toBe(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it("start a pitch's project timeline when the pitch is accepted", async () => {
    const { app } = promoApp();
    const { consent: _, ...fields } = validSubmission;
    const [pitch] = await db
      .insert(projectSubmissions)
      .values({ ...fields, consentAt: new Date() })
      .returning();
    const accepted = await adminJson(app, "POST", `/admin/submissions/${pitch!.id}/accept`, {});
    const history = await db.select().from(projectStatusChanges);
    expect(history).toMatchObject([{ projectId: accepted.project.id, fromStatus: null, toStatus: "draft", changedBy: "ada" }]);
  });
});

describe("GET /admin/projects/board", () => {
  it("lists open pitches and every project with what its card shows", async () => {
    const { app } = promoApp();
    const { consent: _, ...fields } = validSubmission;
    await db.insert(projectSubmissions).values([
      { ...fields, projectName: "Bouldering", consentAt: new Date() },
      { ...fields, projectName: "Old idea", status: "declined", consentAt: new Date() },
      { ...fields, projectName: "Taken", status: "accepted", consentAt: new Date() },
    ]);
    const { project } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, status: "building", launchDate: "2099-01-01" }, 201);
    await adminJson(app, "PUT", `/admin/projects/${project.id}/members`, { members: [{ memberId: "grace", role: "Initiator" }] });
    await adminJson(app, "POST", `/admin/projects/${project.id}/deliverables`, { title: "Later", dueOn: "2026-12-01" }, 201);
    await adminJson(app, "POST", `/admin/projects/${project.id}/deliverables`, { title: "Sooner", dueOn: "2026-11-01" }, 201);

    const board = await adminJson(app, "GET", "/admin/projects/board");
    expect(board.pitches.map((p: { projectName: string }) => p.projectName).sort()).toEqual(["Bouldering", "Old idea"]);
    expect(board.projects).toMatchObject([
      {
        id: project.id,
        status: "building",
        team: [{ displayName: "Grace", role: "Initiator" }],
        posts: { planned: 1, drafted: 0, approved: 0, published: 0, skipped: 0 },
        next: { kind: "progress", seq: 2 },
        openDeliverables: 2,
        nextDeliverable: { title: "Sooner", dueOn: "2026-11-01" },
        hints: [],
      },
    ]);
  });
});

describe("deliverables", () => {
  it("add, list (open by date, then done), update and delete", async () => {
    const { app } = promoApp();
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    const base = `/admin/projects/${project.id}/deliverables`;

    const late = await adminJson(app, "POST", base, { title: "Seed list", ownerId: "grace", doneWhen: "Public on Notion", dueOn: "2026-11-30" }, 201);
    expect(late).toMatchObject({ title: "Seed list", ownerId: "grace", ownerName: "Grace", doneWhen: "Public on Notion", doneOn: null });
    const soon = await adminJson(app, "POST", base, { title: "Map prototype", dueOn: "2026-10-30" }, 201);
    await adminJson(app, "POST", base, { title: "Someday", doneWhen: "" }, 201);
    const done = await adminJson(app, "POST", base, { title: "Kickoff call", doneOn: "2026-10-01" }, 201);

    const list = await adminJson(app, "GET", base);
    expect(list.map((d: { title: string }) => d.title)).toEqual(["Map prototype", "Seed list", "Someday", "Kickoff call"]);

    const updated = await adminJson(app, "PATCH", `${base}/${soon.id}`, { doneOn: "2026-10-28", ownerId: "ada" });
    expect(updated).toMatchObject({ doneOn: "2026-10-28", ownerName: "Ada" });
    expect(await adminJson(app, "DELETE", `${base}/${done.id}`)).toEqual({ ok: true });
    expect((await adminJson(app, "GET", base)).map((d: { id: string }) => d.id)).not.toContain(done.id);
    expect(late.id).toBeTruthy();
  });

  it("refuse an unknown owner, a missing title, and another project's deliverable", async () => {
    const { app } = promoApp();
    const { project } = await adminJson(app, "POST", "/admin/projects", KIEZ, 201);
    const { project: other } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, slug: "other" }, 201);
    const base = `/admin/projects/${project.id}/deliverables`;

    const ghost = await adminFetch(app, "POST", base, { title: "X", ownerId: "nobody" });
    expect(ghost.status).toBe(400);
    expect(await ghost.json()).toMatchObject({ issues: { ownerId: ["Pick a member"] } });
    expect((await adminFetch(app, "POST", base, { title: " " })).status).toBe(400);

    const mine = await adminJson(app, "POST", base, { title: "Mine" }, 201);
    expect((await adminFetch(app, "PATCH", `/admin/projects/${other.id}/deliverables/${mine.id}`, { title: "Theirs" })).status).toBe(404);
    expect((await adminFetch(app, "GET", `/admin/projects/00000000-0000-4000-8000-000000000000/deliverables`)).status).toBe(404);
  });
});

describe("adding a post by hand", () => {
  it("numbers an extra progress post, refuses a second launch post, and asks for a draft", async () => {
    const { app, woken } = promoApp();
    const { project } = await adminJson(app, "POST", "/admin/projects", { ...KIEZ, status: "building" }, 201);
    woken.length = 0;

    const extra = await adminJson(app, "POST", `/admin/projects/${project.id}/posts`, { kind: "progress" }, 201);
    expect(extra.post).toMatchObject({ kind: "progress", seq: 1, dueOn: today(), project: { title: "Kiez Pantry" } });
    expect(extra.post.draftRequestedAt).not.toBeNull();
    expect(extra.dispatched).toBe(true);
    expect(woken).toEqual([{ postId: extra.post.id }]);

    const again = await adminJson(app, "POST", `/admin/projects/${project.id}/posts`, { kind: "progress" }, 201);
    expect(again.post.seq).toBe(2);

    await adminJson(app, "POST", `/admin/projects/${project.id}/posts`, { kind: "launch", dueOn: "2026-12-01" }, 201);
    const second = await adminFetch(app, "POST", `/admin/projects/${project.id}/posts`, { kind: "launch" });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "This project already has a launch post" });

    const list = await adminJson(app, "GET", `/admin/projects/${project.id}/posts`);
    expect(list.map((p: { kind: string; seq: number }) => `${p.kind}:${p.seq}`)).toEqual([
      "kickoff:0",
      "progress:1",
      "progress:2",
      "launch:0",
    ]);
  });
});
