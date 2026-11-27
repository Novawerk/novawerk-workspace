// /admin/projects: the portfolio on novawerk.io. Drafts and archived projects stay off the site
// (PUBLIC_PROJECT_STATUSES). Every change pings apps/web to refresh; the answer carries
// `website` so the panel can say whether the site is already up to date.
//
// Pictures are uploaded to the public Blob store first (POST /admin/uploads/image) and saved
// here as URLs. When a project stops using one of our pictures, it is deleted from the store.
//
// Every status change goes into the project's timeline. Moving to `launched` sets the launch
// day to today if it is empty. After a status or launch-day change the posts the project has
// reached are planned (`postsPlanned` in the answer) and the promo agent drafts them.

import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";

import { INITIATOR_ROLE, projectInput, projectTeamInput, projectUpdateInput } from "@nw/contracts";
import { isMaintainer, members, projectMembers, projects, type Database, type Project } from "@nw/db";

import { conflict, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import {
  SLUG_TAKEN,
  SlugTakenError,
  createProject,
  dropUnusedImages,
  imagesOf,
  refreshWebsite,
  updateProject,
} from "../../admin/projects.js";
import { requireAdmin } from "../../auth.js";
import type { ApiEnv } from "../../types.js";
import { ADMIN_PROJECT_FIELDS, canChangeTeam, projectIdsOf } from "./access.js";
import { uuidParam, type AdminDeps } from "./shared.js";

export interface TeamMember {
  memberId: string;
  displayName: string;
  role: string;
}

async function teamsOf(db: Database, projectIds: string[]): Promise<Map<string, TeamMember[]>> {
  const teams = new Map<string, TeamMember[]>(projectIds.map((id) => [id, []]));
  if (projectIds.length === 0) return teams;
  const rows = await db
    .select({
      projectId: projectMembers.projectId,
      memberId: projectMembers.memberId,
      displayName: members.displayName,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(members, eq(members.id, projectMembers.memberId))
    .where(inArray(projectMembers.projectId, projectIds))
    .orderBy(asc(members.displayName));
  for (const { projectId, ...member } of rows) teams.get(projectId)?.push(member);
  return teams;
}

export function projectRoutes({ db, env, logger, files, triggerPromo }: AdminDeps) {
  const deps = { db, env, logger, files, triggerPromo };
  const refresh = () => refreshWebsite(deps);

  return (
    new Hono<ApiEnv>()
      /** Same order as the website: featured first, then sort order, then title. A member sees their own. */
      .get("/", async (c) => {
        const member = c.get("member");
        const mine = isMaintainer(member) ? undefined : await projectIdsOf(db, member.id);
        if (mine && mine.length === 0) return c.json([] as (Project & { team: TeamMember[] })[], 200);
        const rows = await db
          .select()
          .from(projects)
          .where(mine ? inArray(projects.id, mine) : undefined)
          .orderBy(desc(projects.featured), asc(projects.sortOrder), asc(projects.title));
        const teams = await teamsOf(
          db,
          rows.map((r) => r.id),
        );
        return c.json(
          rows.map((p) => ({ ...p, team: teams.get(p.id) ?? [] })),
          200,
        );
      })

      .get("/:id", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const [row] = await db.select().from(projects).where(eq(projects.id, c.req.valid("param").id)).limit(1);
        if (!row) return c.json(notFound, 404);
        const teams = await teamsOf(db, [row.id]);
        return c.json({ ...row, team: teams.get(row.id) ?? [] }, 200);
      })

      .post("/", requireAdmin, zValidator("json", projectInput, rejectInvalid), async (c) => {
        try {
          const saved = await createProject(deps, c.req.valid("json"), c.get("member").id);
          return c.json({ ...saved, project: { ...saved.project, team: [] as TeamMember[] } }, 201);
        } catch (err) {
          if (err instanceof SlugTakenError) return c.json(conflict("slug", SLUG_TAKEN), 409);
          throw err;
        }
      })

      .patch(
        "/:id",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", projectUpdateInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const patch = c.req.valid("json");
          if (!isMaintainer(c.get("member")) && ADMIN_PROJECT_FIELDS.some((f) => patch[f] !== undefined)) {
            return c.json({ error: "Only admins change the stage, featured, order or slug" }, 403);
          }
          try {
            const saved = await updateProject(deps, id, patch, c.get("member").id);
            if (!saved) return c.json(notFound, 404);
            const teams = await teamsOf(db, [id]);
            return c.json({ ...saved, project: { ...saved.project, team: teams.get(id) ?? [] } }, 200);
          } catch (err) {
            if (err instanceof SlugTakenError) return c.json(conflict("slug", SLUG_TAKEN), 409);
            throw err;
          }
        },
      )

      .delete("/:id", requireAdmin, zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        // The team goes with it (cascade). The pitch it came from stays, unlinked.
        const [row] = await db.delete(projects).where(eq(projects.id, c.req.valid("param").id)).returning();
        if (!row) return c.json(notFound, 404);
        await dropUnusedImages(deps, row.id, imagesOf(row), []);
        return c.json({ ok: true as const, website: await refresh() }, 200);
      })

      /** Replace the whole team in one go: the editor sends the list as it looks on screen. */
      .put(
        "/:id/members",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", projectTeamInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const team = c.req.valid("json").members;
          if (!(await canChangeTeam(db, c.get("member"), id))) {
            return c.json({ error: "Only the Initiator or an admin changes the team" }, 403);
          }
          // An Initiator can't write themselves out: only an admin hands a project over.
          const me = c.get("member");
          if (!isMaintainer(me) && !team.some((m) => m.memberId === me.id && m.role.trim().toLowerCase() === INITIATOR_ROLE.toLowerCase())) {
            return c.json(validationFailed({ members: ["Keep yourself on the team as Initiator. An admin can hand the project over."] }), 400);
          }
          const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
          if (!project) return c.json(notFound, 404);
          if (team.length) {
            const known = await db
              .select({ id: members.id })
              .from(members)
              .where(
                inArray(
                  members.id,
                  team.map((m) => m.memberId),
                ),
              );
            const unknown = team.map((m) => m.memberId).filter((m) => !known.some((k) => k.id === m));
            if (unknown.length) return c.json(validationFailed({ members: [`Unknown member: ${unknown.join(", ")}`] }), 400);
          }
          await db.transaction(async (tx) => {
            await tx.delete(projectMembers).where(eq(projectMembers.projectId, id));
            if (team.length) await tx.insert(projectMembers).values(team.map((m) => ({ projectId: id, ...m })));
          });
          const teams = await teamsOf(db, [id]);
          return c.json({ team: teams.get(id) ?? [], website: await refresh() }, 200);
        },
      )
  );
}
