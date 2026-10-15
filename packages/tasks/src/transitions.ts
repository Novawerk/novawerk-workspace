// Applying the state machine (./state.ts) to a task row: one transaction moves the status, sets
// what goes with it, and writes the task event the timeline reads. A merge also awards the
// task's Werk, once (the ledger's unique task + PR key). Member and GitHub actions call these;
// the routes for them come with the admin pages and the webhook.

import { and, count, eq, inArray, ne } from "drizzle-orm";

import { TASK_LIMITS, TASK_SIZE_WERK, formatTaskId, type TaskArea, type TaskSize } from "@nw/contracts";
import {
  contributors,
  taskEvents,
  taskProposals,
  tasks,
  werkLedger,
  type Database,
  type Task,
} from "@nw/db";

import { canWork } from "./contributors.js";
import { TaskRuleError } from "./errors.js";
import { IN_PROGRESS_STATUSES, planTransition, type Actor, type TaskAction } from "./state.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The default private note to proposals that weren't chosen. */
export const NOT_CHOSEN_NOTE = "Thanks for the plan. We picked another one this time.";

export interface TransitionInput {
  taskId: number;
  action: TaskAction;
  actor: Actor;
  /** Public: shown on the timeline (a close reason, why it was released…). */
  note?: string;
  /** `link_pr`, `pr_closed`, `merge`. */
  prUrl?: string;
  /** `choose`, `accept_assign`: who gets it. */
  assigneeId?: string;
  /** `accept`, `accept_assign`: a member sets what a suggestion lacks. */
  accept?: { area?: TaskArea; size?: TaskSize; criteria?: string[] };
  /** `mark_duplicate`. */
  duplicateOf?: number;
  now?: Date;
}

const actorColumns = (actor: Actor) => ({
  actorContributorId: actor.kind === "contributor" ? actor.id : null,
  actorMemberId: actor.kind === "member" ? actor.id : null,
});

async function lockTask(tx: Tx, taskId: number): Promise<Task> {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
  if (!task) throw new TaskRuleError("not_found", `${formatTaskId(taskId)} doesn't exist`);
  return task;
}

/** Can this contributor take a task now: GitHub linked, not suspended, nothing else in progress. */
async function checkCanTake(tx: Tx, contributorId: string, taskId: number): Promise<void> {
  const [person] = await tx.select().from(contributors).where(eq(contributors.id, contributorId)).limit(1);
  if (!person) throw new TaskRuleError("not_found", "No such contributor");
  if (!canWork(person)) {
    throw new TaskRuleError("github_required", "They need GitHub linked (and an active account) to work on a task");
  }
  const [held] = await tx
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, contributorId), inArray(tasks.status, [...IN_PROGRESS_STATUSES]), ne(tasks.id, taskId)));
  if ((held?.n ?? 0) >= TASK_LIMITS.tasksInProgress) {
    throw new TaskRuleError("conflict", `They already hold ${TASK_LIMITS.tasksInProgress} task. One at a time.`);
  }
}

/** Move a task one step. Throws a TaskRuleError for the wrong state, actor or input. */
export async function transitionTask(db: Database, input: TransitionInput): Promise<Task> {
  return db.transaction((tx) => transitionIn(tx, input));
}

