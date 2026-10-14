// /admin/projects — the lifecycle around a portfolio project:
//
//   GET    /projects/board                                 every pitch not yet accepted and every project,
//                                                          with what the stage board shows on its card
//   GET    /projects/:id/history                           status changes, oldest first
//   GET    /projects/:id/deliverables                      open ones by due date, then done ones
//   POST   /projects/:id/deliverables                      one artifact, one owner, done-when, date
//   PATCH  /projects/:id/deliverables/:deliverableId
//   DELETE /projects/:id/deliverables/:deliverableId
//   GET    /projects/:id/posts                             the project's posts (src/routes/admin/posts.ts)
//   POST   /projects/:id/posts                             add one by hand: an extra progress post, a custom one

import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { POST_STATUSES, deliverableInput, deliverableUpdateInput, projectPostCreateInput, type PostStatus } from "@nw/contracts";
import {
  members,
  posts,
  projectDeliverables,
  projectMembers,
  projectStatusChanges,
  projectSubmissions,
  projects,
  type Database,
} from "@nw/db";
import { lifecycleFacts, upcomingPosts, type PlannedPost } from "@nw/promo/lifecycle";

import { today } from "../../admin/lifecycle.js";
import { notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import type { ApiEnv } from "../../types.js";
import { projectIdsOf } from "./access.js";
import { addPost, laneHints, postViews } from "./posts.js";
import { memberExists, uuidParam, type AdminDeps } from "./shared.js";

const deliverableParam = z.object({ id: z.guid(), deliverableId: z.guid() });

async function projectExists(db: Database, id: string): Promise<boolean> {
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
  return row !== undefined;
}

/** Deliverables with their owner's name: open ones by due date first, then the done ones. */
async function deliverablesOf(db: Database, projectId: string, id?: string) {
  return db
    .select({
      id: projectDeliverables.id,
      projectId: projectDeliverables.projectId,
      title: projectDeliverables.title,
      ownerId: projectDeliverables.ownerId,
      ownerName: members.displayName,
      doneWhen: projectDeliverables.doneWhen,
      dueOn: projectDeliverables.dueOn,
      doneOn: projectDeliverables.doneOn,
      createdAt: projectDeliverables.createdAt,
      updatedAt: projectDeliverables.updatedAt,
    })
    .from(projectDeliverables)
    .leftJoin(members, eq(members.id, projectDeliverables.ownerId))
    .where(and(eq(projectDeliverables.projectId, projectId), id ? eq(projectDeliverables.id, id) : undefined))
    .orderBy(
      sql`${projectDeliverables.doneOn} is not null`,
      sql`${projectDeliverables.dueOn} asc nulls last`,
      asc(projectDeliverables.createdAt),
    );
}

/**
 * The stage board: pitches waiting for a decision (and declined ones), and every project (or only
 * the `only` ones, for a member) with
 * what its card shows: team, post counts, the next moment, the next deliverable, and what it
 * still needs.
 */
async function stageBoard(db: Database, today: string, only?: string[]) {
  const pitches = only
    ? []
    : await db
    .select({
      id: projectSubmissions.id,
      projectName: projectSubmissions.projectName,
      name: projectSubmissions.name,
      status: projectSubmissions.status,
      aiSummary: projectSubmissions.aiSummary,
      reviewerId: projectSubmissions.reviewerId,
      createdAt: projectSubmissions.createdAt,
    })
    .from(projectSubmissions)
    .where(ne(projectSubmissions.status, "accepted"))
    .orderBy(desc(projectSubmissions.createdAt));

  if (only && only.length === 0) return { pitches, projects: [] };
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      tagline: projects.tagline,
      status: projects.status,
      coverUrl: projects.coverUrl,
      launchDate: projects.launchDate,
      featured: projects.featured,
      submissionId: projects.submissionId,
    })
    .from(projects)
    .where(only ? inArray(projects.id, only) : undefined)
    .orderBy(desc(projects.featured), asc(projects.sortOrder), asc(projects.title));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { pitches, projects: [] };

  const [facts, team, postRows, openDeliverables] = await Promise.all([
    lifecycleFacts(db, ids),
    db
      .select({ projectId: projectMembers.projectId, displayName: members.displayName, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(members, eq(members.id, projectMembers.memberId))
      .where(inArray(projectMembers.projectId, ids))
      .orderBy(asc(members.displayName)),
    db.select({ projectId: posts.projectId, kind: posts.kind, seq: posts.seq, status: posts.status }).from(posts).where(inArray(posts.projectId, ids)),
    db
      .select({ projectId: projectDeliverables.projectId, title: projectDeliverables.title, dueOn: projectDeliverables.dueOn })
      .from(projectDeliverables)
      .where(and(inArray(projectDeliverables.projectId, ids), isNull(projectDeliverables.doneOn)))
      .orderBy(sql`${projectDeliverables.dueOn} asc nulls last`),
  ]);

  return {
    pitches,
    projects: rows.map((project) => {
      const f = facts.get(project.id);
      const own = postRows.filter((p) => p.projectId === project.id);
      const open = openDeliverables.filter((d) => d.projectId === project.id);
      const upcoming = f ? upcomingPosts(f, today, own).sort((a, b) => a.dueOn.localeCompare(b.dueOn)) : [];
      const next: PlannedPost | null = upcoming.length > 0 ? upcoming[0]! : null;
      return {
        ...project,
        buildingSince: f?.buildingSince ?? null,
        team: team.filter((t) => t.projectId === project.id).map(({ displayName, role }) => ({ displayName, role })),
        posts: Object.fromEntries(POST_STATUSES.map((s) => [s, own.filter((p) => p.status === s).length])) as Record<PostStatus, number>,
        next,
        openDeliverables: open.length,
        nextDeliverable: open[0] ? { title: open[0].title, dueOn: open[0].dueOn } : null,
        hints: laneHints(project.status, project.launchDate, f?.buildingSince ?? null),
      };
    }),
  };
}

export function projectLifecycleRoutes(deps: AdminDeps) {
  const { db } = deps;
  const unknownOwner = validationFailed({ ownerId: ["Pick a member"] });

  return (
    new Hono<ApiEnv>()
      // A member sees their own projects and no pitches.
      .get("/board", async (c) => {
        const member = c.get("member");
        const only = member.canAdmin ? undefined : await projectIdsOf(db, member.id);
        return c.json({ today: today(), ...(await stageBoard(db, today(), only)) }, 200);
      })

      .get("/:id/history", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        if (!(await projectExists(db, id))) return c.json(notFound, 404);
        const rows = await db
          .select({
            id: projectStatusChanges.id,
            fromStatus: projectStatusChanges.fromStatus,
            toStatus: projectStatusChanges.toStatus,
            changedBy: projectStatusChanges.changedBy,
            changedByName: members.displayName,
            changedAt: projectStatusChanges.changedAt,
          })
          .from(projectStatusChanges)
          .leftJoin(members, eq(members.id, projectStatusChanges.changedBy))
          .where(eq(projectStatusChanges.projectId, id))
          .orderBy(asc(projectStatusChanges.changedAt), asc(projectStatusChanges.id));
        return c.json(rows, 200);
      })

      .get("/:id/deliverables", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        if (!(await projectExists(db, id))) return c.json(notFound, 404);
        return c.json(await deliverablesOf(db, id), 200);
      })

      .post(
        "/:id/deliverables",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", deliverableInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const input = c.req.valid("json");
          if (!(await projectExists(db, id))) return c.json(notFound, 404);
          if (input.ownerId && !(await memberExists(db, input.ownerId))) return c.json(unknownOwner, 400);
          const [row] = await db
            .insert(projectDeliverables)
            .values({ ...input, projectId: id })
            .returning({ id: projectDeliverables.id });
          return c.json((await deliverablesOf(db, id, row!.id))[0]!, 201);
        },
      )

      .patch(
        "/:id/deliverables/:deliverableId",
        zValidator("param", deliverableParam, notFoundIfInvalid),
        zValidator("json", deliverableUpdateInput, rejectInvalid),
        async (c) => {
          const { id, deliverableId } = c.req.valid("param");
          const patch = c.req.valid("json");
          if (patch.ownerId && !(await memberExists(db, patch.ownerId))) return c.json(unknownOwner, 400);
          const [row] = await db
            .update(projectDeliverables)
            .set(patch)
            .where(and(eq(projectDeliverables.id, deliverableId), eq(projectDeliverables.projectId, id)))
            .returning({ id: projectDeliverables.id });
          if (!row) return c.json(notFound, 404);
          return c.json((await deliverablesOf(db, id, deliverableId))[0]!, 200);
        },
      )

      .delete(
        "/:id/deliverables/:deliverableId",
        zValidator("param", deliverableParam, notFoundIfInvalid),
        async (c) => {
          const { id, deliverableId } = c.req.valid("param");
          const [row] = await db
            .delete(projectDeliverables)
            .where(and(eq(projectDeliverables.id, deliverableId), eq(projectDeliverables.projectId, id)))
            .returning({ id: projectDeliverables.id });
          return row ? c.json({ ok: true as const }, 200) : c.json(notFound, 404);
        },
      )

      .get("/:id/posts", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        if (!(await projectExists(db, id))) return c.json(notFound, 404);
        return c.json(await postViews(db, eq(posts.projectId, id)), 200);
      })

      .post(
        "/:id/posts",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", projectPostCreateInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const input = c.req.valid("json");
          if (input.kind === "custom" && !input.label) return c.json(validationFailed({ label: ["Name the post"] }), 400);
          const result = await addPost(deps, c.get("member"), { ...input, projectId: id });
          if (!result.ok) return c.json(result.body, result.status);
          return c.json({ post: result.post, dispatched: result.dispatched }, 201);
        },
      )
  );
}
