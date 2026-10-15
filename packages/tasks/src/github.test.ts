// Pull requests moving tasks, inactivity, the assignee's own actions, reports, blocks and my
// tasks, against a real schema (PGlite).

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proposalInput } from "@nw/contracts";
import { contributors, postReports, taskEvents, tasks, werkLedger, type Contributor, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import {
  BOARD_COMMENT_MARKER,
  TaskRuleError,
  addPost,
  applyPullRequest,
  checkInactivity,
  claimDelivery,
  extendTask,
  forgetDelivery,
  idleReleaseAt,
  markDelivered,
  reconcileLinkedPullRequest,
  safeTitle,
  transitionTask,
  guideFor,
  linkPrByHand,
  listPublicBlocks,
  myTasks,
  propose,
  releaseHeldTask,
  reportPost,
  signInWithGitHub,
  updateProfile,
  type PullRequestInput,
} from "./index.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

let lena: Contributor;
let jonas: Contributor;
beforeEach(async () => {
  await resetDb(db);
  lena = await signInWithGitHub(db, { id: 101, login: "lena-k", name: "Lena", avatarUrl: null });
  jonas = await signInWithGitHub(db, { id: 102, login: "jonas", name: null, avatarUrl: null });
});

const DAY = 24 * 3_600_000;
const web = { webUrl: "https://novawerk.io" };

async function task(fields: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db
    .insert(tasks)
    .values({ title: "Dark mode toggle", area: "web", size: "M", status: "assigned", assigneeId: lena.id, assignedAt: new Date(), lastActivityAt: new Date(), ...fields })
    .returning();
  return row!;
}
const reload = async (id: number) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!;

const pr = (n: number | null, fields: Partial<PullRequestInput> = {}): PullRequestInput => ({
  repo: "Novawerk/novawerk-workspace",
  number: 212,
  url: "https://github.com/Novawerk/novawerk-workspace/pull/212",
  authorId: 101,
  authorLogin: "lena-k",
  state: "open",
  merged: false,
  taskNumber: n,
  ...fields,
});

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TaskRuleError) return e.code;
    throw e;
  }
  return "ok";
}

