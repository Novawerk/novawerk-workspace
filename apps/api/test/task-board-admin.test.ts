// The task board's admin routes over HTTP: admins only, every route answers with the shape the
// panel reads, and the rules' answers come through as statuses. The rules themselves are tested
// in packages/tasks (admin.test.ts).

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proposalInput, suggestionInput } from "@nw/contracts";
import { members, postReports, taskEvents, tasks, werkLedger, type Member, type Database } from "@nw/db";
import { addPost, propose, signInWithGitHub, suggestTask, vote } from "@nw/tasks";

import { TEST_MEMBERS, adminFetch, adminJson, contributorCookie, createTestDb, makeApp, resetDb, type TestApp } from "./helpers.js";

let db: Database;
let app: TestApp;
let lena: Member;
let jonas: Member;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  app = makeApp(db).app;
  lena = await signInWithGitHub(db, { id: 101, login: "lena-k", name: "Lena", avatarUrl: null });
  jonas = await signInWithGitHub(db, { id: 102, login: "jonas", name: null, avatarUrl: null });
});

const newTask = {
  title: "Dark mode toggle",
  summary: "A toggle in the header",
  body: "## What\nA toggle.",
  criteria: ["Toggle works", "Remembers the choice"],
  area: "web",
  size: "M",
  skills: ["react", "css"],
  reviewerId: "grace",
  guideTemplate: "Branch from main.",
};
const plan = (approach = "Add a toggle to the header") => proposalInput.parse({ approach, eta: "week", readCriteria: true });

async function openTask(over: Partial<typeof tasks.$inferInsert> = {}) {
  const [task] = await db
    .insert(tasks)
    .values({ title: "Open task", area: "web", size: "S", status: "open", criteria: ["It works"], ...over })
    .returning();
  return task!;
}

const suggestion = (title = "Sort the wall A–Z", doItMyself = false) =>
  suggestTask(db, lena, suggestionInput.parse({ title, kind: "improvement", body: "The wall is long now; a sort helps.", where: "site", doItMyself }));

describe("who may call it", () => {
  const routes = [
    ["GET", "/admin/tasks"],
    ["POST", "/admin/tasks"],
    ["GET", "/admin/proposals"],
    ["GET", "/admin/suggestions"],
    ["GET", "/admin/discussions"],
    ["GET", "/admin/contributors"],
    ["GET", "/admin/werk"],
    ["POST", "/admin/werk"],
  ] as const;

  it("is for admins: 401 without a session, 403 for members without can_admin", async () => {
    for (const [method, path] of routes) {
      expect((await adminFetch(app, method, path, method === "POST" ? {} : undefined, null)).status).toBe(401);
      expect((await adminFetch(app, method, path, method === "POST" ? {} : undefined, "grace")).status).toBe(403);
    }
  });

  it("doesn't open with a contributor's cookie", async () => {
    const res = await app.request("/admin/tasks", { headers: { Cookie: await contributorCookie(lena.id) } });
    expect(res.status).toBe(401);
  });
});

