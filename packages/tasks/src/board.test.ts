// The board against a real schema (PGlite): transitions with their events and Werk, the
// contributor rules and limits, and what the public reads leave out.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proposalInput, suggestionInput, taskListQuery } from "@nw/contracts";
import {
  contributors,
  members,
  taskEvents,
  taskPosts,
  taskProposals,
  tasks,
  werkLedger,
  type Contributor,
  type Database,
} from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import {
  addPost,
  adjustWerk,
  chooseProposal,
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

let lena: Contributor;
let jonas: Contributor;
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values({ id: "ada", displayName: "Ada", email: "ada@novawerk.io", canAdmin: true });
  lena = await signInWithGitHub(db, { id: 101, login: "Lena-K", name: "Lena Krause", avatarUrl: "https://avatars.example/101" });
  jonas = await signInWithGitHub(db, { id: 102, login: "jonas", name: null, avatarUrl: null });
});

const ada = { kind: "member", id: "ada" } as const;
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
    expect(mira).toMatchObject({ handle: "mira", email: "mira@example.com", githubId: null });
    expect((await signInWithEmail(db, "mira@example.com")).id).toBe(mira.id);
    expect(await code(() => signInWithGitHub(db, { id: 101, login: "x", name: null, avatarUrl: null }, mira.id))).toBe("conflict");
    const linked = await signInWithGitHub(db, { id: 300, login: "mira-gh", name: null, avatarUrl: null }, mira.id);
    expect(linked).toMatchObject({ id: mira.id, githubId: 300, email: "mira@example.com" });
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
      ["pr_linked", "assigned", "in_review"],
      ["merged", "in_review", "done"],
    ]);
    const ledger = await db.select().from(werkLedger);
    expect(ledger).toMatchObject([{ contributorId: lena.id, delta: 3, taskId: task.id, pr: "https://github.com/Novawerk/novawerk-workspace/pull/212" }]);
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

  it("keeps one task in progress per person, and GitHub is needed to get one", async () => {
    await openTask({ status: "assigned", assigneeId: lena.id });
    const second = await openTask({ title: "Another" });
    const p = await propose(db, lena, second.id, plan());
    expect(await code(() => chooseProposal(db, { proposalId: p.id, memberId: "ada" }))).toBe("conflict");

    const mira = await signInWithEmail(db, "mira@example.com");
    expect(await code(() => propose(db, mira, second.id, plan()))).toBe("github_required");
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

  it("lets a suspended contributor read but not write", async () => {
    const task = await openTask();
    const [suspended] = await db.update(contributors).set({ suspendedAt: new Date() }).returning();
    expect(await code(() => addPost(db, suspended!, task.id, { body: "Hi" }))).toBe("suspended");
    expect(await code(() => propose(db, suspended!, task.id, plan()))).toBe("suspended");
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
    expect(await listPublicContributors(db, { sort: "newest" })).toEqual([]); // both private

    await updateProfile(db, lena.id, { public: true });
    await updateProfile(db, jonas.id, { public: true });
    const wall = await listPublicContributors(db, { sort: "newest" });
    expect(wall.map((c) => [c.handle, c.idea, c.areas])).toEqual([["jonas", true, []], ["lena-k", false, ["api"]]]);
    expect((await listPublicContributors(db, { sort: "az" })).map((c) => c.handle)).toEqual(["jonas", "lena-k"]);
    expect((await listPublicContributors(db, { sort: "newest", area: "api" })).map((c) => c.handle)).toEqual(["lena-k"]);
    expect(JSON.stringify(wall)).not.toContain("mira@example.com");

    await updateProfile(db, jonas.id, { onWall: false });
    expect((await listPublicContributors(db, { sort: "newest" })).map((c) => c.handle)).toEqual(["lena-k"]);
    expect(await getPublicContributor(db, "jonas")).not.toBeNull(); // off the wall, still public
  });
});

describe("deleting an account", () => {
  it("removes the profile and proposals, releases the task held, and leaves 'a former contributor'", async () => {
    const held = await openTask({ status: "assigned", assigneeId: lena.id });
    const other = await openTask({ title: "Other" });
    await propose(db, lena, other.id, plan());
    await addPost(db, lena, other.id, { body: "I can take this one" });
    await db.insert(werkLedger).values({ contributorId: lena.id, delta: 1, reason: "Merged NW-0", pr: "https://github.com/x/y/pull/9" });

    expect(await code(() => deleteContributor(db, lena.id, "someone-else"))).toBe("invalid");
    await deleteContributor(db, lena.id, "LENA-K");

    expect(await db.select().from(contributors)).toHaveLength(1);
    expect(await db.select().from(taskProposals)).toEqual([]);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, held.id));
    expect(task).toMatchObject({ status: "open", assigneeId: null });
    const detail = await getPublicTask(db, other.id);
    expect(detail?.posts[0]?.author).toEqual({ kind: "former" });
    expect(await db.select().from(werkLedger)).toMatchObject([{ contributorId: null, delta: 1 }]);
  });
});