describe("pull requests", () => {
  it("links the assignee's PR once, with a comment and a size label", async () => {
    const t = await task();
    const first = await applyPullRequest(db, pr(t.id), { source: "webhook", action: "opened", ...web });
    expect(first.result).toBe("linked");
    expect(first.replies).toEqual([
      { kind: "comment", body: expect.stringContaining(`https://novawerk.io/tasks/NW-${t.id}`) },
      { kind: "labels", labels: ["size:M"] },
    ]);
    expect(first.replies[0]).toMatchObject({ body: expect.stringContaining(BOARD_COMMENT_MARKER) });
    expect(await reload(t.id)).toMatchObject({ status: "in_review", prUrl: pr(t.id).url });

    // An edit, a redelivery, the reconcile: nothing twice.
    for (const action of ["edited", "opened", undefined]) {
      const again = await applyPullRequest(db, pr(t.id), { source: action ? "webhook" : "reconcile", action, ...web });
      expect(again).toMatchObject({ result: "unchanged", replies: [] });
    }
  });

  it("merges once: done, Werk for the task and PR, a thank-you", async () => {
    const t = await task({ status: "in_review", prUrl: pr(1).url });
    const merged = pr(t.id, { state: "closed", merged: true });
    const outcome = await applyPullRequest(db, merged, { source: "webhook", action: "closed", ...web });
    expect(outcome.result).toBe("merged");
    expect(outcome.replies[0]).toMatchObject({ body: expect.stringContaining("+3 Werk to @lena-k") });
    expect((await reload(t.id)).status).toBe("done");
    expect(await applyPullRequest(db, merged, { source: "reconcile", ...web })).toMatchObject({ result: "unchanged" });
    expect(await db.select().from(werkLedger)).toMatchObject([{ contributorId: lena.id, delta: 3, pr: merged.url }]);
  });

  it("counts a merge the webhook saw before any 'opened'", async () => {
    const t = await task();
    expect((await applyPullRequest(db, pr(t.id, { state: "closed", merged: true }), { source: "reconcile", ...web })).result).toBe("merged");
  });

  it("puts a task back to assigned when its PR closes unmerged, and only that PR", async () => {
    const t = await task({ status: "in_review", prUrl: pr(1).url });
    const other = pr(t.id, { state: "closed", url: "https://github.com/Novawerk/novawerk-workspace/pull/999" });
    expect((await applyPullRequest(db, other, { source: "webhook", action: "closed", ...web })).result).toBe("unchanged");
    expect((await applyPullRequest(db, pr(t.id, { state: "closed" }), { source: "webhook", action: "closed", ...web })).result).toBe("unlinked");
    expect(await reload(t.id)).toMatchObject({ status: "assigned", prUrl: null });
  });

  it("answers someone else's PR politely once, and never links it", async () => {
    const t = await task();
    const theirs = pr(t.id, { authorId: 102, authorLogin: "jonas" });
    const opened = await applyPullRequest(db, theirs, { source: "webhook", action: "opened", ...web });
    expect(opened.result).toBe("not_assignee");
    expect(opened.replies).toHaveLength(1);
    expect(opened.replies[0]).toMatchObject({ body: expect.not.stringContaining(`/tasks/NW-${t.id}`) });
    expect((await applyPullRequest(db, theirs, { source: "webhook", action: "edited", ...web })).replies).toEqual([]);
    expect((await applyPullRequest(db, theirs, { source: "reconcile", ...web })).replies).toEqual([]);
    expect((await applyPullRequest(db, { ...theirs, merged: true, state: "closed" }, { source: "webhook", action: "closed", ...web })).result).toBe("ignored");
    expect((await reload(t.id)).status).toBe("assigned");
    expect(await db.select().from(werkLedger)).toEqual([]);
  });

  it("ignores a PR without a task, on another repository, or naming a closed task", async () => {
    const t = await task();
    const closed = await task({ status: "closed", assigneeId: null });
    expect((await applyPullRequest(db, pr(null), { source: "webhook", action: "opened", ...web })).result).toBe("ignored");
    expect((await applyPullRequest(db, pr(t.id, { repo: "someone/fork" }), { source: "webhook", action: "opened", ...web })).result).toBe("ignored");
    expect((await applyPullRequest(db, pr(closed.id), { source: "webhook", action: "opened", ...web })).result).toBe("ignored");
    expect((await applyPullRequest(db, pr(99_999), { source: "webhook", action: "opened", ...web })).result).toBe("ignored");
  });

  it("moves a retargeted PR: the old task leaves review, the new one gets it", async () => {
    const first = await task({ status: "in_review", prUrl: pr(1).url });
    const second = await task({ title: "Second" });
    const outcome = await applyPullRequest(db, pr(second.id), { source: "webhook", action: "edited", ...web });
    expect(outcome.result).toBe("linked");
    expect(await reload(first.id)).toMatchObject({ status: "assigned", prUrl: null });
    expect(await reload(second.id)).toMatchObject({ status: "in_review", prUrl: pr(1).url });
    const note = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, first.id))).at(-1)?.note;
    expect(note).toBe(`The pull request now names NW-${second.id}`);
  });

  it("checks tasks in review against their PR every night", async () => {
    const t = await task({ status: "in_review", prUrl: pr(1).url });
    const open = { ...pr(t.id) };
    expect((await reconcileLinkedPullRequest(db, t.id, open, web)).result).toBe("unchanged");
    expect((await reconcileLinkedPullRequest(db, t.id, { ...open, authorId: 999 }, web)).result).toBe("unlinked");
    expect(await reload(t.id)).toMatchObject({ status: "assigned", prUrl: null });

    const gone = await task({ title: "Gone", status: "in_review", prUrl: pr(1).url, assigneeId: jonas.id });
    expect((await reconcileLinkedPullRequest(db, gone.id, null, web)).result).toBe("unlinked");
    const merged = await task({ title: "Merged", status: "in_review", prUrl: pr(1).url });
    const result = await reconcileLinkedPullRequest(db, merged.id, { ...pr(merged.id), state: "closed", merged: true }, web);
    expect(result.result).toBe("merged");
    expect((await reload(merged.id)).status).toBe("done");
  });

  it("escapes the task title and never pings from it; no 'propose first' for our own people", async () => {
    const t = await task({ title: "Fix [this](https://evil.example) for @everyone *now*" });
    const linked = await applyPullRequest(db, pr(t.id), { source: "webhook", action: "opened", ...web });
    const body = (linked.replies[0] as { body: string }).body;
    expect(body).not.toContain("](https://evil.example)");
    expect(body).toContain("@\u200beveryone");
    expect(safeTitle("a_b")).toBe("a\\_b");

    const other = await task({ title: "Other" });
    for (const association of ["OWNER", "MEMBER", "COLLABORATOR"]) {
      const theirs = pr(other.id, { authorId: 7, authorLogin: "haodong", authorAssociation: association });
      expect((await applyPullRequest(db, theirs, { source: "webhook", action: "opened", ...web })).replies).toEqual([]);
    }
  });

  it("counts new commits on the linked PR as activity", async () => {
    const t = await task({ status: "in_review", prUrl: pr(1).url, lastActivityAt: new Date(Date.now() - 10 * DAY) });
    expect((await applyPullRequest(db, pr(t.id), { source: "webhook", action: "synchronize", ...web })).result).toBe("activity");
    expect((await reload(t.id)).lastActivityAt!.getTime()).toBeGreaterThan(Date.now() - DAY);
  });
});

