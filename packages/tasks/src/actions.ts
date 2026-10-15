// What a signed-in contributor does on the board: propose, edit or withdraw a proposal, post and
// reply, suggest a task, +1 a suggestion. Every rule is checked here, so the API (and later the
// token API and the MCP server) can't skip one.

import { and, count, eq, gt } from "drizzle-orm";

import {
  TASK_LIMITS,
  formatTaskId,
  type PostInput,
  type ProposalUpdateInput,
  proposalInput,
  suggestionInput,
} from "@nw/contracts";
import {
  taskEvents,
  taskPosts,
  taskProposals,
  taskVotes,
  tasks,
  type Contributor,
  type Database,
  type Task,
  type TaskPost,
  type TaskProposal,
} from "@nw/db";

import { canWork } from "./contributors.js";
import { TaskRuleError } from "./errors.js";

const DAY_MS = 24 * 3_600_000;

type ParsedProposal = ReturnType<typeof proposalInput.parse>;
type ParsedSuggestion = ReturnType<typeof suggestionInput.parse>;

function notSuspended(c: Contributor) {
  if (c.suspendedAt) throw new TaskRuleError("suspended", "This account is suspended");
}

function mayWork(c: Contributor) {
  notSuspended(c);
  if (!canWork(c)) throw new TaskRuleError("github_required", "Link your GitHub account first: we match pull requests by it");
}

/** A task anyone may see. Drafts don't exist for the public. */
async function publicTask(db: Database, taskId: number): Promise<Task> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task || task.status === "draft") throw new TaskRuleError("not_found", `${formatTaskId(taskId)} doesn't exist`);
  return task;
}

async function ownPendingProposal(db: Database, c: Contributor, proposalId: string): Promise<TaskProposal> {
  const [proposal] = await db.select().from(taskProposals).where(eq(taskProposals.id, proposalId)).limit(1);
  if (!proposal || proposal.status === "withdrawn") throw new TaskRuleError("not_found", "No such proposal");
  if (proposal.contributorId !== c.id) throw new TaskRuleError("forbidden", "Not your proposal");
  if (proposal.status !== "pending") throw new TaskRuleError("invalid_state", "A member already decided on this proposal");
  return proposal;
}

/**
 * An explicit time only when the caller passed one (tests): otherwise Postgres' own clock, whose
 * microseconds keep posts and proposals in the order they came.
 */
const stamp = (at?: Date) => (at ? { createdAt: at } : {});

const touch = (db: Database, taskId: number, now: Date) =>
  db.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));

/** Propose a plan on an open task. 5 a day; one pending proposal per task. */
export async function propose(
  db: Database,
  c: Contributor,
  taskId: number,
  input: ParsedProposal,
  at?: Date,
): Promise<TaskProposal> {
  const now = at ?? new Date();
  const task = await publicTask(db, taskId);
  mayWork(c);
  if (task.status !== "open") throw new TaskRuleError("invalid_state", "This task isn't open for proposals");
  const [today] = await db
    .select({ n: count() })
    .from(taskProposals)
    .where(and(eq(taskProposals.contributorId, c.id), gt(taskProposals.createdAt, new Date(now.getTime() - DAY_MS))));
  if ((today?.n ?? 0) >= TASK_LIMITS.proposalsPerDay) {
    throw new TaskRuleError("rate_limited", `Up to ${TASK_LIMITS.proposalsPerDay} proposals a day. Try again tomorrow.`);
  }
  const [mine] = await db
    .select({ id: taskProposals.id })
    .from(taskProposals)
    .where(and(eq(taskProposals.taskId, taskId), eq(taskProposals.contributorId, c.id), eq(taskProposals.status, "pending")))
    .limit(1);
  if (mine) throw new TaskRuleError("conflict", "You already proposed on this task. Edit that proposal instead.");

  const [row] = await db
    .insert(taskProposals)
    .values({ taskId, contributorId: c.id, approach: input.approach, testing: input.testing, eta: input.eta, ...stamp(at) })
    .returning();
  await touch(db, taskId, now);
  return row!;
}

/** Edit your own pending proposal while the task is open. */
export async function updateProposal(
  db: Database,
  c: Contributor,
  proposalId: string,
  patch: ProposalUpdateInput,
  now = new Date(),
): Promise<TaskProposal> {
  notSuspended(c);
  const proposal = await ownPendingProposal(db, c, proposalId);
  const fields = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const [row] = await db
    .update(taskProposals)
    .set({ ...fields, updatedAt: now })
    .where(eq(taskProposals.id, proposal.id))
    .returning();
  await touch(db, proposal.taskId, now);
  return row!;
}

