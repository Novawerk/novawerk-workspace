// The members' side of the board against a real schema (PGlite): the assign race, reopening,
// triage, moderation and Werk, the events each one writes, and what stays off the public timeline.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proposalInput, suggestionInput } from "@nw/contracts";
import { members, taskEvents, taskPosts, taskProposals, tasks, werkLedger, type Member, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import {
  TaskRuleError,
  addMemberPost,
  addPost,
  adjustWerk,
  askForInfo,
  chooseProposal,
  createTask,
  declineProposal,
  getAdminTask,
  getPublicTask,
  listAdminContributors,
  listAdminTasks,
  listProposalQueue,
  listSuggestions,
  listWerkLedger,
  moderationHistory,
  propose,
  setContributorSuspended,
  setPostHidden,
  signInWithGitHub,
  suggestTask,
  transitionTask,
  updateTask,
  vote,
  withdrawProposal,
} from "./index.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

let lena: Member;
let jonas: Member;
let mira: Member;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    { id: "ada", handle: "ada", displayName: "Ada", email: "ada@novawerk.io", role: "maintainer" },
    { id: "grace", handle: "grace", displayName: "Grace", email: "grace@novawerk.io", role: "maintainer" },
  ]);
  lena = await signInWithGitHub(db, { id: 101, login: "lena-k", name: "Lena", avatarUrl: null });
  jonas = await signInWithGitHub(db, { id: 102, login: "jonas", name: null, avatarUrl: null });
  mira = await signInWithGitHub(db, { id: 103, login: "mira", name: null, avatarUrl: null });
});

const ada = { kind: "member", id: "ada" } as const;
const plan = (approach = "Add a skeleton to the list") => proposalInput.parse({ approach, eta: "week", readCriteria: true });
const fields = {
  title: "Dark mode toggle",
  summary: "A toggle in the header",
  body: "",
  criteria: ["Toggle works"],
  area: "web",
  size: "M",
  skills: ["react"],
  repo: "Novawerk/novawerk-workspace",
  reviewerId: null,
} as const;

async function openTask(over: Partial<typeof tasks.$inferInsert> = {}) {
  const [task] = await db
    .insert(tasks)
    .values({ ...fields, skills: ["react"], criteria: ["Toggle works"], status: "open", ...over })
    .returning();
  return task!;
}

async function code(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TaskRuleError) return e.code;
    throw e;
  }
  return "ok";
}

const kinds = async (taskId: number) =>
  (await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(taskEvents.id)).map((e) => e.kind);

describe("assigning", () => {
  it("lets two members give the same person two tasks at once", async () => {
    // Two open tasks, Lena proposed on both; Ada and Grace each pick her plan at the same moment.
    // There's no limit on tasks held, so both choices stand.
    const a = await openTask({ title: "A" });
    const b = await openTask({ title: "B" });
    const pa = await propose(db, lena, a.id, plan());
    const pb = await propose(db, lena, b.id, plan());
    const results = await Promise.all([
      code(() => chooseProposal(db, { proposalId: pa.id, memberId: "ada" })),
      code(() => chooseProposal(db, { proposalId: pb.id, memberId: "grace" })),
    ]);
    expect(results).toEqual(["ok", "ok"]);
    expect(await db.select().from(tasks).where(eq(tasks.assigneeId, lena.id))).toHaveLength(2);
  });

  it("records each plan that wasn't chosen, without its private note", async () => {
    const task = await openTask();
    const mine = await propose(db, lena, task.id, plan());
    const theirs = await propose(db, jonas, task.id, plan("Another way"));
    await chooseProposal(db, { proposalId: mine.id, memberId: "ada", notes: { [theirs.id]: "We went with a smaller change." } });
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).orderBy(taskEvents.id);
    // Each event names who it is about (the notices go to them); the private note stays off it.
    expect(events.map((e) => [e.kind, e.subjectContributorId, e.note])).toEqual([
      ["assigned", lena.id, null],
      ["proposal_declined", jonas.id, null],
    ]);
    expect(theirs.id).toBeTruthy();
    expect((await getPublicTask(db, task.id))?.events.map((e) => e.kind)).toEqual(["assigned"]);
  });

  it("declines one plan with a note for its author and keeps the task open", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    expect(await code(() => declineProposal(db, "ada", p.id, " "))).toBe("invalid");
    await declineProposal(db, "ada", p.id, "This needs a test first.");
    const [row] = await db.select().from(taskProposals);
    expect(row).toMatchObject({ status: "not_chosen", declineNote: "This needs a test first.", decidedBy: "ada" });
    expect((await db.select().from(tasks))[0]?.status).toBe("open");
    expect(await kinds(task.id)).toEqual(["proposal_declined"]);
    expect(await code(() => declineProposal(db, "ada", p.id, "again"))).toBe("invalid_state");
  });
});

