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

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { TASK_LIMITS, TASK_SIZE_WERK, formatTaskId } from "@nw/contracts";
import { contributors, githubDeliveries, taskEvents, tasks, type Database, type Task } from "@nw/db";

import { TaskRuleError } from "./errors.js";
import { transitionTask } from "./transitions.js";

/** The facts the board needs about a PR (structurally @nw/github's PullRequestFacts). */
export interface PullRequestInput {
  repo: string;
  number: number;
  url: string;
  authorId: number;
  authorLogin: string;
  state: "open" | "closed";
  merged: boolean;
  taskNumber: number | null;
}

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
  if (!n) return nothing();

  const [row] = await db
    .select({ task: tasks, githubId: contributors.githubId })
    .from(tasks)
    .leftJoin(contributors, eq(contributors.id, tasks.assigneeId))
    .where(eq(tasks.id, n))
    .limit(1);
  if (!row || row.task.repo.toLowerCase() !== pr.repo.toLowerCase()) return nothing();
  const task = row.task;
  if (!["open", "assigned", "in_review", "done"].includes(task.status)) return nothing();

  const byAssignee = task.assigneeId !== null && row.githubId !== null && row.githubId === pr.authorId;
  if (!byAssignee) {
    if (opts.source === "webhook" && opts.action === "opened" && pr.state === "open" && task.status !== "done") {
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
          `Linked to [${formatTaskId(n)}: ${task.title}](${taskLink(opts.webUrl, n)}). Thanks, @${pr.authorLogin}! ` +
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

/** True the first time we see this X-GitHub-Delivery id; false for a redelivery. */
export async function claimDelivery(db: Database, id: string, event: string): Promise<boolean> {
  const rows = await db.insert(githubDeliveries).values({ id, event }).onConflictDoNothing().returning({ id: githubDeliveries.id });
  return rows.length === 1;
}

/** Forget a delivery whose handling failed, so GitHub's redelivery runs it again. */
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
    const since = task.lastActivityAt ?? task.assignedAt ?? task.updatedAt;
    const releaseAt = new Date(
      since.getTime() + (TASK_LIMITS.idleReleaseDays + (task.extendedAt ? TASK_LIMITS.extensionDays : 0)) * DAY_MS,
    );
    if (now >= releaseAt) {
      const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
      try {
        await transitionTask(db, {
          taskId: task.id,
          action: "release",
          actor: { kind: "system" },
          note: `Back on the board after ${days} days without activity`,
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
      note: `No activity since ${since.toISOString().slice(0, 10)}. Back on the board on ${releaseAt.toISOString().slice(0, 10)} unless something happens.`,
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
