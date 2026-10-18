// The board against a real schema (PGlite): transitions with their events and Werk, the
// contributor rules and limits, and what the public reads leave out.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TASK_LIMITS, contributorListQuery, memberTaskInput, proposalInput, suggestionInput, taskListQuery } from "@nw/contracts";
import {
  members,
  taskEvents,
  taskPosts,
  taskProposals,
  tasks,
  werkLedger,
  type Member,
  type Database,
} from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import {
  addPost,
  adjustWerk,
  chooseProposal,
  createOwnTask,
  deleteContributor,
  getPublicContributor,
  getPublicTask,
  listPublicContributors,
  listPublicTasks,
  myProposals,
  propose,
  signInWithEmail,
  signInWithGitHub,
  suggestTask,
  toContributorMe,
  transitionTask,
  unvote,
  updateProfile,
  vote,
  withdrawProposal,
  TaskRuleError,
  NOT_CHOSEN_NOTE,
} from "./index.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

let lena: Member;
let jonas: Member;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values({ id: "ada", handle: "ada", displayName: "Ada", email: "ada@novawerk.io", role: "maintainer" });
  lena = await signInWithGitHub(db, { id: 101, login: "Lena-K", name: "Lena Krause", avatarUrl: "https://avatars.example/101" });
  jonas = await signInWithGitHub(db, { id: 102, login: "jonas", name: null, avatarUrl: null });
});

const ada = { kind: "member", id: "ada" } as const;
const wallOf = async (q: Record<string, string>) => (await listPublicContributors(db, contributorListQuery.parse(q))).contributors;
const plan = (approach = "Add a skeleton to the list") => proposalInput.parse({ approach, eta: "week", readCriteria: true });

