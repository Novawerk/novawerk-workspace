// Create the posts a project should have by now (./plan.ts), once each. The API calls this right
// after a status or launch-date change; the promo agent calls it every morning for the posts
// that come due with time.

import { and, eq, inArray, min, notInArray } from "drizzle-orm";

import { posts, projectStatusChanges, projects, type Database, type Post } from "@nw/db";

import { isoDay, plannedPosts, type LifecycleFacts } from "./plan.js";

/** Status, launch date and building start for each project (all, or the ones named). */
export async function lifecycleFacts(db: Database, projectIds?: string[]): Promise<Map<string, LifecycleFacts>> {
  if (projectIds && projectIds.length === 0) return new Map();
  const rows = await db
    .select({ id: projects.id, status: projects.status, launchDate: projects.launchDate })
    .from(projects)
    .where(projectIds ? inArray(projects.id, projectIds) : notInArray(projects.status, ["draft", "archived"]));
  if (rows.length === 0) return new Map();

  const starts = await db
    .select({ projectId: projectStatusChanges.projectId, at: min(projectStatusChanges.changedAt) })
    .from(projectStatusChanges)
    .where(
      and(
        eq(projectStatusChanges.toStatus, "building"),
        inArray(
          projectStatusChanges.projectId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(projectStatusChanges.projectId);
  const since = new Map(starts.map((s) => [s.projectId, s.at ? isoDay(new Date(s.at)) : null]));

  return new Map(
    rows.map((r) => [r.id, { status: r.status, launchDate: r.launchDate, buildingSince: since.get(r.id) ?? null }]),
  );
}

/**
 * Insert the posts that are due (or nearly) and don't exist yet. Returns the new ones. Safe to
 * run concurrently: (project, kind, seq) is unique, and a clash is simply skipped.
 */
export async function syncPosts(db: Database, opts: { today: string; projectId?: string }): Promise<Post[]> {
  const facts = await lifecycleFacts(db, opts.projectId ? [opts.projectId] : undefined);
  const created: Post[] = [];
  for (const [projectId, project] of facts) {
    const due = plannedPosts(project, opts.today);
    if (due.length === 0) continue;
    const rows = await db
      .insert(posts)
      .values(due.map((p) => ({ projectId, ...p })))
      .onConflictDoNothing({ target: [posts.projectId, posts.kind, posts.seq] })
      .returning();
    created.push(...rows);
  }
  return created;
}
