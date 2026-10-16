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
import { asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Hono } from "hono";

import { INITIATOR_ROLE, projectInput, projectTeamInput, projectUpdateInput } from "@nw/contracts";
import { isMaintainer, members, projectMembers, projects, type Database, type Project } from "@nw/db";

import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import { planPosts, recordStatusChange, today } from "../../admin/lifecycle.js";
import { requireAdmin } from "../../auth.js";
import { revalidateWeb } from "../../revalidate.js";
import type { ApiEnv } from "../../types.js";
import { ADMIN_PROJECT_FIELDS, canChangeTeam, projectIdsOf } from "./access.js";
import { uuidParam, type AdminDeps } from "./shared.js";

const SLUG_TAKEN = "Another project already uses this slug";

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

/** Every picture URL a project uses. */
const imagesOf = (p: Pick<Project, "coverUrl" | "gallery">) => [
  ...(p.coverUrl ? [p.coverUrl] : []),
  ...(p.gallery ?? []).map((g) => g.url),
];

export function projectRoutes({ db, env, logger, files, triggerPromo }: AdminDeps) {
  // The portfolio, and the contributors wall: it shows who started which public project.
  const refreshWebsite = () => revalidateWeb(env.webRevalidate, logger, ["projects", "contributors"]);

  /** Delete pictures `before` had and nothing uses any more. Best effort: never fails a save. */
  async function dropUnusedImages(projectId: string, before: string[], after: string[]) {
    const gone = before.filter((url) => !after.includes(url));
    if (!gone.length || !files?.ready.public) return;
    const others = await db
      .select({ coverUrl: projects.coverUrl, gallery: projects.gallery })
      .from(projects)
      .where(ne(projects.id, projectId));
    const stillUsed = new Set(others.flatMap(imagesOf));
    await files
      .deletePublicImages(gone.filter((url) => !stillUsed.has(url)))
      .catch((err) => logger.warn("[api] could not delete project pictures:", err));
  }

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
          const project = await db.transaction(async (tx) => {
            const [row] = await tx.insert(projects).values(c.req.valid("json")).returning();
            await recordStatusChange(tx, { projectId: row!.id, from: null, to: row!.status, by: c.get("member").id });
            return row!;
          });
          const postsPlanned = await planPosts({ db, triggerPromo, logger }, project.id);
          return c.json(
            { project: { ...project, team: [] as TeamMember[] }, website: await refreshWebsite(), postsPlanned },
            201,
          );
        } catch (err) {
          if (isUniqueViolation(err)) return c.json(conflict("slug", SLUG_TAKEN), 409);
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
          const [before] = await db
            .select({ coverUrl: projects.coverUrl, gallery: projects.gallery, status: projects.status, launchDate: projects.launchDate })
            .from(projects)
            .where(eq(projects.id, id))
            .limit(1);
          if (!before) return c.json(notFound, 404);
          const launching = patch.status === "launched" && before.status !== "launched";
          const launchDate = patch.launchDate === undefined ? before.launchDate : patch.launchDate;
          try {
            const row = await db.transaction(async (tx) => {
              const [updated] = await tx
                .update(projects)
                .set({ ...patch, ...(launching && !launchDate ? { launchDate: today() } : {}) })
                .where(eq(projects.id, id))
                .returning();
              if (updated && updated.status !== before.status) {
                await recordStatusChange(tx, { projectId: id, from: before.status, to: updated.status, by: c.get("member").id });
              }
              return updated;
            });
            if (!row) return c.json(notFound, 404);
            await dropUnusedImages(id, imagesOf(before), imagesOf(row));
            const lifecycleChanged = row.status !== before.status || row.launchDate !== before.launchDate;
            const postsPlanned = lifecycleChanged ? await planPosts({ db, triggerPromo, logger }, id) : 0;
            const teams = await teamsOf(db, [id]);
            return c.json(
              { project: { ...row, team: teams.get(id) ?? [] }, website: await refreshWebsite(), postsPlanned },
              200,
            );
          } catch (err) {
            if (isUniqueViolation(err)) return c.json(conflict("slug", SLUG_TAKEN), 409);
            throw err;
          }
        },
      )

      .delete("/:id", requireAdmin, zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        // The team goes with it (cascade). The pitch it came from stays, unlinked.
        const [row] = await db.delete(projects).where(eq(projects.id, c.req.valid("param").id)).returning();
        if (!row) return c.json(notFound, 404);
        await dropUnusedImages(row.id, imagesOf(row), []);
        return c.json({ ok: true as const, website: await refreshWebsite() }, 200);
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
          return c.json({ team: teams.get(id) ?? [], website: await refreshWebsite() }, 200);
        },
      )
  );
}
