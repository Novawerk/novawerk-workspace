// Making and changing portfolio projects. The admin panel (/admin/projects) and the MCP server
// (create_project, update_project) both come here, so a project made by an agent goes through the
// same steps as one made in the browser: the status timeline, the planned posts, unused pictures
// deleted, and the website told to refresh.

import { eq, ne } from "drizzle-orm";

import type { ProjectInput, ProjectUpdateInput } from "@nw/contracts";
import { projects, type Database, type Project } from "@nw/db";

import { isUniqueViolation } from "../http.js";
import { revalidateWeb } from "../revalidate.js";
import type { AppDeps, Logger } from "../types.js";
import { planPosts, recordStatusChange, today } from "./lifecycle.js";

export type ProjectDeps = Pick<AppDeps, "db" | "env" | "files" | "triggerPromo"> & { logger: Logger };

export const SLUG_TAKEN = "Another project already uses this slug";

/** The slug is someone else's. */
export class SlugTakenError extends Error {
  constructor() {
    super(SLUG_TAKEN);
  }
}

/** What a save answers: the row, whether the website refreshed, how many posts it planned. */
export interface ProjectSaved {
  project: Project;
  website: Awaited<ReturnType<typeof revalidateWeb>>;
  postsPlanned: number;
}

/** The portfolio, and the contributors wall: it shows who started which public project. */
export const refreshWebsite = ({ env, logger }: Pick<ProjectDeps, "env" | "logger">) =>
  revalidateWeb(env.webRevalidate, logger, ["projects", "contributors"]);

/** Every picture URL a project uses. */
export const imagesOf = (p: Pick<Project, "coverUrl" | "gallery">) => [
  ...(p.coverUrl ? [p.coverUrl] : []),
  ...(p.gallery ?? []).map((g) => g.url),
];

/** Delete pictures `before` had and nothing uses any more. Best effort: never fails a save. */
export async function dropUnusedImages({ db, files, logger }: ProjectDeps, projectId: string, before: string[], after: string[]) {
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

/** A new project, a draft unless `input.status` says otherwise. */
export async function createProject(deps: ProjectDeps, input: ProjectInput, by: string): Promise<ProjectSaved> {
  const { db } = deps;
  let project: Project;
  try {
    project = await db.transaction(async (tx) => {
      const [row] = await tx.insert(projects).values(input).returning();
      await recordStatusChange(tx, { projectId: row!.id, from: null, to: row!.status, by });
      return row!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugTakenError();
    throw err;
  }
  const postsPlanned = await planPosts({ db, triggerPromo: deps.triggerPromo, logger: deps.logger }, project.id);
  return { project, website: await refreshWebsite(deps), postsPlanned };
}

/** Change a project. Null when there is no such project. Who may change which field is the caller's check. */
export async function updateProject(deps: ProjectDeps, id: string, patch: ProjectUpdateInput, by: string): Promise<ProjectSaved | null> {
  const { db } = deps;
  const [before] = await db
    .select({ coverUrl: projects.coverUrl, gallery: projects.gallery, status: projects.status, launchDate: projects.launchDate })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!before) return null;
  const launching = patch.status === "launched" && before.status !== "launched";
  const launchDate = patch.launchDate === undefined ? before.launchDate : patch.launchDate;
  let row: Project | undefined;
  try {
    row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(projects)
        .set({ ...patch, ...(launching && !launchDate ? { launchDate: today() } : {}) })
        .where(eq(projects.id, id))
        .returning();
      if (updated && updated.status !== before.status) {
        await recordStatusChange(tx, { projectId: id, from: before.status, to: updated.status, by });
      }
      return updated;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugTakenError();
    throw err;
  }
  if (!row) return null;
  await dropUnusedImages(deps, id, imagesOf(before), imagesOf(row));
  const lifecycleChanged = row.status !== before.status || row.launchDate !== before.launchDate;
  const postsPlanned = lifecycleChanged ? await planPosts({ db, triggerPromo: deps.triggerPromo, logger: deps.logger }, id) : 0;
  return { project: row, website: await refreshWebsite(deps), postsPlanned };
}

/** One project by id or slug. */
export async function findProject(db: Database, ref: { id?: string; slug?: string }): Promise<Project | null> {
  const where = ref.id ? eq(projects.id, ref.id) : ref.slug ? eq(projects.slug, ref.slug) : undefined;
  if (!where) return null;
  const [row] = await db.select().from(projects).where(where).limit(1);
  return row ?? null;
}