describe("fixes from the server review", () => {
  it("never chooses a withdrawn plan", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    await withdrawProposal(db, lena, p.id);
    expect(await code(() => chooseProposal(db, { proposalId: p.id, memberId: "ada" }))).toBe("not_found");
    expect((await db.select().from(tasks))[0]).toMatchObject({ status: "open", assigneeId: null });
  });

  it("rolls the whole choice back when the plan stopped being pending under the lock", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    // As if it was decided between the first read and the locks: the guarded update finds nothing.
    await db.update(taskProposals).set({ status: "not_chosen" }).where(eq(taskProposals.id, p.id));
    expect(await code(() => chooseProposal(db, { proposalId: p.id, memberId: "ada" }))).toBe("invalid_state");
    expect((await db.select().from(tasks))[0]).toMatchObject({ status: "open", assigneeId: null });
    expect(await db.select().from(taskEvents)).toEqual([]);
  });

  it("closing declines the waiting plans with the reason, so reopening doesn't revive them", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    await transitionTask(db, { taskId: task.id, action: "close", actor: ada, note: "Done another way" });
    expect((await db.select().from(taskProposals))[0]).toMatchObject({ id: p.id, status: "not_chosen", declineNote: "Done another way" });
    await transitionTask(db, { taskId: task.id, action: "reopen", actor: ada, note: "Needed after all" });
    expect((await getAdminTask(db, task.id)).proposalCount).toBe(0);
    expect(await kinds(task.id)).toEqual(["closed", "proposal_declined", "reopened"]);
  });

  it("freezes size and repository once someone holds the task", async () => {
    const task = await openTask({ status: "assigned", assigneeId: lena.id, assignedAt: new Date() });
    expect(await code(() => updateTask(db, "ada", task.id, { size: "XL" }))).toBe("invalid_state");
    expect(await code(() => updateTask(db, "ada", task.id, { repo: "Novawerk/other" }))).toBe("invalid_state");
    await updateTask(db, "ada", task.id, { title: "A clearer title" });
    expect((await db.select().from(tasks))[0]).toMatchObject({ size: "M", title: "A clearer title" });
  });

  it("refuses a duplicate of a draft", async () => {
    const draft = await openTask({ status: "draft" });
    const s = await suggestTask(db, lena, suggestionInput.parse({ title: "Same idea", kind: "bug", body: "Something we should change, explained well enough.", where: "site" }));
    expect(await code(() => transitionTask(db, { taskId: s.id, action: "mark_duplicate", actor: ada, duplicateOf: draft.id }))).toBe("invalid");
  });

  it("suspending releases held tasks and keeps a history of who and why", async () => {
    const held = await openTask({ status: "in_review", assigneeId: jonas.id, assignedAt: new Date(), prUrl: "https://github.com/x/y/pull/1" });
    await setContributorSuspended(db, "ada", jonas.id, true, "Spam");
    expect((await db.select().from(tasks).where(eq(tasks.id, held.id)))[0]).toMatchObject({ status: "open", assigneeId: null, prUrl: null });
    // Nothing public says why, and no event names them, so no notice goes out.
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, held.id)).orderBy(taskEvents.id);
    expect(events.map((e) => [e.kind, e.note, e.subjectContributorId])).toEqual([
      ["pr_closed", null, null],
      ["released", "Back on the board.", null],
    ]);
    expect(JSON.stringify(await getPublicTask(db, held.id))).not.toContain("suspend");
    await setContributorSuspended(db, "grace", jonas.id, false, "Talked it through");
    expect((await moderationHistory(db, jonas.id)).map((h) => [h.action, h.by, h.reason])).toEqual([
      ["unsuspended", "Grace", "Talked it through"],
      ["suspended", "Ada", "Spam"],
    ]);
  });

  it("reads staleness and the release date from the idle rules", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    await openTask({ title: "Six days", status: "assigned", assigneeId: lena.id, assignedAt: new Date("2026-10-14T12:00:00Z") });
    await openTask({ title: "Eight days, extended", status: "assigned", assigneeId: jonas.id, assignedAt: new Date("2026-10-12T12:00:00Z"), extendedAt: new Date("2026-10-19T12:00:00Z") });
    const rows = await listAdminTasks(db, "all", now);
    expect(rows.find((r) => r.title === "Six days")).toMatchObject({ stale: false, releaseAt: "2026-10-28T12:00:00.000Z" });
    expect(rows.find((r) => r.title === "Eight days, extended")).toMatchObject({ stale: true, releaseAt: "2026-11-02T12:00:00.000Z" });
  });
});