async function openTask(fields: Partial<typeof tasks.$inferInsert> = {}) {
  const [task] = await db
    .insert(tasks)
    .values({ title: "Dark mode toggle", summary: "A toggle in the header", area: "web", size: "M", status: "open", criteria: ["Toggle works"], ...fields })
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

describe("accounts", () => {
  it("creates a contributor from GitHub with a free handle and finds them again by id", async () => {
    expect(lena.handle).toBe("lena-k");
    expect(lena.public).toBe(false);
    const again = await signInWithGitHub(db, { id: 101, login: "lena-renamed", name: "Lena", avatarUrl: null });
    expect(again.id).toBe(lena.id);
    expect(again.githubLogin).toBe("lena-renamed");
    const other = await signInWithGitHub(db, { id: 999, login: "lena-k", name: null, avatarUrl: null });
    expect(other.handle).toBe("lena-k-2");
  });

  it("signs in by email, then links GitHub, but not one that belongs to someone else", async () => {
    const mira = await signInWithEmail(db, "Mira@Example.com");
    expect(mira).toMatchObject({ email: "mira@example.com", githubId: null });
    // Nothing from the private address shows: a neutral handle and name until they pick one.
    expect(mira.handle).toMatch(/^contributor-[0-9a-f]{4}$/);
    expect(mira.displayName).toBe(mira.handle);
    expect(toContributorMe(mira).defaultHandle).toBe(true);
    expect((await signInWithEmail(db, "mira@example.com")).id).toBe(mira.id);
    expect(await code(() => signInWithGitHub(db, { id: 101, login: "x", name: null, avatarUrl: null }, mira.id))).toBe("conflict");
    const linked = await signInWithGitHub(db, { id: 300, login: "mira-gh", name: null, avatarUrl: null }, mira.id);
    expect(linked).toMatchObject({ id: mira.id, githubId: 300, email: "mira@example.com" });
    expect(linked.sessionsRevokedAt).not.toBeNull();
    // Linking again with the same account is fine; another one never replaces it.
    await signInWithGitHub(db, { id: 300, login: "mira-gh", name: null, avatarUrl: null }, mira.id);
    expect(await code(() => signInWithGitHub(db, { id: 301, login: "other", name: null, avatarUrl: null }, mira.id))).toBe("conflict");
    expect((await db.select().from(members).where(eq(members.id, mira.id)))[0]?.githubId).toBe(300);
  });

  it("keeps GitHub's verified email for notices only: never a way to sign in", async () => {
    const newcomer = await signInWithGitHub(db, { id: 400, login: "neu", name: null, avatarUrl: null, email: "neu@example.com" });
    expect(newcomer).toMatchObject({ email: null, notifyEmail: "neu@example.com" });
    expect(toContributorMe(newcomer).notifyEmail).toBe("n***@example.com"); // masked for its owner
    // It follows GitHub's current verified primary; a sign-in without one keeps it.
    expect((await signInWithGitHub(db, { id: 400, login: "neu", name: null, avatarUrl: null, email: "new@example.com" })).notifyEmail).toBe("new@example.com");
    expect((await signInWithGitHub(db, { id: 400, login: "neu", name: null, avatarUrl: null, email: null })).notifyEmail).toBe("new@example.com");
    expect((await signInWithGitHub(db, { id: 101, login: "lena-k", name: null, avatarUrl: null, email: "lena@example.com" })).notifyEmail).toBe("lena@example.com");

    // Whoever controls that mailbox can't get into the GitHub account with an emailed code:
    // signing in by email finds (or makes) an account by `email` only.
    const stranger = await signInWithEmail(db, "new@example.com");
    expect(stranger.id).not.toBe(newcomer.id);
    expect(stranger.githubId).toBeNull();

    // Linking keeps the address verified by code as the sign-in one.
    const mira = await signInWithEmail(db, "mira@example.com");
    const linked = await signInWithGitHub(db, { id: 500, login: "mira", name: null, avatarUrl: null, email: "mira@github.example" }, mira.id);
    expect(linked).toMatchObject({ email: "mira@example.com", notifyEmail: "mira@github.example" });
  });

  it("refuses a handle someone else has", async () => {
    expect(await code(() => updateProfile(db, jonas.id, { handle: "lena-k" }))).toBe("conflict");
    expect((await updateProfile(db, jonas.id, { handle: "jonas-w", public: true, acceptPledge: true })).pledgeAcceptedAt).not.toBeNull();
  });
});

describe("transitions", () => {
  it("assigns the chosen plan, declines the others privately, and records every step", async () => {
    const task = await openTask();
    const mine = await propose(db, lena, task.id, plan());
    const theirs = await propose(db, jonas, task.id, plan("Another way"));
    await chooseProposal(db, { proposalId: mine.id, memberId: "ada" });

    const [after] = await db.select().from(tasks);
    expect(after).toMatchObject({ status: "assigned", assigneeId: lena.id });
    const proposals = await db.select().from(taskProposals);
    expect(proposals.find((p) => p.id === mine.id)?.status).toBe("chosen");
    expect(proposals.find((p) => p.id === theirs.id)).toMatchObject({ status: "not_chosen", declineNote: NOT_CHOSEN_NOTE });

    await transitionTask(db, { taskId: task.id, action: "link_pr", actor: { kind: "contributor", id: lena.id }, prUrl: "https://github.com/Novawerk/novawerk-workspace/pull/212" });
    await transitionTask(db, { taskId: task.id, action: "merge", actor: { kind: "system" } });

    const events = await db.select().from(taskEvents);
    expect(events.map((e) => [e.kind, e.fromStatus, e.toStatus])).toEqual([
      ["assigned", "open", "assigned"],
      ["proposal_declined", null, null],
      ["pr_linked", "assigned", "in_review"],
      ["merged", "in_review", "done"],
    ]);
    const ledger = await db.select().from(werkLedger);
    expect(ledger).toMatchObject([{ contributorId: lena.id, delta: 3, taskId: task.id, pr: "https://github.com/Novawerk/novawerk-workspace/pull/212" }]);
  });

  it("gives an S task to the first plan at once, with no maintainer and no decline note left behind", async () => {
    const task = await openTask({ size: "S" });
    const mine = await propose(db, lena, task.id, plan());
    expect(mine).toMatchObject({ status: "chosen", decidedBy: null });
    expect((await db.select().from(tasks))[0]).toMatchObject({ status: "assigned", assigneeId: lena.id });
    const events = await db.select().from(taskEvents);
    expect(events).toMatchObject([{ kind: "assigned", actorMemberId: null, actorContributorId: null, subjectContributorId: lena.id }]);
    // Taken: nobody else can propose on it.
    expect(await code(() => propose(db, jonas, task.id, plan()))).toBe("invalid_state");
  });

  it("gives an S task to its author's plan even while they hold other tasks", async () => {
    await openTask({ status: "assigned", assigneeId: lena.id });
    const small = await openTask({ title: "Small", size: "S" });
    expect((await propose(db, lena, small.id, plan())).status).toBe("chosen");
    expect((await db.select().from(tasks).where(eq(tasks.id, small.id)))[0]).toMatchObject({ status: "assigned", assigneeId: lena.id });
  });

  it("still waits for a maintainer on M and bigger tasks", async () => {
    const task = await openTask({ size: "M" });
    expect((await propose(db, lena, task.id, plan())).status).toBe("pending");
    expect((await db.select().from(tasks))[0]?.status).toBe("open");
  });

  it("awards Werk once per task and PR, and adjustments are new rows with a reason", async () => {
    const task = await openTask({ status: "in_review", assigneeId: lena.id, prUrl: "https://github.com/x/y/pull/1" });
    await transitionTask(db, { taskId: task.id, action: "merge", actor: { kind: "system" } });
    expect(await code(() => transitionTask(db, { taskId: task.id, action: "merge", actor: { kind: "system" } }))).toBe("invalid_state");
    await expect(db.insert(werkLedger).values({ contributorId: lena.id, delta: 3, reason: "again", taskId: task.id, pr: "https://github.com/x/y/pull/1" })).rejects.toThrow();
    expect(await code(() => adjustWerk(db, { contributorId: lena.id, delta: -3, reason: " ", memberId: "ada" }))).toBe("invalid");
    await adjustWerk(db, { contributorId: lena.id, delta: -3, reason: "Reverted in #215", memberId: "ada", taskId: task.id });
    expect((await getPublicContributor(db, "lena-k"))).toBeNull(); // private profile
    await updateProfile(db, lena.id, { public: true });
    expect((await getPublicContributor(db, "lena-k"))?.stats).toEqual({ done: 1, inProgress: 0, werk: 0 });
  });

  it("lets a person hold any number of tasks, and GitHub is needed to get one", async () => {
    await openTask({ status: "assigned", assigneeId: lena.id });
    await openTask({ status: "in_review", assigneeId: lena.id });
    const second = await openTask({ title: "Another" });
    const p = await propose(db, lena, second.id, plan());
    expect((await chooseProposal(db, { proposalId: p.id, memberId: "ada" })).assigneeId).toBe(lena.id);

    const mira = await signInWithEmail(db, "mira@example.com");
    expect(await code(() => propose(db, mira, second.id, plan()))).toBe("github_required");
  });

  it("records who each event is about, for the notices", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    await chooseProposal(db, { proposalId: p.id, memberId: "ada" });
    await transitionTask(db, { taskId: task.id, action: "release", actor: ada, note: "Moving on" });
    const s = await suggestTask(db, jonas, suggestionInput.parse({ title: "Sort the wall", kind: "improvement", body: "An A–Z sort helps find people.", where: "site" }));
    await transitionTask(db, { taskId: s.id, action: "decline", actor: ada, note: "Not now" });
    const events = await db.select({ kind: taskEvents.kind, subject: taskEvents.subjectContributorId }).from(taskEvents).orderBy(taskEvents.id);
    expect(events).toEqual([
      { kind: "assigned", subject: lena.id },
      { kind: "released", subject: lena.id },
      { kind: "suggested", subject: null },
      { kind: "declined", subject: jonas.id },
    ]);
  });

  it("releases a task back to open, and only the assignee or a member may", async () => {
    const task = await openTask({ status: "assigned", assigneeId: lena.id });
    expect(await code(() => transitionTask(db, { taskId: task.id, action: "release", actor: { kind: "contributor", id: jonas.id } }))).toBe("forbidden");
    await transitionTask(db, { taskId: task.id, action: "release", actor: { kind: "contributor", id: lena.id }, note: "No time this month" });
    const [after] = await db.select().from(tasks);
    expect(after).toMatchObject({ status: "open", assigneeId: null });
  });

  it("accepts a suggestion only with an area and a size, and gives it to the suggester who asked", async () => {
    const s = await suggestTask(db, lena, suggestionInput.parse({ title: "Sort the wall A–Z", kind: "improvement", body: "The wall is long now; an A–Z sort helps find people.", where: "site", doItMyself: true }));
    expect(await code(() => transitionTask(db, { taskId: s.id, action: "accept", actor: ada }))).toBe("invalid");
    expect(await code(() => transitionTask(db, { taskId: s.id, action: "accept_assign", actor: ada, assigneeId: jonas.id, accept: { area: "web", size: "S" } }))).toBe("invalid");
    const done = await transitionTask(db, { taskId: s.id, action: "accept_assign", actor: ada, accept: { area: "web", size: "S" } });
    expect(done).toMatchObject({ status: "assigned", assigneeId: lena.id, area: "web", size: "S" });
    expect(done.acceptedAt).not.toBeNull();
  });
});

