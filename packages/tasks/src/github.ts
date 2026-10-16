// What a pull request does to a task. A PR counts only when it names a task (`Task: NW-42`, or
// NW-42 in its title, body or branch) that is assigned, and its author's GitHub numeric id is the
// one the assignee linked. Then:
//
//   opened / edited / reopened  → in_review with the PR's URL; a comment with the task link and
//                                 a size:<S|M|L|XL> label
//   new commits (synchronize)   → counts as activity
//   merged                      → done, the task's Werk once (werk_ledger task + PR), a thank-you
//   closed without merging      → back to assigned
//
// Someone else's PR naming a task gets one polite comment when it is opened, and links nothing.
// Everything is idempotent: a redelivery, an edit or the nightly reconcile changes nothing twice
// and comments only when the task actually moved. No GitHub calls here: the outcome lists the
// replies, and the API posts them with @nw/github.

import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { TASK_LIMITS, TASK_SIZE_WERK, formatTaskId } from "@nw/contracts";
import { members, githubDeliveries, taskEvents, tasks, type Database, type Task } from "@nw/db";

import { TaskRuleError } from "./errors.js";
import { idleReleaseAt, idleSince } from "./idle.js";
import { transitionTask } from "./transitions.js";

/** The facts the board needs about a PR (structurally @nw/github's PullRequestFacts). */
export interface PullRequestInput {
  repo: string;
  number: number;
  url: string;
  authorId: number;
  authorLogin: string;
  /** GitHub's author_association: OWNER, MEMBER and COLLABORATOR are us, not newcomers. */
  authorAssociation?: string;
  state: "open" | "closed";
  merged: boolean;
  taskNumber: number | null;
}

/** People who already work on the repository: no "propose a plan first" note for them. */
const OUR_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"];

export type GitHubReply = { kind: "comment"; body: string } | { kind: "labels"; labels: string[] };

export interface PullRequestOutcome {
  /** What happened to the task. */
  result: "ignored" | "linked" | "merged" | "unlinked" | "activity" | "unchanged" | "not_assignee";
  taskNumber: number | null;
  replies: GitHubReply[];
}

/** Hidden in every comment the App writes, so people (and we) can tell them apart. */
export const BOARD_COMMENT_MARKER = "<!-- novawerk-task-board -->";

const DAY_MS = 24 * 3_600_000;

const taskLink = (webUrl: string, n: number) => `${webUrl}/tasks/${formatTaskId(n)}`;

/**
 * A task title inside the App's Markdown comment: no links, formatting or HTML of its own, and no
 * @mentions (a zero-width space after each @), so a title can't ping anyone.
 */
