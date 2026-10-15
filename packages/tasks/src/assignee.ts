// What the person on a task does: read the contribution guide, link a pull request by hand
// (when the webhook missed it), ask for a week more, or give the task back. And "Report" on a
// post, which any contributor can do.

import { and, eq, isNull } from "drizzle-orm";

import { formatTaskId, type TaskGuide } from "@nw/contracts";
import { postReports, taskEvents, taskPosts, tasks, type Contributor, type Database, type Task } from "@nw/db";

import { canWork } from "./contributors.js";
import { TaskRuleError } from "./errors.js";
import { transitionTask } from "./transitions.js";

async function heldTask(db: Database, c: Contributor, taskId: number): Promise<Task> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task || task.status === "draft") throw new TaskRuleError("not_found", `${formatTaskId(taskId)} doesn't exist`);
  if (task.assigneeId !== c.id) throw new TaskRuleError("forbidden", "Only the person on this task can do that");
  if (c.suspendedAt) throw new TaskRuleError("suspended", "This account is suspended");
  return task;
}

/** The default contribution guide. A member's `guide_template` on the task replaces it. */
export function defaultGuide(task: Pick<Task, "id" | "title" | "repo" | "criteria">): string {
  const id = formatTaskId(task.id);
  const done = task.criteria.length ? task.criteria.map((line) => `- [ ] ${line}`).join("\n") : "- [ ] What the task says";
  return `# ${id}: ${task.title}

## Get the code
1. Fork https://github.com/${task.repo} and clone your fork.
2. \`pnpm install\` (pnpm 10, Node 22+). Read \`CLAUDE.md\` first: it has the layout and the rules.
3. Branch from \`main\`: \`git checkout -b nw-${task.id}-short-name\`.

## Our rules
- A table change: edit \`packages/db/src/schema.ts\`, run \`pnpm db:generate\`, commit the migration. Never edit a migration by hand.
- Validate input with \`@nw/contracts\`, in the browser and in the API.
- Only \`packages/config\` reads \`process.env\` in shared packages.
- \`pnpm typecheck && pnpm test && pnpm lint\` pass before you open the PR.

## Done when
${done}

## Open the pull request
- Put \`Task: ${id}\` in the description, so the board links it.
- Sign off every commit (DCO): \`git commit -s\`.
- Open it from the GitHub account linked to your Novawerk profile. A member reviews it there.

## Questions
Ask in the task's thread: https://novawerk.io/tasks/${id}. Answers stay public for the next person.
`;
}

/** GET /contrib/tasks/:id/guide: for the assignee only. */
export async function guideFor(db: Database, c: Contributor, taskId: number): Promise<TaskGuide> {
  const task = await heldTask(db, c, taskId);
  return { taskId: formatTaskId(task.id), markdown: task.guideTemplate?.trim() || defaultGuide(task) };
}

/** A pull request URL on the task's own repository, or a TaskRuleError on `url`. */
function prOnRepo(task: Task, url: string): string {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d{1,9})\/?$/.exec(url.trim());
  if (!match || match[1]!.toLowerCase() !== task.repo.toLowerCase()) {
    throw new TaskRuleError("invalid", `A pull request on ${task.repo}`, "url");
  }
  return `https://github.com/${task.repo}/pull/${match[2]}`;
}

/**
 * Link a PR by hand. The task goes in review; whether the PR counts is still decided when it
 * merges (its author must be this person's linked GitHub account).
 */
export async function linkPrByHand(db: Database, c: Contributor, taskId: number, url: string): Promise<Task> {
  const task = await heldTask(db, c, taskId);
  if (!canWork(c)) throw new TaskRuleError("github_required", "Link your GitHub account first: we match pull requests by it");
  return transitionTask(db, { taskId, action: "link_pr", actor: { kind: "contributor", id: c.id }, prUrl: prOnRepo(task, url) });
}

/** Give the task back. It returns to open; the timeline records it; nothing counts against anyone. */
export async function releaseHeldTask(db: Database, c: Contributor, taskId: number, reason?: string): Promise<Task> {
  await heldTask(db, c, taskId);
  return transitionTask(db, {
    taskId,
    action: "release",
    actor: { kind: "contributor", id: c.id },
    ...(reason?.trim() ? { note: reason.trim() } : {}),
  });
}

/** "I need a week more": once per assignment, while the task is assigned. */
export async function extendTask(db: Database, c: Contributor, taskId: number, now = new Date()): Promise<Task> {
  const task = await heldTask(db, c, taskId);
  if (task.status !== "assigned") throw new TaskRuleError("invalid_state", "Only a task in progress can get more time");
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ extendedAt: now, updatedAt: now })
      .where(and(eq(tasks.id, taskId), eq(tasks.assigneeId, c.id), eq(tasks.status, "assigned"), isNull(tasks.extendedAt)))
      .returning();
    if (!updated) throw new TaskRuleError("conflict", "You already asked for a week more on this task");
    await tx.insert(taskEvents).values({ taskId, kind: "extended", actorContributorId: c.id, createdAt: now });
    return updated;
  });
}

/** Report a post to the members. Once per person and post; never your own. */
export async function reportPost(db: Database, c: Contributor, postId: string, reason?: string): Promise<void> {
  if (c.suspendedAt) throw new TaskRuleError("suspended", "This account is suspended");
  const [row] = await db
    .select({ post: taskPosts, status: tasks.status })
    .from(taskPosts)
    .innerJoin(tasks, eq(tasks.id, taskPosts.taskId))
    .where(eq(taskPosts.id, postId))
    .limit(1);
  if (!row || row.status === "draft" || row.post.hiddenAt) throw new TaskRuleError("not_found", "No such post");
  if (row.post.authorContributorId === c.id) throw new TaskRuleError("forbidden", "You can't report your own post");
  await db
    .insert(postReports)
    .values({ postId, taskId: row.post.taskId, contributorId: c.id, reason: reason?.trim() || null })
    .onConflictDoNothing();
}