async function transitionIn(tx: Tx, input: TransitionInput): Promise<Task> {
  const now = input.now ?? new Date();
  const task = await lockTask(tx, input.taskId);
  const { to, event } = planTransition(task, input.action, input.actor);
  const patch: Partial<typeof tasks.$inferInsert> = { status: to, updatedAt: now };

  switch (input.action) {
    case "request_info":
      patch.needsInfo = true;
      break;
    case "accept":
    case "accept_assign": {
      const area = input.accept?.area ?? (task.area as TaskArea | null);
      const size = input.accept?.size ?? task.size;
      if (!area || !size) throw new TaskRuleError("invalid", "Set an area and a size before accepting");
      Object.assign(patch, { area, size, needsInfo: false, acceptedAt: now });
      if (input.accept?.criteria) patch.criteria = input.accept.criteria;
      if (input.action === "accept_assign") {
        // Given straight to the person who suggested it, when they asked to do it themselves.
        const assigneeId = input.assigneeId ?? task.suggestedBy;
        if (!assigneeId || assigneeId !== task.suggestedBy || !task.wantsIt) {
          throw new TaskRuleError("invalid", "Only the person who suggested it, and asked to do it, can get it directly");
        }
        await checkCanTake(tx, assigneeId, task.id);
        Object.assign(patch, { assigneeId, assignedAt: now, lastActivityAt: now });
      }
      break;
    }
    case "decline":
      if (!input.note?.trim()) throw new TaskRuleError("invalid", "A declined suggestion needs a note", "note");
      Object.assign(patch, { closedReason: input.note.trim(), closedAt: now });
      break;
    case "mark_duplicate": {
      if (!input.duplicateOf || input.duplicateOf === task.id) throw new TaskRuleError("invalid", "Which task is it a duplicate of?", "duplicateOf");
      const [original] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.duplicateOf));
      if (!original) throw new TaskRuleError("invalid", `${formatTaskId(input.duplicateOf)} doesn't exist`, "duplicateOf");
      Object.assign(patch, { duplicateOf: input.duplicateOf, closedAt: now });
      break;
    }
    case "choose":
      if (!input.assigneeId) throw new TaskRuleError("invalid", "Who gets it?");
      await checkCanTake(tx, input.assigneeId, task.id);
      Object.assign(patch, { assigneeId: input.assigneeId, assignedAt: now, lastActivityAt: now });
      break;
    case "release":
      // Pending proposals from before the assignment are not revived; people propose again.
      Object.assign(patch, { assigneeId: null, assignedAt: null, lastActivityAt: null, prUrl: null });
      break;
    case "link_pr":
      if (!input.prUrl) throw new TaskRuleError("invalid", "Which pull request?", "prUrl");
      Object.assign(patch, { prUrl: input.prUrl, lastActivityAt: now });
      break;
    case "pr_closed":
      Object.assign(patch, { prUrl: null, lastActivityAt: now });
      break;
    case "merge": {
      const pr = input.prUrl ?? task.prUrl;
      if (!pr) throw new TaskRuleError("invalid", "Which pull request merged?", "prUrl");
      Object.assign(patch, { prUrl: pr, doneAt: now });
      if (task.assigneeId && task.size) {
        await tx.insert(werkLedger).values({
          contributorId: task.assigneeId,
          delta: TASK_SIZE_WERK[task.size],
          reason: `Merged ${formatTaskId(task.id)}: ${task.title}`,
          taskId: task.id,
          pr,
          createdAt: now,
        });
      }
      break;
    }
    case "close":
      if (!input.note?.trim()) throw new TaskRuleError("invalid", "Closing needs a public reason", "note");
      Object.assign(patch, { closedReason: input.note.trim(), closedAt: now });
      break;
    case "publish":
      break;
  }

  const [updated] = await tx.update(tasks).set(patch).where(eq(tasks.id, task.id)).returning();
  await tx.insert(taskEvents).values({
    taskId: task.id,
    kind: event,
    fromStatus: task.status,
    toStatus: to,
    ...actorColumns(input.actor),
    note: input.note?.trim() || null,
    prUrl: input.action === "link_pr" || input.action === "merge" ? (patch.prUrl ?? null) : null,
    createdAt: now,
  });
  return updated!;
}

/**
 * A member picks one plan: the task goes to its author, the other pending proposals become
 * "not chosen", each with a private note (the default, or the member's own per proposal).
 */
export async function chooseProposal(
  db: Database,
  input: { proposalId: string; memberId: string; notes?: Record<string, string>; now?: Date },
): Promise<Task> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(taskProposals).where(eq(taskProposals.id, input.proposalId));
    if (!proposal) throw new TaskRuleError("not_found", "No such proposal");
    if (proposal.status !== "pending") throw new TaskRuleError("invalid_state", "This proposal isn't pending");
    const task = await transitionIn(tx, {
      taskId: proposal.taskId,
      action: "choose",
      actor: { kind: "member", id: input.memberId },
      assigneeId: proposal.contributorId,
      now,
    });
    await tx
      .update(taskProposals)
      .set({ status: "chosen", decidedBy: input.memberId, decidedAt: now })
      .where(eq(taskProposals.id, proposal.id));
    const others = await tx
      .select({ id: taskProposals.id })
      .from(taskProposals)
      .where(and(eq(taskProposals.taskId, proposal.taskId), eq(taskProposals.status, "pending")));
    for (const other of others) {
      await tx
        .update(taskProposals)
        .set({
          status: "not_chosen",
          declineNote: input.notes?.[other.id]?.trim() || NOT_CHOSEN_NOTE,
          decidedBy: input.memberId,
          decidedAt: now,
        })
        .where(eq(taskProposals.id, other.id));
    }
    return task;
  });
}

/**
 * A member's change to someone's Werk (a revert, a mistake): a new ledger row, never an edit.
 * The reason is shown to the contributor.
 */
export async function adjustWerk(
  db: Database,
  input: { contributorId: string; delta: number; reason: string; memberId: string; taskId?: number; now?: Date },
): Promise<void> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new TaskRuleError("invalid", "A whole number, not zero", "delta");
  if (!input.reason.trim()) throw new TaskRuleError("invalid", "Say why: the contributor sees it", "reason");
  await db.insert(werkLedger).values({
    contributorId: input.contributorId,
    delta: input.delta,
    reason: input.reason.trim(),
    taskId: input.taskId ?? null,
    byMemberId: input.memberId,
    ...(input.now ? { createdAt: input.now } : {}),
  });
}