export function safeTitle(title: string): string {
  return title
    .replace(/[\\`*_{}[\]()<>#+|~!]/g, "\\$&")
    .replace(/@/g, "@\u200b")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Other tasks still in review on this PR, now that it names another task (or none): back to
 * assigned, so nothing stays stuck in review on a PR that left.
 */
async function unlinkMovedPullRequest(db: Database, pr: PullRequestInput, now: Date): Promise<number[]> {
  const stale = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.status, "in_review"), eq(tasks.prUrl, pr.url)));
  const moved: number[] = [];
  for (const { id } of stale) {
    if (id === pr.taskNumber) continue;
    try {
      await transitionTask(db, {
        taskId: id,
        action: "pr_closed",
        actor: { kind: "system" },
        note: pr.taskNumber ? `The pull request now names ${formatTaskId(pr.taskNumber)}` : "The pull request no longer names this task",
        now,
      });
      moved.push(id);
    } catch (err) {
      if (!(err instanceof TaskRuleError)) throw err;
    }
  }
  return moved;
}
const comment = (body: string): GitHubReply => ({ kind: "comment", body: `${body}\n\n${BOARD_COMMENT_MARKER}` });

/**
 * Apply one PR to the task it names. `source` is where the facts came from: a webhook delivery
 * (with its action) or the nightly reconcile, which never comments on someone else's PR.
 */
export async function applyPullRequest(
  db: Database,
  pr: PullRequestInput,
  opts: { source: "webhook" | "reconcile"; action?: string; webUrl: string; now?: Date },
): Promise<PullRequestOutcome> {
  const now = opts.now ?? new Date();
  const n = pr.taskNumber;
  const nothing = (result: PullRequestOutcome["result"] = "ignored"): PullRequestOutcome => ({ result, taskNumber: n, replies: [] });
  if (!pr.merged) await unlinkMovedPullRequest(db, pr, now);
  if (!n) return nothing();

  const [row] = await db
    .select({ task: tasks, githubId: members.githubId })
    .from(tasks)
    .leftJoin(members, eq(members.id, tasks.assigneeId))
    .where(eq(tasks.id, n))
    .limit(1);
  if (!row || row.task.repo.toLowerCase() !== pr.repo.toLowerCase()) return nothing();
  const task = row.task;
  if (!["open", "assigned", "in_review", "done"].includes(task.status)) return nothing();

  const byAssignee = task.assigneeId !== null && row.githubId !== null && row.githubId === pr.authorId;
  if (!byAssignee) {
    if (
      opts.source === "webhook" &&
      opts.action === "opened" &&
      pr.state === "open" &&
      task.status !== "done" &&
      !OUR_ASSOCIATIONS.includes(pr.authorAssociation ?? "NONE")
    ) {
      return {
        result: "not_assignee",
        taskNumber: n,
        replies: [
          comment(
            `Thanks for the pull request, @${pr.authorLogin}. It names ${formatTaskId(n)}, which is on our task board, ` +
              `and a PR counts for a task only when it comes from the GitHub account of the person the task is ` +
              `assigned to. If you'd like to take a task, propose a plan on ${opts.webUrl}/tasks first. ` +
              `A member will still look at this PR.`,
          ),
        ],
      };
    }
    return nothing();
  }

  const move = async (input: Parameters<typeof transitionTask>[1]): Promise<Task | null> => {
    try {
      return await transitionTask(db, input);
    } catch (err) {
      // Someone else moved the task meanwhile: nothing to do.
      if (err instanceof TaskRuleError && err.code === "invalid_state") return null;
      throw err;
    }
  };
  const system = { kind: "system" } as const;

  if (pr.merged) {
    if (task.status !== "assigned" && task.status !== "in_review") return nothing("unchanged");
    const done = await move({ taskId: n, action: "merge", actor: system, prUrl: pr.url, now });
    if (!done) return nothing("unchanged");
    const werk = task.size ? TASK_SIZE_WERK[task.size] : 0;
    return {
      result: "merged",
      taskNumber: n,
      replies: [
        comment(
          `Merged. ${formatTaskId(n)} is done${werk ? `: +${werk} Werk to @${pr.authorLogin}` : ""}. ` +
            `Thank you for building this with us. ${taskLink(opts.webUrl, n)}`,
        ),
      ],
    };
  }

  if (pr.state === "closed") {
    if (task.status !== "in_review" || task.prUrl !== pr.url) return nothing("unchanged");
    return (await move({ taskId: n, action: "pr_closed", actor: system, prUrl: pr.url, now })) ? nothing("unlinked") : nothing("unchanged");
  }

  // Open.
  if (task.status === "assigned") {
    const linked = await move({ taskId: n, action: "link_pr", actor: system, prUrl: pr.url, now });
    if (!linked) return nothing("unchanged");
    return {
      result: "linked",
      taskNumber: n,
      replies: [
        comment(
          `Linked to [${formatTaskId(n)}: ${safeTitle(task.title)}](${taskLink(opts.webUrl, n)}). Thanks, @${pr.authorLogin}! ` +
            `A member reviews it here. When it merges, the task is done.`,
        ),
        ...(task.size ? [{ kind: "labels" as const, labels: [`size:${task.size}`] }] : []),
      ],
    };
  }
  if (task.status === "in_review" && task.prUrl === pr.url && opts.action === "synchronize") {
    await db.update(tasks).set({ lastActivityAt: now }).where(eq(tasks.id, n));
    return nothing("activity");
  }
  return nothing("unchanged");
}

