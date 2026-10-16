// Who may touch which project. Maintainers see every project; any other member sees the
// projects they are on the team of, and nothing else exists for them (a 404, not a 403, so
// project ids don't leak). On their projects a team member edits the content, deliverables,
// posts and files; only the Initiator changes the team; the stage, featured, order and slug stay
// with maintainers.

import { and, eq, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { INITIATOR_ROLE } from "@nw/contracts";
import { isMaintainer, posts, projectMembers, type Database } from "@nw/db";

import { notFound } from "../../http.js";
import type { AdminMember, ApiEnv } from "../../types.js";

/** The projects a member is on the team of. */
export async function projectIdsOf(db: Database, memberId: string): Promise<string[]> {
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.memberId, memberId));
  return rows.map((r) => r.projectId);
}

/** True for admins, and for members on the project's team. */
export async function canSeeProject(db: Database, member: AdminMember, projectId: string): Promise<boolean> {
  if (isMaintainer(member)) return true;
  const [row] = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.memberId, member.id)))
    .limit(1);
  return row !== undefined;
}

/** True for admins, and for the project's Initiator. */
export async function canChangeTeam(db: Database, member: AdminMember, projectId: string): Promise<boolean> {
  if (isMaintainer(member)) return true;
  const [row] = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.memberId, member.id),
        sql`lower(${projectMembers.role}) = ${INITIATOR_ROLE.toLowerCase()}`,
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Project fields only admins change: where it is in its life, and how the website lists it. */
export const ADMIN_PROJECT_FIELDS = ["status", "featured", "sortOrder", "slug"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For /projects/:id and everything under it: a project the member can't see doesn't exist.
 * Non-uuid ids (/projects/board) pass through to their own route.
 */
export function projectGuard(db: Database) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const id = c.req.param("id");
    if (id && UUID.test(id) && !(await canSeeProject(db, c.get("member"), id))) return c.json(notFound, 404);
    await next();
  });
}

/**
 * For /posts/:id and everything under it: the same rule, through the post's project. Posts about
 * Novawerk itself (no project) are for admins.
 */
export function postGuard(db: Database) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const id = c.req.param("id");
    if (id && UUID.test(id) && !isMaintainer(c.get("member"))) {
      const [post] = await db.select({ projectId: posts.projectId }).from(posts).where(eq(posts.id, id)).limit(1);
      if (post && (!post.projectId || !(await canSeeProject(db, c.get("member"), post.projectId)))) return c.json(notFound, 404);
    }
    await next();
  });
}