describe("deliveries", () => {
  it("handles a delivery id once, unless its handling failed or died", async () => {
    const t0 = new Date("2026-10-15T10:00:00Z");
    expect(await claimDelivery(db, "d-1", "pull_request", t0)).toBe(true);
    expect(await claimDelivery(db, "d-1", "pull_request", t0)).toBe(false); // in progress
    await forgetDelivery(db, "d-1");
    expect(await claimDelivery(db, "d-1", "pull_request", t0)).toBe(true);
    // A claim still within the function's longest run is left alone; one that never finished can
    // be taken over after 10 minutes…
    expect(await claimDelivery(db, "d-1", "pull_request", new Date(t0.getTime() + 6 * 60_000))).toBe(false);
    expect(await claimDelivery(db, "d-1", "pull_request", new Date(t0.getTime() + 11 * 60_000))).toBe(true);
    // …but a handled one never.
    await markDelivered(db, "d-1");
    expect(await claimDelivery(db, "d-1", "pull_request", new Date(t0.getTime() + 60 * 60_000))).toBe(false);
  });
});

describe("inactivity", () => {
  it("reminds after 7 quiet days, once, and releases after 14", async () => {
    const start = new Date("2026-10-01T10:00:00Z");
    const t = await task({ assignedAt: start, lastActivityAt: start });
    const at = (days: number) => new Date(start.getTime() + days * DAY);

    expect(await checkInactivity(db, at(6))).toEqual({ reminded: [], released: [] });
    expect(await checkInactivity(db, at(7))).toEqual({ reminded: [t.id], released: [] });
    // The reminder carries exact times for the email.
    expect((await db.select().from(taskEvents))[0]?.data).toEqual({
      idleSince: start.toISOString(),
      releaseAt: at(14).toISOString(),
    });
    expect(await checkInactivity(db, at(8))).toEqual({ reminded: [], released: [] });
    expect(await checkInactivity(db, at(14))).toEqual({ reminded: [], released: [t.id] });
    expect(await reload(t.id)).toMatchObject({ status: "open", assigneeId: null });
    const kinds = (await db.select().from(taskEvents)).map((e) => e.kind);
    expect(kinds).toEqual(["inactivity_reminder", "released"]);
  });

  it("pushes the release back once with a week more, and reminds again before it", async () => {
    const start = new Date(Date.now() - 8 * DAY);
    const t = await task({ assignedAt: start, lastActivityAt: start });
    expect((await checkInactivity(db)).reminded).toEqual([t.id]);

    await extendTask(db, lena, t.id);
    expect(await code(() => extendTask(db, lena, t.id))).toBe("conflict");
    // Day 15 would release it without the extension; instead a new reminder, a week before day 21.
    const later = new Date(Date.now() + 7 * DAY);
    expect(await checkInactivity(db, later)).toEqual({ reminded: [t.id], released: [] });
    expect(await checkInactivity(db, later)).toEqual({ reminded: [], released: [] });
    expect((await checkInactivity(db, new Date(Date.now() + 14 * DAY))).released).toEqual([t.id]);
  });

  it("re-checks under the lock: activity since the check keeps the task", async () => {
    const start = new Date(Date.now() - 15 * DAY);
    const t = await task({ assignedAt: start, lastActivityAt: start });
    const checkedAt = new Date();
    await db.update(tasks).set({ lastActivityAt: new Date() }).where(eq(tasks.id, t.id)); // a post just landed
    expect(
      await code(() => transitionTask(db, { taskId: t.id, action: "release", actor: { kind: "system" }, idleAt: checkedAt })),
    ).toBe("invalid_state");
    expect((await reload(t.id)).status).toBe("assigned");
    expect(idleReleaseAt({ ...t, lastActivityAt: start, extendedAt: new Date() }).getTime()).toBe(start.getTime() + 21 * DAY);
  });

  it("leaves tasks in review alone", async () => {
    await task({ status: "in_review", prUrl: pr(1).url, lastActivityAt: new Date(Date.now() - 30 * DAY) });
    expect(await checkInactivity(db)).toEqual({ reminded: [], released: [] });
  });
});

