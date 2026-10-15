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
import { idleReleaseAt } from "./idle.js";
import { IN_PROGRESS_STATUSES, planTransition, type Actor, type TaskAction } from "./state.js";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
  /**
   * `release` by the inactivity check: re-checked under the row lock, so a post or an extension
   * that landed since the check keeps the task (invalid_state).
   */
  idleAt?: Date;
  /** Done through a personal access token: recorded on the event. */
  viaTokenId?: string;
  /**
   * No notice: the event names nobody (subject_contributor_id stays null). For a release that
   * follows a suspension, which must neither read like an idle release nor go out by email.
   */
  quiet?: boolean;
  now?: Date;
}

const actorColumns = (actor: Actor) => ({
  actorContributorId: actor.kind === "contributor" ? actor.id : null,
  actorMemberId: actor.kind === "member" ? actor.id : null,
});

/**
 * Who the event is about (task_events.subject_contributor_id): notices go to them. The new
 * assignee, the person who lost or finished the task, or the one whose suggestion was decided.
 */
function subjectOf(action: TaskAction, task: Task, patch: Partial<typeof tasks.$inferInsert>): string | null {
  switch (action) {
    case "choose":
    case "accept_assign":
      return patch.assigneeId ?? null;
    case "accept":
    case "decline":
    case "mark_duplicate":
    case "request_info":
      return task.suggestedBy;
    case "release":
    case "link_pr":
    case "pr_closed":
    case "merge":
    case "close":
    case "reopen":
      return task.assigneeId;
    case "publish":
      return null;
  }
}

/**
 * Lock order, everywhere: the contributor's row first, then the task's. Contributor actions
 * (propose, post) already work that way; member actions that touch a person (choose, accept and
 * assign, suspend) lock the person before the task, so the two never wait on each other.
 */
export async function lockContributor(tx: Tx, contributorId: string) {
  const [person] = await tx.select().from(contributors).where(eq(contributors.id, contributorId)).for("update");
  return person;
}

async function lockTask(tx: Tx, taskId: number): Promise<Task> {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
  if (!task) throw new TaskRuleError("not_found", `${formatTaskId(taskId)} doesn't exist`);
  return task;
}

/**
 * Can this contributor take a task now: GitHub linked, not suspended, and holding fewer than the
 * limit (1 until their first merged task, then 2). Their row stays locked until the transaction
 * ends, so two members assigning the same person at once (on two tasks) run one after the
 * other, and the second sees the first one's task.
 */
async function checkCanTake(tx: Tx, contributorId: string, taskId: number): Promise<void> {
  const person = await lockContributor(tx, contributorId);
  if (!person) throw new TaskRuleError("not_found", "No such contributor");
  if (!canWork(person)) {
    throw new TaskRuleError("github_required", "They need GitHub linked (and an active account) to work on a task");
  }
  const [held] = await tx
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, contributorId), inArray(tasks.status, [...IN_PROGRESS_STATUSES]), ne(tasks.id, taskId)));
  const [merged] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.assigneeId, contributorId), eq(tasks.status, "done")))
    .limit(1);
  const limit = merged ? TASK_LIMITS.tasksInProgressAfterFirstMerge : TASK_LIMITS.tasksInProgress;
  if ((held?.n ?? 0) >= limit) {
    throw new TaskRuleError(
      "conflict",
      merged ? `They already hold ${limit} tasks.` : "They already hold a task. One at a time until their first merge.",
    );
  }
}

/** Move a task one step. Throws a TaskRuleError for the wrong state, actor or input. */
export async function transitionTask(db: Database, input: TransitionInput): Promise<Task> {
  return db.transaction((tx) => transitionIn(tx, input));
}

/**
 * Lock order, everywhere: the contributors involved first (sorted by id), then the task.
 * Suspending someone locks their row and then their tasks; a merge used to lock the task and
 * then (for the Werk row's foreign key) the contributor, and the two deadlocked. So we take the
 * people first: whoever holds the task now, and whoever gets it.
 */
async function lockPeople(tx: Tx, input: TransitionInput): Promise<void> {
  const [current] = await tx
    .select({ assigneeId: tasks.assigneeId, suggestedBy: tasks.suggestedBy })
    .from(tasks)
    .where(eq(tasks.id, input.taskId));
  const taker =
    input.action === "choose"
      ? input.assigneeId
      : input.action === "accept_assign"
        ? (input.assigneeId ?? current?.suggestedBy ?? undefined)
        : undefined;
  const ids = [...new Set([current?.assigneeId, taker].filter((id): id is string => Boolean(id)))].sort();
  for (const id of ids) await lockContributor(tx, id);
}