describe("writing tasks", () => {
  it("creates a draft, publishes, edits with a members-only event, closes and reopens", async () => {
    const draft = await createTask(db, "ada", { ...fields, criteria: [...fields.criteria], skills: ["react", "react"] });
    expect(draft).toMatchObject({ status: "draft", createdByMemberId: "ada", skills: ["react"] });
    expect(await code(() => createTask(db, "ada", { ...fields, criteria: [], skills: [], reviewerId: "nobody" }))).toBe("invalid");

    await transitionTask(db, { taskId: draft.id, action: "publish", actor: ada });
    await updateTask(db, "ada", draft.id, { size: "L", title: fields.title });
    await updateTask(db, "ada", draft.id, { size: "L" }); // no change, no event
    const closed = await transitionTask(db, { taskId: draft.id, action: "close", actor: ada, note: "Done another way" });
    expect(closed).toMatchObject({ status: "closed", closedReason: "Done another way" });
    expect(await code(() => updateTask(db, "ada", draft.id, { size: "S" }))).toBe("invalid_state");
    expect(await code(() => transitionTask(db, { taskId: draft.id, action: "reopen", actor: ada }))).toBe("invalid");
    const reopened = await transitionTask(db, { taskId: draft.id, action: "reopen", actor: ada, note: "We need it after all" });
    expect(reopened).toMatchObject({ status: "open", closedReason: null, closedAt: null, assigneeId: null });

    expect(await kinds(draft.id)).toEqual(["created", "published", "edited", "closed", "reopened"]);
    const [edited] = await db.select().from(taskEvents).where(eq(taskEvents.kind, "edited"));
    expect(edited?.note).toBe("size");
    expect((await getPublicTask(db, draft.id))?.events.map((e) => e.kind)).toEqual(["created", "published", "closed", "reopened"]);
  });

  it("reopening frees a task someone held", async () => {
    const task = await openTask({ status: "assigned", assigneeId: lena.id, assignedAt: new Date(), extendedAt: new Date() });
    await transitionTask(db, { taskId: task.id, action: "close", actor: ada, note: "Out of scope" });
    const reopened = await transitionTask(db, { taskId: task.id, action: "reopen", actor: ada, note: "Back in scope" });
    expect(reopened).toMatchObject({ status: "open", assigneeId: null, assignedAt: null, extendedAt: null });
  });

  it("lists every task with its flags, filtered, and the proposal queue", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    await openTask({ title: "Draft", status: "draft" });
    const withPlan = await openTask({ title: "Has a plan" });
    await propose(db, lena, withPlan.id, plan());
    await openTask({ title: "Quiet", status: "assigned", assigneeId: jonas.id, assignedAt: new Date("2026-10-10T12:00:00Z") });
    await openTask({ title: "Busy", status: "in_review", assigneeId: mira.id, lastActivityAt: new Date("2026-10-19T12:00:00Z") });
    await openTask({ title: "Gone", status: "closed" });

    const titles = async (filter: Parameters<typeof listAdminTasks>[1]) =>
      (await listAdminTasks(db, filter, now)).map((t) => t.title).sort();
    expect(await titles("all")).toEqual(["Busy", "Draft", "Gone", "Has a plan", "Quiet"]);
    expect(await titles("decide")).toEqual(["Has a plan"]);
    expect(await titles("stale")).toEqual(["Quiet"]);
    expect(await titles("draft")).toEqual(["Draft"]);
    expect(await titles("finished")).toEqual(["Gone"]);
    expect((await listAdminTasks(db, "stale", now))[0]).toMatchObject({ assignee: { handle: "jonas" }, stale: true });

    const queue = await listProposalQueue(db);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      task: { title: "Has a plan" },
      proposals: [{ author: { handle: "lena-k" }, record: { done: 0, inProgress: 0 } }],
    });
  });
});

