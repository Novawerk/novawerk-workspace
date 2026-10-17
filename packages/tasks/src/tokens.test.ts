// Personal access tokens and what an agent does with one: drafts that count only once
// confirmed, and "via agent · <token name>" on everything it writes.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proposalInput, suggestionInput, tokenCreateInput } from "@nw/contracts";
import { contributorTokens, members, taskProposals, tasks, type Member, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import {
  TaskRuleError,
  addPost,
  authenticateToken,
  confirmDraftProposal,
  createToken,
  getPublicTask,
  hashTokenSecret,
  linkPrByHand,
  listTokens,
  myProposals,
  myTasks,
  myVotes,
  propose,
  requireScope,
  revokeToken,
  signInWithEmail,
  signInWithGitHub,
  suggestTask,
  transitionTask,
  updateProposal,
  vote,
  withdrawProposal,
} from "./index.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

let lena: Member;
let jonas: Member;
beforeEach(async () => {
  await resetDb(db);
  lena = await signInWithGitHub(db, { id: 101, login: "lena-k", name: "Lena", avatarUrl: null });
  jonas = await signInWithGitHub(db, { id: 102, login: "jonas", name: null, avatarUrl: null });
});

const DAY = 24 * 3_600_000;
const newToken = (c: Member, fields: Record<string, unknown> = {}) =>
  createToken(db, c.id, tokenCreateInput.parse({ name: "Claude Code", scopes: ["proposals:write"], expiresInDays: 30, ...fields }));
const plan = proposalInput.parse({ approach: "Toggle in the header", eta: "week", readCriteria: true });

async function openTask(fields: Partial<typeof tasks.$inferInsert> = {}) {
  const [row] = await db.insert(tasks).values({ title: "Dark mode", area: "web", size: "M", status: "open", ...fields }).returning();
  return row!;
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

describe("tokens", () => {
  it("shows the secret once, keeps only its hash, and always includes tasks:read", async () => {
    const created = await newToken(lena, { scopes: ["discussion:write", "proposals:write"] });
    expect(created.secret).toMatch(/^nwt_[A-Za-z0-9_-]{43}$/);
    expect(created.prefix).toBe(created.secret.slice(0, 12));
    expect(created.scopes).toEqual(["tasks:read", "proposals:write", "discussion:write"]);
    const [row] = await db.select().from(contributorTokens);
    expect(row?.secretHash).toBe(hashTokenSecret(created.secret));
    expect(JSON.stringify(row)).not.toContain(created.secret);
    expect(JSON.stringify(await listTokens(db, lena.id))).not.toContain(created.secret);
    expect(new Date(created.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * DAY);
  });

  it("authenticates a live token, never a revoked, expired or made-up one", async () => {
    const { secret, id } = await newToken(lena);
    expect(await authenticateToken(db, secret)).toMatchObject({ contributor: { id: lena.id }, token: { id, name: "Claude Code" } });
    expect((await db.select().from(contributorTokens))[0]?.lastUsedAt).not.toBeNull();
    expect(await authenticateToken(db, secret, new Date(Date.now() + 31 * DAY))).toBeNull();
    expect(await authenticateToken(db, `nwt_${"A".repeat(43)}`)).toBeNull();
    expect(await authenticateToken(db, "not a token")).toBeNull();

    expect(await code(() => revokeToken(db, jonas.id, id))).toBe("not_found");
    await revokeToken(db, lena.id, id);
    await revokeToken(db, lena.id, id);
    expect(await authenticateToken(db, secret)).toBeNull();
    expect(await listTokens(db, lena.id)).toEqual([]);
  });

  it("allows ten live tokens per person", async () => {
    for (let i = 0; i < 10; i++) await newToken(lena, { name: `t${i}` });
    expect(await code(() => newToken(lena))).toBe("rate_limited");
    expect(await code(() => newToken(jonas))).toBe("ok");
  });

  it("checks scopes, and a browser session needs none", async () => {
    const token = { id: "t", name: "x", scopes: ["tasks:read" as const] };
    expect(() => requireScope(token, "proposals:write")).toThrow(/proposals:write/);
    expect(() => requireScope(token, "tasks:read")).not.toThrow();
    expect(() => requireScope(undefined, "profile:write")).not.toThrow();
  });
});

describe("what an agent writes", () => {
  it("proposes a draft that nobody else sees until its person confirms it", async () => {
    const task = await openTask();
    const { id: tokenId } = await newToken(lena);
    const draft = await propose(db, lena, task.id, plan, undefined, { tokenId });
    expect(draft.status).toBe("draft");
    expect((await getPublicTask(db, task.id))?.proposals).toEqual([]);
    expect((await getPublicTask(db, task.id))?.proposalCount).toBe(0);
    expect(await code(() => propose(db, lena, task.id, plan))).toBe("conflict"); // one open proposal per task
    expect((await myProposals(db, lena.id))[0]).toMatchObject({ draft: true, viaAgent: "Claude Code" });
    expect((await myTasks(db, lena.id)).proposals).toHaveLength(1);

    expect(await code(() => confirmDraftProposal(db, jonas, draft.id))).toBe("forbidden");
    const confirmed = await confirmDraftProposal(db, lena, draft.id);
    expect(confirmed.status).toBe("pending");
    expect(await code(() => confirmDraftProposal(db, lena, draft.id))).toBe("invalid_state");
    expect((await getPublicTask(db, task.id))?.proposals).toMatchObject([{ status: "pending", viaAgent: "Claude Code" }]);
  });

  it("never takes an S task by itself: the draft counts, and is chosen, only when its person confirms it", async () => {
    const task = await openTask({ size: "S" });
    const { id: tokenId } = await newToken(lena);
    const draft = await propose(db, lena, task.id, plan, undefined, { tokenId });
    expect(draft.status).toBe("draft");
    expect((await db.select().from(tasks))[0]?.status).toBe("open");
    expect((await confirmDraftProposal(db, lena, draft.id)).status).toBe("chosen");
    expect((await db.select().from(tasks))[0]).toMatchObject({ status: "assigned", assigneeId: lena.id });
  });

  it("can't confirm a draft once the task moved on, or without GitHub", async () => {
    const task = await openTask();
    const { id: tokenId } = await newToken(lena);
    const draft = await propose(db, lena, task.id, plan, undefined, { tokenId });
    // Someone else got it meanwhile.
    await db.update(tasks).set({ status: "assigned", assigneeId: jonas.id }).where(eq(tasks.id, task.id));
    expect(await code(() => confirmDraftProposal(db, lena, draft.id))).toBe("invalid_state");
    await withdrawProposal(db, lena, draft.id);
    expect(await db.select().from(taskProposals).where(eq(taskProposals.id, draft.id))).toEqual([]); // a discarded draft is gone

    const mira = await signInWithEmail(db, "mira@example.com");
    const another = await openTask();
    expect(await code(() => propose(db, mira, another.id, plan, undefined, { tokenId }))).toBe("github_required");
  });

  it("marks posts, suggestions and PR links as via agent", async () => {
    const task = await openTask({ status: "assigned", assigneeId: lena.id, assignedAt: new Date() });
    const { id: tokenId } = await newToken(lena, { name: "my script" });
    await addPost(db, lena, task.id, { body: "Progress: half done" }, undefined, { tokenId });
    const pr = {
      repo: "Novawerk/novawerk-workspace",
      number: 9,
      url: "https://github.com/Novawerk/novawerk-workspace/pull/9",
      authorId: 101,
      authorLogin: "lena-k",
      state: "open" as const,
      merged: false,
      taskNumber: task.id,
    };
    await linkPrByHand(db, lena, task.id, pr, { tokenId });
    const s = await suggestTask(
      db,
      lena,
      suggestionInput.parse({ title: "An idea", kind: "improvement", body: "Something better for everyone here.", where: "site" }),
      new Date(),
      { tokenId },
    );
    const detail = await getPublicTask(db, task.id);
    expect(detail?.posts[0]?.viaAgent).toBe("my script");
    expect(detail?.events.at(-1)).toMatchObject({ kind: "pr_linked", viaAgent: "my script" });
    expect((await getPublicTask(db, s.id))?.events[0]).toMatchObject({ kind: "suggested", viaAgent: "my script" });
  });

  it("leaves the task's last change alone for a draft, and drops drafts once the task moves on", async () => {
    const task = await openTask({ updatedAt: new Date("2026-10-01") });
    const { id: tokenId } = await newToken(lena);
    await propose(db, lena, task.id, plan, undefined, { tokenId });
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0]?.updatedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    await db.insert(members).values({ id: "ada", handle: "ada", displayName: "Ada", email: "ada@novawerk.io" }).onConflictDoNothing();
    await transitionTask(db, { taskId: task.id, action: "close", actor: { kind: "member", id: "ada" }, note: "Not needed" });
    expect(await db.select().from(taskProposals).where(eq(taskProposals.status, "draft"))).toEqual([]);
  });

  it("refuses a token rewriting or withdrawing a confirmed proposal", async () => {
    const task = await openTask();
    const { id: tokenId } = await newToken(lena);
    const draft = await propose(db, lena, task.id, plan, undefined, { tokenId });
    await confirmDraftProposal(db, lena, draft.id);
    expect(await code(() => updateProposal(db, lena, draft.id, { approach: "x" }, new Date(), { tokenId }))).toBe("forbidden");
    expect(await code(() => withdrawProposal(db, lena, draft.id, new Date(), { tokenId }))).toBe("forbidden");
    expect(await code(() => updateProposal(db, lena, draft.id, { eta: "days" }))).toBe("ok"); // the browser may
  });

  it("lists my +1s", async () => {
    const s = await suggestTask(
      db,
      jonas,
      suggestionInput.parse({ title: "Idea", kind: "bug", body: "Something broke on the tasks page.", where: "site" }),
    );
    expect(await myVotes(db, lena.id)).toEqual([]);
    await vote(db, lena, s.id);
    expect(await myVotes(db, lena.id)).toEqual([`NW-${s.id}`]);
  });
});
