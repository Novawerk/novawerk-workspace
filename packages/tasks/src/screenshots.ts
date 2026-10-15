// A suggestion's screenshot through triage. It waits in the private store (tasks.screenshot_pathname)
// until a member decides: accepted, the API copies it to the public store without metadata and
// records the URL here; declined or a duplicate, the API deletes it. The file operations are the
// API's (@nw/object-store); these only keep the task row in step.

import { and, eq, like } from "drizzle-orm";

import { SUGGESTION_SCREENSHOT_PREFIX } from "@nw/contracts";
import { tasks, type Database } from "@nw/db";

/** The private screenshot waiting on a task, or null. */
export async function pendingScreenshot(db: Database, taskId: number): Promise<string | null> {
  const [row] = await db.select({ pathname: tasks.screenshotPathname }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return row?.pathname ?? null;
}

/** Accepted: the public copy's URL is on the task, and the private one is no longer referenced. */
export async function publishScreenshot(db: Database, taskId: number, url: string): Promise<void> {
  await db.update(tasks).set({ screenshotUrl: url, screenshotPathname: null }).where(eq(tasks.id, taskId));
}

/** Declined or a duplicate: forget the private screenshot; returns it so the caller deletes the file. */
export async function forgetScreenshot(db: Database, taskId: number): Promise<string | null> {
  const pathname = await pendingScreenshot(db, taskId);
  if (!pathname) return null;
  await db.update(tasks).set({ screenshotPathname: null }).where(and(eq(tasks.id, taskId), eq(tasks.screenshotPathname, pathname)));
  return pathname;
}

/** Private screenshots still attached to a suggestion: the cleanup keeps these. */
export async function attachedScreenshots(db: Database): Promise<Set<string>> {
  const rows = await db
    .select({ pathname: tasks.screenshotPathname })
    .from(tasks)
    .where(like(tasks.screenshotPathname, `${SUGGESTION_SCREENSHOT_PREFIX}%`));
  return new Set(rows.map((r) => r.pathname!));
}

/** The private folder of one contributor's screenshots (deleted with their account). */
export const screenshotFolderOf = (contributorId: string) => `${SUGGESTION_SCREENSHOT_PREFIX}${contributorId}/`;
