// Publishing a list of tasks at once (scripts/import-tasks.ts): the same createTask a member's
// "New task, publish" uses, all in one transaction, refused as a whole when any title already
// exists on the board (any case) or the member who files them isn't an active member.

import { and, eq, inArray, sql } from "drizzle-orm";

import { taskImportInput } from "@nw/contracts";
import { members, tasks, type Database, type Task } from "@nw/db";

import { createTask } from "./admin.js";
import { TaskRuleError } from "./errors.js";

export type ParsedTaskImport = ReturnType<typeof taskImportInput.parse>;

/** Titles from the list that a task on the board already has (any case, any status). */
export async function existingTaskTitles(db: Database, list: ParsedTaskImport): Promise<string[]> {
  const wanted = list.map((t) => t.title.trim().toLowerCase());
  const rows = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(inArray(sql`lower(trim(${tasks.title}))`, wanted));
  return rows.map((r) => r.title);
}

/**
 * What would stop an import, in words: the filing member (an active member with can_admin, like
 * anyone who creates a task in the admin) and every task's reviewer (a member). Empty when fine.
 * The dry run shows these before anything is written.
 */
export async function importProblems(db: Database, memberId: string | undefined, list: ParsedTaskImport): Promise<string[]> {
  const problems: string[] = [];
  if (memberId !== undefined) {
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.active, true), eq(members.canAdmin, true)))
      .limit(1);
    if (!member) problems.push(`"${memberId}" isn't an active member with admin rights: only they may file tasks`);
  }
  const reviewers = [...new Set(list.map((t) => t.reviewerId).filter((id): id is string => Boolean(id)))];
  if (reviewers.length) {
    const known = new Set((await db.select({ id: members.id }).from(members).where(inArray(members.id, reviewers))).map((m) => m.id));
    for (const t of list) {
      if (t.reviewerId && !known.has(t.reviewerId)) problems.push(`"${t.title}": no member "${t.reviewerId}" to review it`);
    }
  }
  return problems;
}

/** Create and publish every task in the list, or none. */
export async function importTasks(db: Database, memberId: string, list: ParsedTaskImport, now = new Date()): Promise<Task[]> {
  return db.transaction(async (tx) => {
    const problems = await importProblems(tx, memberId, list);
    if (problems.length) throw new TaskRuleError("invalid", problems.join("; "));
    const clash = await existingTaskTitles(tx, list);
    if (clash.length) throw new TaskRuleError("conflict", `Already on the board: ${clash.join("; ")}`);
    const created: Task[] = [];
    for (const task of list) created.push(await createTask(tx, memberId, { ...task, publish: true }, now));
    return created;
  });
}
