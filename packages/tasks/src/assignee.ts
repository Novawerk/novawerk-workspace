// What the person on a task does: read the contribution guide, link a pull request by hand
// (when the webhook missed it), ask for a week more, or give the task back. And "Report" on a
// post, which any contributor can do.

import { and, eq, isNull } from "drizzle-orm";

import { formatTaskId, type TaskGuide } from "@nw/contracts";
import { postReports, taskEvents, taskPosts, tasks, type Contributor, type Database, type Task } from "@nw/db";

import { canWork } from "./contributors.js";
import { TaskRuleError } from "./errors.js";
import { whyPullRequestDoesNotCount, type PullRequestInput } from "./github.js";
import type { Via } from "./actions.js";
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

/**
 * Before asking GitHub about a PR: is this the caller's task, in progress, and the PR on its
 * repository? So nobody can make the API fetch arbitrary pull requests.
 */
export async function checkCanLinkPr(db: Database, c: Contributor, taskId: number, repo: string): Promise<void> {
  const task = await heldTask(db, c, taskId);
  if (!canWork(c)) throw new TaskRuleError("github_required", "Link your GitHub account first: we match pull requests by it");
  if (task.status !== "assigned") throw new TaskRuleError("invalid_state", "Only a task in progress can get a pull request linked");
  if (repo.toLowerCase() !== task.repo.toLowerCase()) throw new TaskRuleError("invalid", `A pull request on ${task.repo}`, "url");
}

/**
 * Link a PR by hand, when the board didn't pick it up. `pr` is the PR as GitHub sees it now (the
 * API fetches it with the App): it must be open, on the task's repository, from the assignee's
 * linked GitHub account, and name this task. Anything else is refused, so a task can't wait in
 * review on a PR that can never finish it.
 */
export async function linkPrByHand(db: Database, c: Contributor, taskId: number, pr: PullRequestInput, via?: Via): Promise<Task> {
  await heldTask(db, c, taskId);
  if (!canWork(c)) throw new TaskRuleError("github_required", "Link your GitHub account first: we match pull requests by it");
  if (pr.merged || pr.state !== "open") throw new TaskRuleError("invalid", "That pull request is closed", "url");
  const why = await whyPullRequestDoesNotCount(db, taskId, pr);
  if (why) throw new TaskRuleError("invalid", why, "url");
  return transitionTask(db, {
    taskId,
    action: "link_pr",
    actor: { kind: "contributor", id: c.id },
    prUrl: pr.url,
    ...(via ? { viaTokenId: via.tokenId } : {}),
  });
}

/** Give the task back. It returns to open; the timeline records it; nothing counts against anyone. */
export async function releaseHeldTask(db: Database, c: Contributor, taskId: number, reason?: string, via?: Via): Promise<Task> {
  await heldTask(db, c, taskId);
  return transitionTask(db, {
    taskId,
    action: "release",
    actor: { kind: "contributor", id: c.id },
    ...(via ? { viaTokenId: via.tokenId } : {}),
    ...(reason?.trim() ? { note: reason.trim() } : {}),
  });
}

/** "I need a week more": once per assignment, while the task is assigned. */
export async function extendTask(db: Database, c: Contributor, taskId: number, now = new Date(), via?: Via): Promise<Task> {
  const task = await heldTask(db, c, taskId);
  if (task.status !== "assigned") throw new TaskRuleError("invalid_state", "Only a task in progress can get more time");
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(tasks)
      .set({ extendedAt: now, updatedAt: now })
      .where(and(eq(tasks.id, taskId), eq(tasks.assigneeId, c.id), eq(tasks.status, "assigned"), isNull(tasks.extendedAt)))
      .returning();
    if (!updated) throw new TaskRuleError("conflict", "You already asked for a week more on this task");
    await tx.insert(taskEvents).values({
      taskId,
      kind: "extended",
      actorContributorId: c.id,
      subjectContributorId: c.id,
      viaTokenId: via?.tokenId ?? null,
      createdAt: now,
    });
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