describe("contributor rules", () => {
  it("proposes only on open tasks, once per task, five a day", async () => {
    const draft = await openTask({ status: "draft" });
    expect(await code(() => propose(db, lena, draft.id, plan()))).toBe("not_found");
    const assigned = await openTask({ status: "assigned", assigneeId: jonas.id });
    expect(await code(() => propose(db, lena, assigned.id, plan()))).toBe("invalid_state");

    const first = await openTask();
    const p = await propose(db, lena, first.id, plan());
    expect(await code(() => propose(db, lena, first.id, plan()))).toBe("conflict");
    await withdrawProposal(db, lena, p.id);
    await propose(db, lena, first.id, plan()); // again after withdrawing: 2 today

    for (let i = 0; i < 3; i++) await propose(db, lena, (await openTask({ title: `T${i}` })).id, plan());
    expect(await code(async () => propose(db, lena, (await openTask({ title: "T6" })).id, plan()))).toBe("rate_limited");
  });

  it("edits and withdraws only your own pending proposal", async () => {
    const task = await openTask();
    const p = await propose(db, lena, task.id, plan());
    expect(await code(() => withdrawProposal(db, jonas, p.id))).toBe("forbidden");
    await withdrawProposal(db, lena, p.id);
    expect(await code(() => withdrawProposal(db, lena, p.id))).toBe("not_found");
  });

  it("posts with one level of replies, thirty a day, never on a locked thread", async () => {
    const task = await openTask();
    const post = await addPost(db, lena, task.id, { body: "Which header, desktop or both?" });
    const reply = await addPost(db, jonas, task.id, { body: "Both", replyTo: post.id });
    expect(await code(() => addPost(db, lena, task.id, { body: "Nested", replyTo: reply.id }))).toBe("invalid");
    for (let i = 0; i < 29; i++) await addPost(db, lena, task.id, { body: `Post ${i}` });
    expect(await code(() => addPost(db, lena, task.id, { body: "One too many" }))).toBe("rate_limited");

    const locked = await openTask({ threadLockedAt: new Date() });
    expect(await code(() => addPost(db, jonas, locked.id, { body: "Hi" }))).toBe("invalid_state");
  });

  it("allows three open suggestions, +1s from others only, and none after triage", async () => {
    const input = suggestionInput.parse({ title: "Idea", kind: "bug", body: "Steps: open /tasks on a phone, the chips overflow.", where: "site" });
    const s = await suggestTask(db, lena, input);
    await suggestTask(db, lena, input);
    await suggestTask(db, lena, input);
    expect(await code(() => suggestTask(db, lena, input))).toBe("rate_limited");

    expect(await code(() => vote(db, lena, s.id))).toBe("forbidden");
    await vote(db, jonas, s.id);
    await vote(db, jonas, s.id);
    expect((await getPublicTask(db, s.id))?.voteCount).toBe(1);
    await unvote(db, jonas, s.id);
    await vote(db, jonas, s.id);

    await transitionTask(db, { taskId: s.id, action: "accept", actor: ada, accept: { area: "web", size: "S" } });
    expect(await code(() => unvote(db, jonas, s.id))).toBe("invalid_state");
    expect((await getPublicTask(db, s.id))?.voteCount).toBe(1);
  });

  it("lets a suspended contributor read but not write, and keeps them off the wall", async () => {
    const task = await openTask();
    const pending = await propose(db, lena, task.id, plan());
    await openTask({ status: "done", assigneeId: lena.id, doneAt: new Date() });
    await updateProfile(db, lena.id, { public: true });
    expect(await wallOf({})).toHaveLength(1);

    const [suspended] = await db.update(members).set({ suspendedAt: new Date() }).where(eq(members.id, lena.id)).returning();
    expect(await code(() => addPost(db, suspended!, task.id, { body: "Hi" }))).toBe("suspended");
    const another = await openTask();
    expect(await code(() => propose(db, suspended!, another.id, plan()))).toBe("suspended");
    expect(await code(() => withdrawProposal(db, suspended!, pending.id))).toBe("suspended");
    expect(await code(() => updateProfile(db, lena.id, { bio: "Changed" }))).toBe("suspended");
    // The stale row a request started with doesn't help: the fresh one is checked.
    expect(await code(() => addPost(db, lena, task.id, { body: "Hi" }))).toBe("suspended");
    expect(await wallOf({})).toEqual([]);
    expect(await getPublicContributor(db, "lena-k")).toBeNull();
  });

  it("takes one proposal and stops at the post limit when requests arrive together", async () => {
    const task = await openTask();
    const results = await Promise.all([1, 2, 3].map(() => code(() => propose(db, lena, task.id, plan()))));
    expect(results.sort()).toEqual(["conflict", "conflict", "ok"]);
    for (let i = 0; i < 28; i++) await addPost(db, lena, task.id, { body: `Post ${i}` });
    const posts = await Promise.all([1, 2, 3].map(() => code(() => addPost(db, lena, task.id, { body: "Last" }))));
    expect(posts.sort()).toEqual(["ok", "ok", "rate_limited"]);
  });
});