describe("suggestions", () => {
  const suggestion = (title: string, kind: "bug" | "improvement" = "improvement") =>
    suggestionInput.parse({ title, kind, body: "Something we should change, explained well enough.", where: "site" });

  it("asks for info in the thread, then accepts with a size", async () => {
    const s = await suggestTask(db, lena, suggestion("Sort the wall A–Z"));
    await vote(db, jonas, s.id);
    const asked = await askForInfo(db, "ada", s.id, "Which page do you mean?");
    expect(asked).toMatchObject({ status: "suggested", needsInfo: true });
    const [question] = await db.select().from(taskPosts);
    expect(question).toMatchObject({ authorMemberId: "ada", body: "Which page do you mean?" });
    const [info] = await db.select().from(taskEvents).where(eq(taskEvents.kind, "info_requested"));
    expect(info?.subjectContributorId).toBe(lena.id);

    expect(await listSuggestions(db, "votes")).toMatchObject([
      { title: "Sort the wall A–Z", voteCount: 1, needsInfo: true, suggestedBy: { handle: "lena-k" } },
    ]);

    await transitionTask(db, { taskId: s.id, action: "accept", actor: ada, accept: { area: "web", size: "S", criteria: ["A–Z sort on /contributors"] } });
    expect(await listSuggestions(db)).toEqual([]);
    expect(await getAdminTask(db, s.id)).toMatchObject({ status: "open", needsInfo: false, criteria: ["A–Z sort on /contributors"] });
  });

  it("sorts Most wanted by votes", async () => {
    const one = await suggestTask(db, lena, suggestion("First", "bug"));
    const two = await suggestTask(db, jonas, suggestion("Second", "bug"));
    await vote(db, mira, two.id);
    expect((await listSuggestions(db, "oldest")).map((s) => s.number)).toEqual([one.id, two.id]);
    expect((await listSuggestions(db, "votes")).map((s) => s.number)).toEqual([two.id, one.id]);
  });
});