// ─── Deliveries ──────────────────────────────────────────────────────────────

/**
 * A claim on a delivery that never finished can be taken over after this long. Well above the
 * API function's longest run (`maxDuration` 300 s in apps/api/vercel.json), so a slow delivery
 * still in progress is never handled twice. Change both together.
 */
export const DELIVERY_STALE_MS = 10 * 60_000;

/**
 * Claim an X-GitHub-Delivery id: true the first time, and for a redelivery of one whose handling
 * died (claimed, never marked handled, older than DELIVERY_STALE_MS); false for one handled or in progress.
 */
export async function claimDelivery(db: Database, id: string, event: string, now = new Date()): Promise<boolean> {
  const fresh = await db
    .insert(githubDeliveries)
    .values({ id, event, receivedAt: now })
    .onConflictDoNothing()
    .returning({ id: githubDeliveries.id });
  if (fresh.length === 1) return true;
  const retaken = await db
    .update(githubDeliveries)
    .set({ receivedAt: now })
    .where(
      and(
        eq(githubDeliveries.id, id),
        isNull(githubDeliveries.handledAt),
        lt(githubDeliveries.receivedAt, new Date(now.getTime() - DELIVERY_STALE_MS)),
      ),
    )
    .returning({ id: githubDeliveries.id });
  return retaken.length === 1;
}

/** The delivery is done: a redelivery of it changes nothing. */
export async function markDelivered(db: Database, id: string, now = new Date()): Promise<void> {
  await db.update(githubDeliveries).set({ handledAt: now }).where(eq(githubDeliveries.id, id));
}

/** Forget a delivery whose handling failed, so a redelivery runs it again. */
export async function forgetDelivery(db: Database, id: string): Promise<void> {
  await db.delete(githubDeliveries).where(eq(githubDeliveries.id, id));
}

/** Deliveries older than 30 days are gone (/cron/github-sync). */
export async function deleteOldDeliveries(db: Database, now = new Date()): Promise<number> {
  const gone = await db
    .delete(githubDeliveries)
    .where(lt(githubDeliveries.receivedAt, new Date(now.getTime() - 30 * DAY_MS)))
    .returning({ id: githubDeliveries.id });
  return gone.length;
}

// ─── Inactivity ──────────────────────────────────────────────────────────────

/**
 * Tasks in progress without activity: a reminder event 7 days before the release, and the
 * release after 14 days (21 with "a week more"). Only task_events and the release are written
 * here; the email goes out from the event (邮件). Idempotent: one reminder per quiet stretch.
 */