describe("tasks members create", () => {
  const own = (size: "S" | "M" | "L" | "XL", title = "Sort the wall A–Z") =>
    memberTaskInput.parse({ title, body: "The wall is in join order; people look for names.", criteria: ["Sorted by name"], area: "web", size });

  it("gives an S task to its author at once, with no plan, no maintainer and no mail to themselves", async () => {
    const task = await createOwnTask(db, lena, own("S"));
    expect(task).toMatchObject({ status: "assigned", assigneeId: lena.id, createdByMemberId: lena.id, size: "S" });
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id));
    expect(events).toMatchObject([
      { kind: "created", toStatus: "open", actorContributorId: lena.id },
      { kind: "assigned", fromStatus: "open", toStatus: "assigned", actorMemberId: null, actorContributorId: null, subjectContributorId: null },
    ]);
    expect(await db.select().from(taskProposals)).toEqual([]);
  });

  it("opens an M task on the board with no review, to be discussed and chosen like any other", async () => {
    const task = await createOwnTask(db, jonas, own("M"));
    expect(task).toMatchObject({ status: "open", assigneeId: null, suggestedBy: null, size: "M" });
    const listed = await listPublicTasks(db, taskListQuery.parse({}));
    expect(listed.tasks.map((t) => t.id)).toEqual([`NW-${task.id}`]);
    expect((await propose(db, jonas, task.id, plan())).status).toBe("pending");
  });

  it("sends L and XL to review, and accepting keeps what the author set", async () => {
    for (const size of ["L", "XL"] as const) {
      const task = await createOwnTask(db, jonas, own(size, `A ${size} task`));
      expect(task).toMatchObject({ status: "suggested", kind: "task", suggestedBy: jonas.id, wantsIt: true, size, area: "web" });
    }
    const [l] = await db.select().from(tasks).where(eq(tasks.title, "A L task"));
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, l!.id));
    expect(events).toMatchObject([{ kind: "suggested", toStatus: "suggested", actorContributorId: jonas.id }]);
    const accepted = await transitionTask(db, { taskId: l!.id, action: "accept", actor: ada });
    expect(accepted).toMatchObject({ status: "open", size: "L", area: "web", criteria: ["Sorted by name"] });
  });

  it("keeps the usual limits: GitHub for an S task, 10 new tasks a day, but none on tasks held", async () => {
    const emailOnly = await signInWithEmail(db, "mila@example.org");
    expect(await code(() => createOwnTask(db, emailOnly, own("S")))).toBe("github_required");
    // Without GitHub, an M task is still fine: it is only on the board.
    expect((await createOwnTask(db, emailOnly, own("M"))).status).toBe("open");

    // Lena holds as many tasks as she likes.
    expect((await createOwnTask(db, lena, own("S", "First"))).status).toBe("assigned");
    expect((await createOwnTask(db, lena, own("S", "Second"))).status).toBe("assigned");
    expect((await createOwnTask(db, lena, own("S", "Third"))).status).toBe("assigned");

    for (let i = 1; i <= TASK_LIMITS.tasksCreatedPerDay; i++) await createOwnTask(db, jonas, own("M", `Task ${i}`));
    expect(await code(() => createOwnTask(db, jonas, own("M", "One too many")))).toBe("rate_limited");
  });

  it("refuses a suspended account", async () => {
    await db.update(members).set({ suspendedAt: new Date() }).where(eq(members.id, lena.id));
    const [me] = await db.select().from(members).where(eq(members.id, lena.id));
    expect(await code(() => createOwnTask(db, me!, own("M")))).toBe("suspended");
  });
});