describe("the assignee", () => {
  it("reads the guide; nobody else does", async () => {
    const t = await task({ criteria: ["Toggle works"] });
    const guide = await guideFor(db, lena, t.id);
    expect(guide.markdown).toContain(`Task: NW-${t.id}`);
    expect(guide.markdown).toContain("- [ ] Toggle works");
    expect(await code(() => guideFor(db, jonas, t.id))).toBe("forbidden");
    await db.update(tasks).set({ guideTemplate: "Our own guide" }).where(eq(tasks.id, t.id));
    expect((await guideFor(db, lena, t.id)).markdown).toBe("Our own guide");
  });

  it("links a PR by hand only when it counts: open, theirs, naming the task, on its repository", async () => {
    const t = await task();
    const mine = pr(t.id);
    expect(await code(() => linkPrByHand(db, jonas, t.id, mine))).toBe("forbidden");
    expect(await code(() => linkPrByHand(db, lena, t.id, { ...mine, repo: "someone/else" }))).toBe("invalid");
    expect(await code(() => linkPrByHand(db, lena, t.id, { ...mine, authorId: 102 }))).toBe("invalid"); // someone else's PR
    expect(await code(() => linkPrByHand(db, lena, t.id, { ...mine, taskNumber: t.id + 100 }))).toBe("invalid");
    expect(await code(() => linkPrByHand(db, lena, t.id, { ...mine, state: "closed" }))).toBe("invalid");
    expect((await reload(t.id)).status).toBe("assigned");
    expect(await linkPrByHand(db, lena, t.id, mine)).toMatchObject({ status: "in_review", prUrl: mine.url });
  });

  it("releases with a reason on the timeline", async () => {
    const t = await task();
    await releaseHeldTask(db, lena, t.id, "No time this month");
    expect(await reload(t.id)).toMatchObject({ status: "open", assigneeId: null, extendedAt: null });
    expect((await db.select().from(taskEvents))[0]).toMatchObject({ kind: "released", note: "No time this month", actorContributorId: lena.id });
  });

  it("sees held tasks and pending proposals in my tasks", async () => {
    const held = await task();
    const open = await task({ status: "open", assigneeId: null, title: "Open one" });
    await propose(db, jonas, open.id, proposalInput.parse({ approach: "A plan", eta: "days", readCriteria: true }));
    expect((await myTasks(db, lena.id)).held.map((t) => t.number)).toEqual([held.id]);
    const theirs = await myTasks(db, jonas.id);
    expect(theirs.held).toEqual([]);
    expect(theirs.proposals.map((p) => p.taskId)).toEqual([`NW-${open.id}`]);
  });
});

describe("reports and blocks", () => {
  it("reports a post once, never your own", async () => {
    const t = await task({ status: "open", assigneeId: null });
    const post = await addPost(db, lena, t.id, { body: "Spam?" });
    expect(await code(() => reportPost(db, lena, post.id))).toBe("forbidden");
    await reportPost(db, jonas, post.id, "Off-topic");
    await reportPost(db, jonas, post.id, "Again");
    expect(await db.select().from(postReports)).toMatchObject([{ postId: post.id, contributorId: jonas.id, reason: "Off-topic" }]);
  });

  it("lists merged tasks oldest first, with real handles only for public profiles", async () => {
    await task({ title: "Second", status: "done", doneAt: new Date("2026-10-02") });
    await task({ title: "First", status: "done", assigneeId: jonas.id, doneAt: new Date("2026-10-01") });
    await task({ title: "In progress" });
    await updateProfile(db, jonas.id, { public: true });

    const blocks = await listPublicBlocks(db, "key");
    expect(blocks.map((b) => [b.title, b.handle])).toEqual([
      ["First", "jonas"],
      ["Second", expect.stringMatching(/^anon-[0-9a-f]{8}$/)],
    ]);
    expect((await listPublicBlocks(db, "key"))[1]!.handle).toBe(blocks[1]!.handle); // stable
    expect((await listPublicBlocks(db, "other key"))[1]!.handle).not.toBe(blocks[1]!.handle);
    expect(JSON.stringify(blocks)).not.toContain("lena");

    await db.delete(contributors).where(eq(contributors.id, lena.id));
    expect((await listPublicBlocks(db, "key"))[1]!.handle).toMatch(/^anon-/);
  });
});