describe("/admin/tasks", () => {
  it("creates a draft, edits it, publishes, closes and reopens it", async () => {
    const created = await adminJson(app, "POST", "/admin/tasks", newTask, 201);
    expect(created).toMatchObject({ status: "draft", title: "Dark mode toggle", reviewerId: "grace", werk: 3, skills: ["react", "css"] });
    const path = `/admin/tasks/${created.id}`;

    expect(await adminJson(app, "PATCH", path, { size: "L", criteria: ["Toggle works"] })).toMatchObject({ size: "L", werk: 8, criteria: ["Toggle works"] });
    expect((await adminFetch(app, "PATCH", path, {})).status).toBe(400);
    expect((await adminFetch(app, "PATCH", path, { reviewerId: "nobody" })).status).toBe(400);
    expect((await adminFetch(app, "PATCH", path, { size: "XXL" })).status).toBe(400);

    expect(await adminJson(app, "POST", `${path}/publish`)).toMatchObject({ status: "open" });
    expect((await adminFetch(app, "POST", `${path}/publish`)).status).toBe(409);
    expect((await adminFetch(app, "POST", `${path}/close`, { reason: "" })).status).toBe(400);
    expect(await adminJson(app, "POST", `${path}/close`, { reason: "Done another way" })).toMatchObject({ status: "closed", closedReason: "Done another way" });
    const reopened = await adminJson(app, "POST", `${path}/reopen`, { reason: "We need it after all" });
    expect(reopened).toMatchObject({ status: "open", closedReason: null });
    expect(reopened.events.map((e: { kind: string }) => e.kind)).toEqual(["created", "edited", "published", "closed", "reopened"]);
  });

  it("publishes at once when asked, and 404s an unknown task", async () => {
    expect(await adminJson(app, "POST", "/admin/tasks", { ...newTask, publish: true }, 201)).toMatchObject({ status: "open" });
    expect((await adminFetch(app, "GET", "/admin/tasks/NW-9999")).status).toBe(404);
    expect((await adminFetch(app, "GET", "/admin/tasks/not-a-task")).status).toBe(404);
    expect((await adminFetch(app, "POST", "/admin/tasks", { ...newTask, title: "" })).status).toBe(400);
  });

  it("lists tasks with counts and filters", async () => {
    await openTask({ title: "Draft", status: "draft" });
    const withPlan = await openTask({ title: "Has a plan" });
    await propose(db, lena, withPlan.id, plan());
    await openTask({ title: "Quiet", status: "assigned", assigneeId: jonas.id, assignedAt: new Date(Date.now() - 10 * 86_400_000) });

    const all = await adminJson(app, "GET", "/admin/tasks");
    expect(all).toHaveLength(3);
    expect(all.find((t: { title: string }) => t.title === "Has a plan")).toMatchObject({ proposalCount: 1, needsDecision: true });
    expect((await adminJson(app, "GET", "/admin/tasks?filter=stale")).map((t: { title: string }) => t.title)).toEqual(["Quiet"]);
    expect((await adminJson(app, "GET", "/admin/tasks?filter=draft")).map((t: { title: string }) => t.title)).toEqual(["Draft"]);
    expect((await adminFetch(app, "GET", "/admin/tasks?filter=nope")).status).toBe(400);
  });

  it("locks and opens a thread, on the public timeline", async () => {
    const task = await openTask();
    const path = `/admin/tasks/NW-${task.id}`;
    expect((await adminFetch(app, "POST", `${path}/lock`, { reason: "" })).status).toBe(400);
    expect(await adminJson(app, "POST", `${path}/lock`, { reason: "Heated; we'll pick it up Monday" })).toMatchObject({ threadLocked: true });
    expect((await adminFetch(app, "POST", `${path}/lock`, { reason: "again" })).status).toBe(409);
    expect(await adminJson(app, "POST", `${path}/unlock`, { reason: "Calm again" })).toMatchObject({ threadLocked: false });
    const pub = (await (await app.request(`/public/tasks/NW-${task.id}`)).json()) as { events: { kind: string }[] };
    expect(pub.events.map((e) => e.kind)).toEqual(["thread_locked", "thread_unlocked"]);
  });

  it("shows a member's post as Novawerk on the public task", async () => {
    const task = await openTask();
    const detail = await adminJson(app, "POST", `/admin/tasks/NW-${task.id}/posts`, { body: "Ask us anything here." }, 201);
    expect(detail.posts).toMatchObject([{ author: { kind: "member", name: "Ada" }, body: "Ask us anything here." }]);
    const pub = (await (await app.request(`/public/tasks/NW-${task.id}`)).json()) as { posts: unknown[] };
    expect(pub.posts).toMatchObject([{ author: { kind: "member", name: "Ada" } }]);
  });
});

describe("/admin/proposals", () => {
  it("queues pending plans, chooses one with notes for the others, and declines one privately", async () => {
    const task = await openTask();
    const mine = await propose(db, lena, task.id, plan());
    const theirs = await propose(db, jonas, task.id, plan("Another way"));

    const queue = await adminJson(app, "GET", "/admin/proposals");
    expect(queue).toMatchObject([{ task: { id: `NW-${task.id}` }, proposals: [{ id: mine.id }, { id: theirs.id }] }]);

    const chosen = await adminJson(app, "POST", `/admin/proposals/${mine.id}/choose`, { notes: { [theirs.id]: "Smaller change won." } });
    expect(chosen).toMatchObject({ status: "assigned", assignee: { handle: "lena-k" } });
    expect(chosen.proposals.find((p: { id: string }) => p.id === theirs.id)).toMatchObject({ status: "not_chosen", declineNote: "Smaller change won." });
    expect((await adminFetch(app, "POST", `/admin/proposals/${theirs.id}/choose`, {})).status).toBe(409);

    const other = await openTask({ title: "Other" });
    const p = await propose(db, jonas, other.id, plan());
    expect((await adminFetch(app, "POST", `/admin/proposals/${p.id}/decline`, { note: "" })).status).toBe(400);
    const declined = await adminJson(app, "POST", `/admin/proposals/${p.id}/decline`, { note: "Needs a test plan." });
    expect(declined).toMatchObject({ status: "open", proposals: [{ status: "not_chosen", declineNote: "Needs a test plan." }] });
    expect((await adminFetch(app, "POST", "/admin/proposals/00000000-0000-4000-8000-000000000000/decline", { note: "x" })).status).toBe(404);
  });

  it("refuses to give someone a second task before their first merge", async () => {
    await openTask({ title: "Held", status: "assigned", assigneeId: lena.id });
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    const res = await adminFetch(app, "POST", `/admin/proposals/${p.id}/choose`, {});
    expect(res.status).toBe(409);
  });
});