describe("public reads", () => {
  it("filters, searches and pages the board with a cursor", async () => {
    for (let i = 1; i <= 5; i++) await openTask({ title: `Task ${i}`, area: i % 2 ? "web" : "api", skills: i === 3 ? ["drizzle"] : [], updatedAt: new Date(Date.UTC(2026, 9, i)) });
    await openTask({ title: "Secret draft", status: "draft" });

    const page1 = await listPublicTasks(db, taskListQuery.parse({ limit: "2" }));
    expect(page1.tasks.map((t) => t.title)).toEqual(["Task 5", "Task 4"]);
    const page2 = await listPublicTasks(db, taskListQuery.parse({ limit: "2", cursor: page1.nextCursor }));
    const page3 = await listPublicTasks(db, taskListQuery.parse({ limit: "2", cursor: page2.nextCursor }));
    expect([...page2.tasks, ...page3.tasks].map((t) => t.title)).toEqual(["Task 3", "Task 2", "Task 1"]);
    expect(page3.nextCursor).toBeNull();

    expect((await listPublicTasks(db, taskListQuery.parse({ area: "api" }))).tasks).toHaveLength(2);
    expect((await listPublicTasks(db, taskListQuery.parse({ skills: "drizzle" }))).tasks.map((t) => t.title)).toEqual(["Task 3"]);
    expect((await listPublicTasks(db, taskListQuery.parse({ q: "NW-2" }))).tasks.map((t) => t.id)).toEqual(["NW-2"]);
    expect((await listPublicTasks(db, taskListQuery.parse({ q: "secret", status: "all" }))).tasks).toEqual([]);
    expect(await getPublicTask(db, 6)).toBeNull();
    await expect(listPublicTasks(db, taskListQuery.parse({ cursor: "bm9wZQ" }))).rejects.toThrow(TaskRuleError);
  });

  it("refuses crafted cursors instead of passing them to Postgres", async () => {
    const crafted = (value: unknown, sort = "updated") =>
      code(() => listPublicTasks(db, taskListQuery.parse({ sort, cursor: Buffer.from(JSON.stringify(value)).toString("base64url") })));
    expect(await crafted(["2026-02-31 10:00:00+00", 1])).toBe("invalid");
    expect(await crafted(["2026", 1])).toBe("invalid");
    expect(await crafted(["2026-10-01 10:00:00+00", 99_999_999_999])).toBe("invalid");
    expect(await crafted(["2026-10-01 10:00:00.123456+00", 3])).toBe("ok");
    expect(await crafted([1e12, 3], "votes")).toBe("invalid");
    expect(await code(() => listPublicContributors(db, contributorListQuery.parse({ cursor: Buffer.from('["x","1"]').toString("base64url") })))).toBe("invalid");
  });

  it("shows 'has proposals' and sorts suggestions by +1s", async () => {
    const t = await openTask();
    await openTask({ title: "No plans yet" });
    await propose(db, lena, t.id, plan());
    expect((await listPublicTasks(db, taskListQuery.parse({ status: "proposals" }))).tasks.map((x) => [x.title, x.proposalCount])).toEqual([["Dark mode toggle", 1]]);

    const input = suggestionInput.parse({ title: "Few votes", kind: "bug", body: "Something small went wrong somewhere.", where: "site" });
    await suggestTask(db, lena, input);
    const popular = await suggestTask(db, lena, { ...input, title: "Popular" });
    await vote(db, jonas, popular.id);
    const wanted = await listPublicTasks(db, taskListQuery.parse({ status: "suggested", sort: "votes", limit: "1" }));
    expect(wanted.tasks.map((x) => x.title)).toEqual(["Popular"]);
    const next = await listPublicTasks(db, taskListQuery.parse({ status: "suggested", sort: "votes", limit: "1", cursor: wanted.nextCursor }));
    expect(next.tasks.map((x) => x.title)).toEqual(["Few votes"]);
  });

  it("hides hidden posts' text, withdrawn proposals and decline notes; private people show only a handle", async () => {
    const task = await openTask();
    const post = await addPost(db, lena, task.id, { body: "Buy cheap watches" });
    await db.update(taskPosts).set({ hiddenAt: new Date(), hiddenBy: "ada" });
    await addPost(db, jonas, task.id, { body: "Fair question", replyTo: (await addPost(db, jonas, task.id, { body: "How big is it?" })).id });
    const withdrawn = await propose(db, jonas, task.id, plan("Withdrawn plan"));
    await withdrawProposal(db, jonas, withdrawn.id);
    const chosen = await propose(db, lena, task.id, plan());
    await db.insert(taskProposals).values({ taskId: task.id, contributorId: jonas.id, approach: "Plan B", eta: "days" });
    await chooseProposal(db, { proposalId: chosen.id, memberId: "ada", notes: {} });

    const detail = await getPublicTask(db, task.id);
    const json = JSON.stringify(detail);
    expect(json).not.toContain("Buy cheap watches");
    expect(json).not.toContain("Withdrawn plan");
    expect(json).not.toContain(NOT_CHOSEN_NOTE);
    expect(json).not.toContain("@");
    expect(detail?.posts[0]).toMatchObject({ id: post.id, hidden: true, body: null, author: null });
    expect(detail?.posts[1]?.replies).toHaveLength(1);
    expect(detail?.proposals.map((p) => p.status)).toEqual(["chosen", "not_chosen"]);
    expect(detail?.assignee).toEqual({ kind: "contributor", handle: "lena-k", name: null, avatarUrl: null, public: false });
    expect(detail?.postCount).toBe(2);

    const own = await myProposals(db, jonas.id);
    expect(own.find((p) => p.approach === "Plan B")?.declineNote).toBe(NOT_CHOSEN_NOTE);
    expect(own.find((p) => p.approach === "Withdrawn plan")?.withdrawn).toBe(true);
  });

  it("puts public profiles with merged work or an accepted idea on the wall, newest first or A–Z", async () => {
    await openTask({ status: "done", assigneeId: lena.id, area: "api", doneAt: new Date("2026-10-01") });
    await openTask({ kind: "improvement", status: "open", suggestedBy: jonas.id, acceptedAt: new Date("2026-10-05") });
    const mira = await signInWithEmail(db, "mira@example.com");
    await updateProfile(db, mira.id, { public: true }); // nothing merged yet
    expect(await wallOf({ sort: "newest" })).toEqual([]); // both private

    await updateProfile(db, lena.id, { public: true });
    await updateProfile(db, jonas.id, { public: true });
    const wall = await wallOf({ sort: "newest" });
    expect(wall.map((c) => [c.handle, c.idea, c.areas])).toEqual([["jonas", true, []], ["lena-k", false, ["api"]]]);
    expect((await wallOf({ sort: "az" })).map((c) => c.handle)).toEqual(["jonas", "lena-k"]);
    expect((await wallOf({ sort: "newest", area: "api" })).map((c) => c.handle)).toEqual(["lena-k"]);
    expect(JSON.stringify(wall)).not.toContain("mira@example.com");

    await updateProfile(db, jonas.id, { onWall: false });
    expect((await wallOf({ sort: "newest" })).map((c) => c.handle)).toEqual(["lena-k"]);
    await updateProfile(db, jonas.id, { onWall: true });
    expect(await getPublicContributor(db, "jonas")).not.toBeNull(); // off the wall, still public
  });

  it("pages the wall with a cursor, newest first and A–Z", async () => {
    for (let i = 0; i < 5; i++) {
      const c = await signInWithGitHub(db, { id: 500 + i, login: `p${i}`, name: null, avatarUrl: null });
      await updateProfile(db, c.id, { public: true });
      await openTask({ status: "done", assigneeId: c.id, doneAt: new Date(Date.UTC(2026, 9, 1 + i)) });
    }
    for (const [sort, expected] of [["newest", ["p4", "p3", "p2", "p1", "p0"]], ["az", ["p0", "p1", "p2", "p3", "p4"]]] as const) {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await listPublicContributors(db, contributorListQuery.parse({ sort, limit: "2", ...(cursor ? { cursor } : {}) }));
        seen.push(...page.contributors.map((c) => c.handle));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toEqual(expected);
    }
  });
});