describe("moderation and Werk", () => {
  it("hides and shows a post with a reason members keep", async () => {
    const task = await openTask();
    const post = await addPost(db, lena, task.id, { body: "Buy cheap watches" });
    expect(await code(() => setPostHidden(db, "ada", post.id, false, "Fine"))).toBe("invalid_state");
    await setPostHidden(db, "ada", post.id, true, "Spam");
    expect((await db.select().from(taskPosts))[0]).toMatchObject({ hiddenBy: "ada", hiddenReason: "Spam" });
    expect((await getPublicTask(db, task.id))?.posts[0]).toMatchObject({ hidden: true, body: null });
    expect((await getAdminTask(db, task.id)).posts[0]).toMatchObject({ hidden: true, body: "Buy cheap watches", hiddenReason: "Spam" });
    await setPostHidden(db, "ada", post.id, false, "Not spam after all");
    expect((await db.select().from(taskPosts))[0]).toMatchObject({ hiddenAt: null, hiddenReason: null });
    expect(await kinds(task.id)).toEqual(["post_hidden", "post_unhidden"]);
    expect((await getPublicTask(db, task.id))?.events).toEqual([]);
  });

  it("posts as a member, and only on a published task", async () => {
    const draft = await openTask({ status: "draft" });
    expect(await code(() => addMemberPost(db, "ada", draft.id, { body: "Hi" }))).toBe("invalid_state");
    const task = await openTask();
    const post = await addMemberPost(db, "ada", task.id, { body: "Ask us anything here." });
    const reply = await addMemberPost(db, "grace", task.id, { body: "And here.", replyTo: post.id });
    expect(await code(() => addMemberPost(db, "ada", task.id, { body: "x", replyTo: reply.id }))).toBe("invalid");
    expect(await kinds(task.id)).toEqual(["member_posted", "member_posted"]);
    expect((await getPublicTask(db, task.id))?.posts[0]?.author).toEqual({ kind: "member", name: "Ada" });
  });

  it("suspends and lifts it, keeping who and why", async () => {
    await setContributorSuspended(db, "ada", jonas.id, true, "Spam in three threads");
    expect(await code(() => setContributorSuspended(db, "ada", jonas.id, true, "again"))).toBe("invalid_state");
    let [row] = await db.select().from(members).where(eq(members.id, jonas.id));
    expect(row).toMatchObject({ suspendedBy: "ada", suspendedReason: "Spam in three threads" });
    expect(row!.suspendedAt).not.toBeNull();
    expect((await listAdminContributors(db)).find((c) => c.id === jonas.id)).toMatchObject({ suspended: true });
    await setContributorSuspended(db, "ada", jonas.id, false, "Talked it through");
    [row] = await db.select().from(members).where(eq(members.id, jonas.id));
    expect(row).toMatchObject({ suspendedAt: null, suspendedBy: null, suspendedReason: null });
  });

  it("adjusts Werk with a new row, on the task's record when there is one", async () => {
    const task = await openTask({ status: "done", assigneeId: lena.id, doneAt: new Date() });
    const nobody = "00000000-0000-4000-8000-000000000000";
    expect(await code(() => adjustWerk(db, { contributorId: nobody, delta: 1, reason: "x", memberId: "ada" }))).toBe("invalid");
    expect(await code(() => adjustWerk(db, { contributorId: lena.id, delta: 1, reason: "x", memberId: "ada", taskId: 99_999 }))).toBe("invalid");
    await adjustWerk(db, { contributorId: lena.id, delta: -3, reason: "Reverted in #215", memberId: "ada", taskId: task.id, now: new Date("2026-10-01") });
    await adjustWerk(db, { contributorId: lena.id, delta: 2, reason: "Extra docs", memberId: "grace", now: new Date("2026-10-02") });
    expect(await db.select().from(werkLedger)).toHaveLength(2);
    expect(await kinds(task.id)).toEqual(["werk_adjusted"]);
    expect((await listWerkLedger(db)).map((r) => [r.delta, r.byMember?.name, r.task?.id ?? null])).toEqual([
      [2, "Grace", null],
      [-3, "Ada", `NW-${task.id}`],
    ]);
    expect((await listAdminContributors(db)).find((c) => c.id === lena.id)).toMatchObject({ werk: -1, done: 1 });
  });
});