describe("/admin/suggestions", () => {
  it("lists with votes, Most wanted first", async () => {
    const first = await suggestion("First");
    const second = await suggestion("Second");
    await vote(db, jonas, second.id);
    expect((await adminJson(app, "GET", "/admin/suggestions")).map((s: { number: number }) => s.number)).toEqual([first.id, second.id]);
    const wanted = await adminJson(app, "GET", "/admin/suggestions?sort=votes");
    expect(wanted.map((s: { number: number; voteCount: number }) => [s.number, s.voteCount])).toEqual([
      [second.id, 1],
      [first.id, 0],
    ]);
  });

  it("asks for info, then accepts and assigns to the suggester who asked", async () => {
    const s = await suggestion("Mine", true);
    const path = `/admin/suggestions/NW-${s.id}`;
    expect(await adminJson(app, "POST", `${path}/ask`, { question: "Which page?" })).toMatchObject({ needsInfo: true, status: "suggested" });
    expect((await adminFetch(app, "POST", `${path}/accept`, { area: "web", size: "S", criteria: [] })).status).toBe(400);
    const accepted = await adminJson(app, "POST", `${path}/accept`, { area: "web", size: "S", criteria: ["Sorted A–Z"], assignToSuggester: true });
    expect(accepted).toMatchObject({ status: "assigned", assignee: { handle: "lena-k" }, needsInfo: false });
  });

  it("marks a duplicate and declines with a note", async () => {
    const original = await openTask();
    const dup = await suggestion("Same again");
    expect((await adminFetch(app, "POST", `/admin/suggestions/NW-${dup.id}/duplicate`, { of: "nope" })).status).toBe(400);
    expect(await adminJson(app, "POST", `/admin/suggestions/NW-${dup.id}/duplicate`, { of: `NW-${original.id}` })).toMatchObject({
      status: "duplicate",
      duplicateOf: `NW-${original.id}`,
    });
    const other = await suggestion("Not for now");
    expect(await adminJson(app, "POST", `/admin/suggestions/NW-${other.id}/decline`, { note: "Out of scope this year." })).toMatchObject({
      status: "declined",
      closedReason: "Out of scope this year.",
    });
    // A member-made task isn't a suggestion, and a triaged one isn't waiting any more.
    expect((await adminFetch(app, "POST", `/admin/suggestions/NW-${original.id}/decline`, { note: "x" })).status).toBe(404);
    expect((await adminFetch(app, "POST", `/admin/suggestions/NW-${other.id}/decline`, { note: "again" })).status).toBe(404);
  });
});