describe("deleting an account", () => {
  it("removes the profile and proposals, releases the task held, and leaves 'a former contributor'", async () => {
    const held = await openTask({ status: "assigned", assigneeId: lena.id });
    const merged = await openTask({ title: "Merged before", status: "done", assigneeId: jonas.id, doneAt: new Date() });
    const other = await openTask({ title: "Other" });
    await propose(db, lena, other.id, plan());
    await addPost(db, lena, other.id, { body: "I can take this one" });
    await db.insert(werkLedger).values({ contributorId: lena.id, delta: 1, reason: "Merged NW-0", pr: "https://github.com/x/y/pull/9" });

    expect(await code(() => deleteContributor(db, lena.id, "someone-else"))).toBe("invalid");
    await deleteContributor(db, jonas.id, "jonas");
    expect((await getPublicTask(db, merged.id))?.assignee).toEqual({ kind: "former" });
    await deleteContributor(db, lena.id, "LENA-K");

    expect((await db.select().from(members)).map((m) => m.id)).toEqual(["ada"]);
    expect(await db.select().from(taskProposals)).toEqual([]);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, held.id));
    expect(task).toMatchObject({ status: "open", assigneeId: null });
    const detail = await getPublicTask(db, other.id);
    expect(detail?.posts[0]?.author).toEqual({ kind: "former" });
    expect(await db.select().from(werkLedger)).toMatchObject([{ contributorId: null, delta: 1 }]);
  });
});