/** transitionTask inside a transaction the caller holds (a member's question plus its post). */
export async function transitionIn(tx: Tx, input: TransitionInput): Promise<Task> {
  const now = input.now ?? new Date();
  await lockPeople(tx, input);
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
        Object.assign(patch, { assigneeId, assignedAt: now, lastActivityAt: now, extendedAt: null });
      }
      break;
    }
    case "decline":
      if (!input.note?.trim()) throw new TaskRuleError("invalid", "A declined suggestion needs a note", "note");
      Object.assign(patch, { closedReason: input.note.trim(), closedAt: now });
      break;
    case "mark_duplicate": {
      if (!input.duplicateOf || input.duplicateOf === task.id) throw new TaskRuleError("invalid", "Which task is it a duplicate of?", "duplicateOf");
      const [original] = await tx.select({ id: tasks.id, status: tasks.status }).from(tasks).where(eq(tasks.id, input.duplicateOf));
      // A draft isn't public: a duplicate must point somewhere people can see.
      if (!original || original.status === "draft") {
        throw new TaskRuleError("invalid", `${formatTaskId(input.duplicateOf)} doesn't exist`, "duplicateOf");
      }
      Object.assign(patch, { duplicateOf: input.duplicateOf, closedAt: now });
      break;
    }
    case "choose":
      if (!input.assigneeId) throw new TaskRuleError("invalid", "Who gets it?");
      await checkCanTake(tx, input.assigneeId, task.id);
      Object.assign(patch, { assigneeId: input.assigneeId, assignedAt: now, lastActivityAt: now, extendedAt: null });
      break;
    case "release":
      if (input.idleAt && input.idleAt < idleReleaseAt(task)) {
        throw new TaskRuleError("invalid_state", "Not idle any more");
      }
      // Pending proposals from before the assignment are not revived; people propose again.
      Object.assign(patch, { assigneeId: null, assignedAt: null, lastActivityAt: null, prUrl: null, extendedAt: null });
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
        // Once per task and PR: a re-run (after a reopen, say) never awards twice or fails.
        await tx
          .insert(werkLedger)
          .values({
            contributorId: task.assigneeId,
            delta: TASK_SIZE_WERK[task.size],
            reason: `Merged ${formatTaskId(task.id)}: ${task.title}`,
            taskId: task.id,
            pr,
            createdAt: now,
          })
          .onConflictDoNothing({ target: [werkLedger.taskId, werkLedger.pr] });
      }
      break;
    }
    case "close":
      if (!input.note?.trim()) throw new TaskRuleError("invalid", "Closing needs a public reason", "note");
      Object.assign(patch, { closedReason: input.note.trim(), closedAt: now });
      break;
    case "reopen":
      // Back on the board, free for anyone: whoever held it before proposes again.
      if (!input.note?.trim()) throw new TaskRuleError("invalid", "Reopening needs a public reason", "note");
      Object.assign(patch, {
        closedReason: null,
        closedAt: null,
        assigneeId: null,
        assignedAt: null,
        lastActivityAt: null,
        prUrl: null,
        extendedAt: null,
      });
      break;
    case "publish":
      break;
  }

  const [updated] = await tx.update(tasks).set(patch).where(eq(tasks.id, task.id)).returning();
  // Agents' drafts only make sense on an open task: once it moves on, they go.
  if (task.status === "open" && to !== "open") {
    await tx.delete(taskProposals).where(and(eq(taskProposals.taskId, task.id), eq(taskProposals.status, "draft")));
  }
  await tx.insert(taskEvents).values({
    taskId: task.id,
    kind: event,
    fromStatus: task.status,
    toStatus: to,
    ...actorColumns(input.actor),
    subjectContributorId: input.quiet ? null : subjectOf(input.action, task, patch),
    note: input.note?.trim() || null,
    prUrl: input.action === "link_pr" || input.action === "merge" ? (patch.prUrl ?? null) : null,
    viaTokenId: input.viaTokenId ?? null,
    createdAt: now,
  });
  // Closing ends every plan still waiting, so reopening doesn't bring them back.
  if (input.action === "close") {
    await declinePending(tx, task.id, input.actor.kind === "member" ? input.actor.id : null, {}, patch.closedReason ?? NOT_CHOSEN_NOTE, now);
  }
  return updated!;
}