/** Withdraw your own pending proposal. The row stays (it counts towards the daily limit). */
export async function withdrawProposal(db: Database, c: Contributor, proposalId: string, now = new Date()): Promise<void> {
  const proposal = await ownPendingProposal(db, c, proposalId);
  await db.update(taskProposals).set({ status: "withdrawn", updatedAt: now }).where(eq(taskProposals.id, proposal.id));
  await touch(db, proposal.taskId, now);
}

/** Post on a task, or reply to a post (one level). 30 a day; not on a locked thread. */
export async function addPost(
  db: Database,
  c: Contributor,
  taskId: number,
  input: PostInput,
  at?: Date,
): Promise<TaskPost> {
  const now = at ?? new Date();
  const task = await publicTask(db, taskId);
  notSuspended(c);
  if (task.threadLockedAt) throw new TaskRuleError("invalid_state", "This thread is locked");
  if (input.replyTo) {
    const [parent] = await db.select().from(taskPosts).where(eq(taskPosts.id, input.replyTo)).limit(1);
    if (!parent || parent.taskId !== taskId || parent.hiddenAt) {
      throw new TaskRuleError("invalid", "That post isn't on this task", "replyTo");
    }
    if (parent.parentId) throw new TaskRuleError("invalid", "Reply to the post itself: replies have no replies", "replyTo");
  }
  const [today] = await db
    .select({ n: count() })
    .from(taskPosts)
    .where(and(eq(taskPosts.authorContributorId, c.id), gt(taskPosts.createdAt, new Date(now.getTime() - DAY_MS))));
  if ((today?.n ?? 0) >= TASK_LIMITS.postsPerDay) {
    throw new TaskRuleError("rate_limited", `Up to ${TASK_LIMITS.postsPerDay} posts a day. Try again tomorrow.`);
  }
  const [row] = await db
    .insert(taskPosts)
    .values({ taskId, parentId: input.replyTo ?? null, authorContributorId: c.id, body: input.body, ...stamp(at) })
    .returning();
  // A post from the person on the task counts as activity (the 14-day release).
  await db
    .update(tasks)
    .set({ updatedAt: now, ...(task.assigneeId === c.id ? { lastActivityAt: now } : {}) })
    .where(eq(tasks.id, taskId));
  return row!;
}

/** Suggest an improvement or a bug. At most 3 waiting for triage per person. No size, no Werk. */
export async function suggestTask(db: Database, c: Contributor, input: ParsedSuggestion, now = new Date()): Promise<Task> {
  notSuspended(c);
  const [open] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.suggestedBy, c.id), eq(tasks.status, "suggested")));
  if ((open?.n ?? 0) >= TASK_LIMITS.openSuggestions) {
    throw new TaskRuleError(
      "rate_limited",
      `You have ${TASK_LIMITS.openSuggestions} open suggestions. Wait for a member to triage one first.`,
    );
  }
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        kind: input.kind,
        title: input.title,
        body: input.body,
        status: "suggested",
        suggestedBy: c.id,
        where: input.where,
        wherePath: input.path?.trim() || null,
        wantsIt: input.doItMyself,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(taskEvents).values({
      taskId: task!.id,
      kind: "suggested",
      toStatus: "suggested",
      actorContributorId: c.id,
      createdAt: now,
    });
    return task!;
  });
}

async function suggestionToVoteOn(db: Database, c: Contributor, taskId: number): Promise<Task> {
  const task = await publicTask(db, taskId);
  notSuspended(c);
  if (task.status !== "suggested") throw new TaskRuleError("invalid_state", "Votes are only open while a task is suggested");
  return task;
}

/** +1 a suggestion. Not your own. Doing it twice is the same as once. */
export async function vote(db: Database, c: Contributor, taskId: number, now = new Date()): Promise<void> {
  const task = await suggestionToVoteOn(db, c, taskId);
  if (task.suggestedBy === c.id) throw new TaskRuleError("forbidden", "You can't +1 your own suggestion");
  await db.insert(taskVotes).values({ taskId, contributorId: c.id, createdAt: now }).onConflictDoNothing();
}

/** Take a +1 back, while the task is still suggested (votes are kept after triage). */
export async function unvote(db: Database, c: Contributor, taskId: number): Promise<void> {
  await suggestionToVoteOn(db, c, taskId);
  await db.delete(taskVotes).where(and(eq(taskVotes.taskId, taskId), eq(taskVotes.contributorId, c.id)));
}