export async function checkInactivity(db: Database, now = new Date()): Promise<{ reminded: number[]; released: number[] }> {
  const held = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, "assigned"), sql`${tasks.assigneeId} is not null`));
  const reminded: number[] = [];
  const released: number[] = [];
  for (const task of held) {
    const since = idleSince(task);
    const releaseAt = idleReleaseAt(task);
    if (now >= releaseAt) {
      const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
      try {
        // `idleAt` makes the release re-check the time under the row lock: a post or an extension
        // that landed meanwhile keeps the task.
        await transitionTask(db, {
          taskId: task.id,
          action: "release",
          actor: { kind: "system" },
          note: `Back on the board after ${days} days without activity`,
          idleAt: now,
          now,
        });
        released.push(task.id);
      } catch (err) {
        if (!(err instanceof TaskRuleError)) throw err;
      }
      continue;
    }
    const remindAt = new Date(releaseAt.getTime() - TASK_LIMITS.idleReminderDays * DAY_MS);
    if (now < remindAt) continue;
    // One reminder per quiet stretch: none since the last activity (or the extension).
    const quietSince = task.extendedAt && task.extendedAt > since ? task.extendedAt : since;
    const [already] = await db
      .select({ id: taskEvents.id })
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, task.id), eq(taskEvents.kind, "inactivity_reminder"), gte(taskEvents.createdAt, quietSince)))
      .limit(1);
    if (already) continue;
    await db.insert(taskEvents).values({
      taskId: task.id,
      kind: "inactivity_reminder",
      subjectContributorId: task.assigneeId,
      note: `No activity since ${since.toISOString().slice(0, 10)}. Back on the board on ${releaseAt.toISOString().slice(0, 10)} unless something happens.`,
      // For the reminder email: exact times, not the note's words.
      data: { idleSince: since.toISOString(), releaseAt: releaseAt.toISOString() },
      createdAt: now,
    });
    reminded.push(task.id);
  }
  return { reminded, released };
}

/** Tasks a reconcile should look at: in progress or in review. */
export async function tasksWithWorkInFlight(db: Database): Promise<number[]> {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.status, ["assigned", "in_review"]));
  return rows.map((r) => r.id);
}

/** Tasks in review and the PR each one points at: the nightly check that the PR still counts. */
export async function tasksInReview(db: Database): Promise<{ id: number; prUrl: string | null }[]> {
  return db.select({ id: tasks.id, prUrl: tasks.prUrl }).from(tasks).where(eq(tasks.status, "in_review"));
}

/**
 * Does a PR count for this task: on its repository, by the assignee's linked GitHub account, and
 * naming it. Null when it does; otherwise why not, in words for the assignee.
 */
export async function whyPullRequestDoesNotCount(db: Database, taskId: number, pr: PullRequestInput): Promise<string | null> {
  const [row] = await db
    .select({ task: tasks, githubId: members.githubId })
    .from(tasks)
    .leftJoin(members, eq(members.id, tasks.assigneeId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) return `${formatTaskId(taskId)} doesn't exist`;
  if (row.task.repo.toLowerCase() !== pr.repo.toLowerCase()) return `The pull request isn't on ${row.task.repo}`;
  if (row.githubId === null || row.githubId !== pr.authorId) return "The pull request isn't from the GitHub account linked to the person on this task";
  if (pr.taskNumber !== taskId) return `The pull request doesn't name ${formatTaskId(taskId)}: put "Task: ${formatTaskId(taskId)}" in its description`;
  return null;
}

/**
 * The nightly check of a task in review against its PR as GitHub sees it now (null: gone). A
 * merge by the assignee finishes the task; a closed PR, or one that no longer counts, puts it
 * back to assigned, so a task never waits in review on a PR that can't finish it.
 */
export async function reconcileLinkedPullRequest(
  db: Database,
  taskId: number,
  pr: PullRequestInput | null,
  opts: { webUrl: string; now?: Date },
): Promise<PullRequestOutcome> {
  const now = opts.now ?? new Date();
  const why = pr ? await whyPullRequestDoesNotCount(db, taskId, pr) : "The linked pull request no longer exists";
  if (pr && !why) {
    if (pr.merged) return applyPullRequest(db, pr, { source: "reconcile", webUrl: opts.webUrl, now });
    if (pr.state === "open") return { result: "unchanged", taskNumber: taskId, replies: [] };
  }
  try {
    await transitionTask(db, {
      taskId,
      action: "pr_closed",
      actor: { kind: "system" },
      note: why ?? "The pull request was closed without merging",
      now,
    });
    return { result: "unlinked", taskNumber: taskId, replies: [] };
  } catch (err) {
    if (err instanceof TaskRuleError && err.code === "invalid_state") return { result: "unchanged", taskNumber: taskId, replies: [] };
    throw err;
  }
}