describe("/admin/discussions and /admin/contributors", () => {
  it("hides and shows a post with a reason", async () => {
    const task = await openTask();
    const post = await addPost(db, lena, task.id, { body: "Buy cheap watches" });
    expect((await adminFetch(app, "POST", `/admin/discussions/${post.id}/hide`, { reason: "" })).status).toBe(400);
    expect(await adminJson(app, "POST", `/admin/discussions/${post.id}/hide`, { reason: "Spam" })).toMatchObject({ hidden: true, hiddenReason: "Spam", body: "Buy cheap watches" });
    expect((await adminFetch(app, "POST", `/admin/discussions/${post.id}/hide`, { reason: "Spam" })).status).toBe(409);
    expect(await adminJson(app, "GET", "/admin/discussions?filter=hidden")).toMatchObject([{ id: post.id }]);
    expect(await adminJson(app, "POST", `/admin/discussions/${post.id}/unhide`, { reason: "Not spam" })).toMatchObject({ hidden: false, hiddenReason: null });
    const kinds = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id))).map((e) => e.kind);
    expect(kinds).toEqual(["post_hidden", "post_unhidden"]);
    expect((await adminFetch(app, "POST", "/admin/discussions/00000000-0000-4000-8000-000000000000/hide", { reason: "x" })).status).toBe(404);
  });

  it("lists reported posts until a member keeps or hides them", async () => {
    const task = await openTask();
    const post = await addPost(db, lena, task.id, { body: "Off-topic rant" });
    await db.insert(postReports).values({ postId: post.id, taskId: task.id, contributorId: jonas.id, reason: "Off-topic" });
    const reported = await adminJson(app, "GET", "/admin/discussions?filter=reported");
    expect(reported).toMatchObject([{ id: post.id, reports: [{ by: "jonas", reason: "Off-topic" }] }]);
    expect((await adminFetch(app, "GET", "/admin/discussions?filter=nope")).status).toBe(400);

    expect(await adminJson(app, "POST", `/admin/discussions/${post.id}/keep`, { reason: "Fine in context" })).toMatchObject({ reports: [] });
    expect(await adminJson(app, "GET", "/admin/discussions?filter=reported")).toEqual([]);
    const kinds = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id))).map((e) => e.kind);
    expect(kinds).toEqual(["reports_dismissed"]);

    // A new report after that brings it back; hiding settles it.
    await db.delete(postReports);
    await db.insert(postReports).values({ postId: post.id, taskId: task.id, contributorId: jonas.id, reason: null });
    expect(await adminJson(app, "GET", "/admin/discussions?filter=reported")).toHaveLength(1);
    await adminJson(app, "POST", `/admin/discussions/${post.id}/hide`, { reason: "Off-topic" });
    expect(await adminJson(app, "GET", "/admin/discussions?filter=reported")).toEqual([]);
  });

  it("suspends and unsuspends, and never shows an email", async () => {
    const list = await adminJson(app, "GET", "/admin/contributors");
    // Everyone is a member (NB-ADR-0014): the maintainers are on the list too.
    expect(list.map((c: { handle: string }) => c.handle).sort()).toEqual(["ada", "grace", "jonas", "lena-k", "linus"]);
    expect(JSON.stringify(list)).not.toContain("email");
    expect(await adminJson(app, "POST", `/admin/contributors/${jonas.id}/suspend`, { reason: "Spam" })).toMatchObject({
      suspended: true,
      suspendedReason: "Spam",
      suspendedBy: "ada",
    });
    expect((await adminFetch(app, "POST", `/admin/contributors/${jonas.id}/suspend`, { reason: "Spam" })).status).toBe(409);
    expect(await adminJson(app, "POST", `/admin/contributors/${jonas.id}/unsuspend`, { reason: "Sorted out" })).toMatchObject({ suspended: false });
    expect((await adminJson(app, "GET", `/admin/contributors/${jonas.id}/moderation`)).map((h: { action: string }) => h.action)).toEqual([
      "unsuspended",
      "suspended",
    ]);
    expect((await adminFetch(app, "POST", "/admin/contributors/not-a-uuid/suspend", { reason: "x" })).status).toBe(404);
  });
});

describe("when Postgres gives up on a transaction", () => {
  it("answers 409 try again for a deadlock or a serialization failure, not 500", async () => {
    for (const code of ["40P01", "40001"]) {
      // The session check reads through the real db; the action's transaction fails like Postgres does.
      const failing = new Proxy(db, {
        get: (target, prop, receiver) =>
          prop === "transaction"
            ? async () => {
                throw Object.assign(new Error("could not serialize"), { code })
              }
            : Reflect.get(target, prop, receiver),
      });
      const { app: flaky } = makeApp(failing);
      const task = await openTask({ title: `Flaky ${code}` });
      const res = await adminFetch(flaky, "POST", `/admin/tasks/NW-${task.id}/close`, { reason: "Done" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "Someone else changed this at the same moment. Try again." });
    }
  });
});

describe("/admin/werk", () => {
  it("adds a row with a reason, never edits one, and lists the ledger", async () => {
    const task = await openTask({ status: "done", assigneeId: lena.id });
    expect((await adminFetch(app, "POST", "/admin/werk", { contributorId: lena.id, delta: 0, reason: "x" })).status).toBe(400);
    expect((await adminFetch(app, "POST", "/admin/werk", { contributorId: lena.id, delta: 2, reason: "" })).status).toBe(400);
    expect((await adminFetch(app, "POST", "/admin/werk", { contributorId: lena.id, delta: 2, reason: "x", taskId: "NW-9999" })).status).toBe(400);
    const row = await adminJson(app, "POST", "/admin/werk", { contributorId: lena.id, delta: -3, reason: "Reverted in #215", taskId: `NW-${task.id}` }, 201);
    expect(row).toMatchObject({ delta: -3, reason: "Reverted in #215", contributor: { handle: "lena-k" }, byMember: { id: "ada" }, task: { id: `NW-${task.id}` } });
    expect(await adminJson(app, "GET", `/admin/werk?contributor=${lena.id}`)).toHaveLength(1);
    expect(await adminJson(app, "GET", `/admin/werk?contributor=${jonas.id}`)).toEqual([]);
    expect(await db.select().from(werkLedger)).toHaveLength(1);
    // There is no route that changes or deletes a row.
    expect((await adminFetch(app, "PATCH", `/admin/werk/${row.id}`, { delta: 3 })).status).toBe(404);
    expect((await adminFetch(app, "DELETE", `/admin/werk/${row.id}`)).status).toBe(404);
  });
});