/**
 * Every pending proposal on a task becomes "not chosen" with a private note (per proposal, or
 * the fallback), and gets a members-only event about its author.
 */
async function declinePending(
  tx: Tx,
  taskId: number,
  memberId: string | null,
  notes: Record<string, string>,
  fallback: string,
  now: Date,
): Promise<void> {
  const pending = await tx
    .select({ id: taskProposals.id, contributorId: taskProposals.contributorId })
    .from(taskProposals)
    .where(and(eq(taskProposals.taskId, taskId), eq(taskProposals.status, "pending")))
    .for("update");
  for (const p of pending) {
    await tx
      .update(taskProposals)
      .set({ status: "not_chosen", declineNote: notes[p.id]?.trim() || fallback, decidedBy: memberId, decidedAt: now, updatedAt: now })
      .where(eq(taskProposals.id, p.id));
    await tx.insert(taskEvents).values({
      taskId,
      kind: "proposal_declined",
      actorMemberId: memberId,
      subjectContributorId: p.contributorId,
      createdAt: now,
    });
  }
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
    // Read without a lock to learn the task and the person; transitionIn locks the person, then
    // the task, and the proposal is checked again under those locks.
    const [proposal] = await tx.select().from(taskProposals).where(eq(taskProposals.id, input.proposalId));
    if (!proposal || proposal.status === "withdrawn") throw new TaskRuleError("not_found", "No such proposal");
    if (proposal.status !== "pending") throw new TaskRuleError("invalid_state", "This proposal isn't pending");
    const task = await transitionIn(tx, {
      taskId: proposal.taskId,
      action: "choose",
      actor: { kind: "member", id: input.memberId },
      assigneeId: proposal.contributorId,
      now,
    });
    // Withdrawn (or decided) since the first read: the whole choice rolls back.
    const chosen = await tx
      .update(taskProposals)
      .set({ status: "chosen", decidedBy: input.memberId, decidedAt: now, updatedAt: now })
      .where(and(eq(taskProposals.id, proposal.id), eq(taskProposals.status, "pending")))
      .returning({ id: taskProposals.id });
    if (chosen.length === 0) throw new TaskRuleError("invalid_state", "This proposal was withdrawn or decided meanwhile");
    await declinePending(tx, proposal.taskId, input.memberId, input.notes ?? {}, NOT_CHOSEN_NOTE, now);
    return task;
  });
}

/**
 * A member's change to someone's Werk (a revert, a mistake): a new ledger row, never an edit.
 * The reason is shown to the contributor. Tied to a task, it also goes on the task's record.
 */
export async function adjustWerk(
  db: Database,
  input: { contributorId: string; delta: number; reason: string; memberId: string; taskId?: number; now?: Date },
): Promise<typeof werkLedger.$inferSelect> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new TaskRuleError("invalid", "A whole number, not zero", "delta");
  if (!input.reason.trim()) throw new TaskRuleError("invalid", "Say why: the contributor sees it", "reason");
  return db.transaction(async (tx) => {
    const [person] = await tx.select({ id: contributors.id }).from(contributors).where(eq(contributors.id, input.contributorId));
    if (!person) throw new TaskRuleError("invalid", "No such contributor", "contributorId");
    if (input.taskId !== undefined) {
      const [task] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.taskId));
      if (!task) throw new TaskRuleError("invalid", `${formatTaskId(input.taskId)} doesn't exist`, "taskId");
    }
    const at = input.now ? { createdAt: input.now } : {};
    const [row] = await tx
      .insert(werkLedger)
      .values({
        contributorId: input.contributorId,
        delta: input.delta,
        reason: input.reason.trim(),
        taskId: input.taskId ?? null,
        byMemberId: input.memberId,
        ...at,
      })
      .returning();
    if (input.taskId !== undefined) {
      await tx.insert(taskEvents).values({
        taskId: input.taskId,
        kind: "werk_adjusted",
        actorMemberId: input.memberId,
        subjectContributorId: input.contributorId,
        note: `${input.delta > 0 ? "+" : ""}${input.delta} Werk: ${input.reason.trim()}`,
        ...at,
      });
    }
    return row!;
  });
}
