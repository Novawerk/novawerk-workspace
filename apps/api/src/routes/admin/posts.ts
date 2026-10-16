// /admin/posts: the public story of Novawerk and its projects. The promo agent plans a project's
// lifecycle posts and drafts them; members add any other post (with or without a project), or
// write it in the repo (posts/, synced on merge). A member edits, approves, posts by hand and
// marks it published. Nothing here publishes anything.
//
//   GET    /posts?status=&projectId=          list, by due date
//   GET    /posts/board                       one lane per project (its posts and the moments still
//                                             ahead), and the posts about Novawerk itself
//   POST   /posts                             add one by hand: any kind, a project or none
//   GET    /posts/:id
//   PATCH  /posts/:id                         name, brief, date, languages, platforms, card, pictures,
//                                             content. Changing what goes out sends an approved post
//                                             back to review. Repo posts change only in the repo.
//   POST   /posts/:id/draft                   ask the promo agent for a (new) draft
//   POST   /posts/:id/approve                 needs every language written, no 【待补充】 / [To fill in] left
//   POST   /posts/:id/skip | /restore
//   POST   /posts/:id/publish                 "we posted it" → published
//   POST   /posts/:id/unpublish               undo that → approved
//   POST   /posts/:id/export-link             a link `pnpm post pull` takes, to continue in the repo
//
// And under /projects/:id (src/routes/admin/project-lifecycle.ts): the timeline, deliverables,
// and adding a post from the project page.

import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, inArray, isNull, notInArray, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import {
  POST_KIND_INFO,
  POST_STATUSES,
  emptyLangs,
  emptyPostCopy,
  placeholdersIn,
  xiaohongshuLinks,
  postCreateInput,
  postUpdateInput,
} from "@nw/contracts";
import { isMaintainer, posts, projects, type Database, type Post, type Project } from "@nw/db";
import { lifecycleFacts, nextSeq, upcomingPosts, type PlannedPost } from "@nw/promo/lifecycle";

import { today } from "../../admin/lifecycle.js";
import { conflict, isUniqueViolation, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../../http.js";
import { triggerPromoSafely } from "../../agents.js";
import type { AdminMember, ApiEnv } from "../../types.js";
import { canSeeProject, projectIdsOf } from "./access.js";
import { exportLink } from "./post-exports.js";
import { uuidParam, type AdminDeps } from "./shared.js";

const postFilter = z.object({
  status: z.enum(POST_STATUSES).optional(),
  projectId: z.guid().optional(),
});

/** The project a post belongs to, with the pictures a card can use. */
export interface PostProject {
  id: string;
  title: string;
  slug: string;
  link: string | null;
  coverUrl: string | null;
  gallery: { url: string; caption?: string }[];
}

/** A post with its project (null for a post about Novawerk itself). */
export type PostView = Post & { project: PostProject | null };

/** Posts with their project, by due date. */
export async function postViews(db: Database, where?: SQL): Promise<PostView[]> {
  const rows = await db
    .select({
      post: posts,
      project: {
        id: projects.id,
        title: projects.title,
        slug: projects.slug,
        link: projects.link,
        coverUrl: projects.coverUrl,
        gallery: projects.gallery,
      },
    })
    .from(posts)
    .leftJoin(projects, eq(projects.id, posts.projectId))
    .where(where)
    .orderBy(asc(posts.dueOn), asc(projects.title));
  return rows.map(({ post, project }) => ({ ...post, project: project?.id ? (project as PostProject) : null }));
}

/** Lanes go by how far along a project is: the ones moving now first. */
const LANE_ORDER: Project["status"][] = ["launching", "building", "launched", "planning", "draft", "archived"];

/** What a project still needs before its posts can be planned. */
export function laneHints(status: Project["status"], launchDate: string | null, buildingSince: string | null): string[] {
  const hints: string[] = [];
  if (status === "launching" && !launchDate) hints.push("Set a launch date to plan the launch posts");
  if (status === "launched" && !launchDate) hints.push("Set the launch date to plan the follow-ups");
  if (status === "building" && !buildingSince) hints.push("No building start on record; add posts by hand");
  return hints;
}

/**
 * The board: every project that is under way (or already has posts), each with its posts and
 * the moments still ahead, and (for admins) the posts that belong to no project. Drafts and
 * archived projects without posts stay off it.
 */
async function board(db: Database, today: string, only?: string[]) {
  const withPosts = db.select({ id: posts.projectId }).from(posts);
  const general = only ? [] : await postViews(db, isNull(posts.projectId));
  if (only && only.length === 0) return { lanes: [], general };
  const rows = await db
    .select({ id: projects.id, title: projects.title, slug: projects.slug, status: projects.status, launchDate: projects.launchDate })
    .from(projects)
    .where(
      and(
        or(notInArray(projects.status, ["draft", "archived"]), inArray(projects.id, withPosts)),
        only ? inArray(projects.id, only) : undefined,
      ),
    );
  const facts = await lifecycleFacts(
    db,
    rows.map((r) => r.id),
  );
  const all = rows.length ? await postViews(db, inArray(posts.projectId, rows.map((r) => r.id))) : [];
  const lanes = rows
    .map((project) => {
      const f = facts.get(project.id);
      const own = all.filter((p) => p.projectId === project.id);
      const buildingSince = f?.buildingSince ?? null;
      return {
        project,
        buildingSince,
        posts: own,
        upcoming: f ? upcomingPosts(f, today, own) : ([] as PlannedPost[]),
        hints: laneHints(project.status, project.launchDate, buildingSince),
      };
    })
    .sort(
      (a, b) =>
        LANE_ORDER.indexOf(a.project.status) - LANE_ORDER.indexOf(b.project.status) ||
        a.project.title.localeCompare(b.project.title),
    );
  return { lanes, general };
}

type AddResult =
  | { ok: true; post: PostView; dispatched: boolean }
  | { ok: false; status: 403 | 404 | 409; body: object };

/**
 * Add a post by hand. A lifecycle kind needs a project; posts about Novawerk itself (no project)
 * are for admins. The next free week, day or number goes to the new post. Unless told not to,
 * the promo agent is asked for a draft; told not to, the post starts empty and the agent leaves
 * it to the member.
 */
export async function addPost(
  { db, logger, triggerPromo }: Pick<AdminDeps, "db" | "logger" | "triggerPromo">,
  member: AdminMember,
  input: z.output<typeof postCreateInput>,
): Promise<AddResult> {
  const { projectId = null, kind } = input;
  if (!projectId && !isMaintainer(member)) {
    return { ok: false, status: 403, body: { error: "Only admins add posts about Novawerk itself" } };
  }
  if (projectId && !(await canSeeProject(db, member, projectId))) return { ok: false, status: 404, body: notFound };
  const facts = projectId ? (await lifecycleFacts(db, [projectId])).get(projectId) : null;
  if (projectId && !facts) return { ok: false, status: 404, body: notFound };

  const taken = (
    await db
      .select({ seq: posts.seq })
      .from(posts)
      .where(and(projectId ? eq(posts.projectId, projectId) : isNull(posts.projectId), eq(posts.kind, kind)))
  ).map((r) => r.seq);
  const draft = input.draft !== false;
  try {
    const [row] = await db
      .insert(posts)
      .values({
        projectId,
        kind,
        label: kind === "custom" ? (input.label ?? null) : null,
        seq: nextSeq(kind, taken, facts ?? null, today()),
        dueOn: input.dueOn ?? today(),
        ...(input.langs ? { langs: input.langs } : {}),
        ...(input.platforms !== undefined ? { platforms: input.platforms } : {}),
        ...(input.withCard !== undefined ? { withCard: input.withCard } : {}),
        // Empty content means "a person writes it": the promo agent's daily sweep leaves it alone.
        ...(draft ? { draftRequestedAt: new Date() } : { content: { zh: emptyPostCopy(), en: emptyPostCopy() } }),
      })
      .returning({ id: posts.id });
    const dispatched = draft ? await triggerPromoSafely(triggerPromo, { postId: row!.id }, logger) : false;
    return { ok: true, post: (await postViews(db, eq(posts.id, row!.id)))[0]!, dispatched };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const message = `This project already has a ${POST_KIND_INFO[kind].label.toLowerCase()} post`;
    return { ok: false, status: 409, body: conflict("kind", message) };
  }
}

/** The fields that change what goes out: an approved post needs another look after these. */
const REVIEWED = ["content", "langs", "images", "withCard", "photoUrl"] as const;

export function postRoutes(deps: AdminDeps) {
  const { db, logger, triggerPromo, env } = deps;
  const one = async (id: string) => (await postViews(db, eq(posts.id, id)))[0];

  /** Change a post if it is in one of `from`; else 404 or 409 with `refusal`. */
  async function transition(id: string, from: Post["status"][], set: Partial<typeof posts.$inferInsert>, refusal: string) {
    const [row] = await db
      .update(posts)
      .set(set)
      .where(and(eq(posts.id, id), inArray(posts.status, from)))
      .returning({ id: posts.id });
    if (row) return { ok: true as const, post: (await one(id))! };
    return { ok: false as const, status: (await one(id)) ? (409 as const) : (404 as const), error: refusal };
  }

  const inRepo = (post: Post) => ({ error: `This post lives in the repo (${post.sourcePath}). Change it there; the merge brings it here.` });

  return (
    new Hono<ApiEnv>()
      .get("/", zValidator("query", postFilter, rejectInvalid), async (c) => {
        const { status, projectId } = c.req.valid("query");
        const member = c.get("member");
        const mine = isMaintainer(member) ? undefined : await projectIdsOf(db, member.id);
        if (mine && mine.length === 0) return c.json([] as PostView[], 200);
        return c.json(
          await postViews(
            db,
            and(
              status ? eq(posts.status, status) : undefined,
              projectId ? eq(posts.projectId, projectId) : undefined,
              mine ? inArray(posts.projectId, mine) : undefined,
            ),
          ),
          200,
        );
      })

      .get("/board", async (c) => {
        const member = c.get("member");
        const only = isMaintainer(member) ? undefined : await projectIdsOf(db, member.id);
        return c.json({ today: today(), ...(await board(db, today(), only)) }, 200);
      })

      .post("/", zValidator("json", postCreateInput, rejectInvalid), async (c) => {
        const result = await addPost(deps, c.get("member"), c.req.valid("json"));
        if (!result.ok) return c.json(result.body, result.status);
        return c.json({ post: result.post, dispatched: result.dispatched }, 201);
      })

      .get("/:id", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const post = await one(c.req.valid("param").id);
        return post ? c.json(post, 200) : c.json(notFound, 404);
      })

      .patch(
        "/:id",
        zValidator("param", uuidParam, notFoundIfInvalid),
        zValidator("json", postUpdateInput, rejectInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const patch = c.req.valid("json");
          const current = await one(id);
          if (!current) return c.json(notFound, 404);
          if (current.sourcePath) return c.json(inRepo(current), 409);
          if (current.status === "published" || current.status === "skipped") {
            return c.json({ error: `This post is ${current.status}; restore it or leave it as it is` }, 409);
          }
          if (patch.label !== undefined && current.kind !== "custom") {
            return c.json(validationFailed({ label: ["Only custom posts have a name of their own"] }), 400);
          }
          if (patch.photoUrl) {
            const images = patch.images ?? current.images;
            const ok = pictureOf(current.project, patch.photoUrl) || images.some((i) => i.url === patch.photoUrl);
            if (!ok) {
              return c.json(validationFailed({ photoUrl: ["Pick the project's cover, one of its gallery pictures, or one of the post's"] }), 400);
            }
          }
          // Written text makes a planned post one to review; new words or pictures send an
          // approved post back to review.
          const review =
            (current.status === "planned" && patch.content) || (current.status === "approved" && REVIEWED.some((k) => patch[k] !== undefined))
              ? { status: "drafted" as const, approvedBy: null, approvedAt: null }
              : {};
          const result = await transition(
            id,
            ["planned", "drafted", "approved"],
            { ...patch, ...review },
            "This post was published or skipped meanwhile",
          );
          return result.ok ? c.json(result.post, 200) : c.json({ error: result.error }, result.status);
        },
      )

      .post("/:id/draft", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        const current = await one(id);
        if (current?.sourcePath) return c.json(inRepo(current), 409);
        const result = await transition(
          id,
          ["planned", "drafted", "approved"],
          { draftRequestedAt: new Date(), draftError: null },
          "A published or skipped post isn't drafted again",
        );
        if (!result.ok) return c.json({ error: result.error }, result.status);
        const dispatched = await triggerPromoSafely(triggerPromo, { postId: id }, logger);
        return c.json({ post: result.post, dispatched }, 200);
      })

      .post("/:id/approve", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        const current = await one(id);
        if (!current) return c.json(notFound, 404);
        if (!current.content) return c.json({ error: "There is nothing to approve yet" }, 409);
        if (current.draftRequestedAt) return c.json({ error: "A new draft is on its way; approve that one" }, 409);
        const empty = emptyLangs(current.content, current.langs);
        if (empty.length) {
          return c.json(validationFailed({ content: [`Write the ${empty.map((l) => (l === "zh" ? "Chinese" : "English")).join(" and ")} version first`] }), 400);
        }
        const gaps = placeholdersIn(current.content, current.langs);
        if (gaps.length) {
          return c.json(validationFailed({ content: [`Fill these in first: ${gaps.join(", ")}`] }), 400);
        }
        const links = xiaohongshuLinks(current, current.content);
        if (links.length) {
          return c.json(validationFailed({ content: [`Xiaohongshu throttles notes with a link; take these out of the Chinese version: ${links.join(", ")}`] }), 400);
        }
        const result = await transition(
          id,
          ["drafted", "approved"],
          { status: "approved", approvedBy: c.get("member").id, approvedAt: new Date() },
          "Only a drafted post can be approved",
        );
        return result.ok ? c.json(result.post, 200) : c.json({ error: result.error }, result.status);
      })

      .post("/:id/skip", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const result = await transition(
          c.req.valid("param").id,
          ["planned", "drafted", "approved"],
          { status: "skipped", draftRequestedAt: null },
          "A published post can't be skipped",
        );
        return result.ok ? c.json(result.post, 200) : c.json({ error: result.error }, result.status);
      })

      .post("/:id/restore", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        const current = await one(id);
        if (!current) return c.json(notFound, 404);
        // A repo post was approved by its pull request; it comes back as it was.
        const back = current.sourcePath && current.approvedAt ? "approved" : current.content ? "drafted" : "planned";
        const result = await transition(
          id,
          ["skipped"],
          back === "approved" ? { status: back } : { status: back, approvedBy: null, approvedAt: null },
          "Only a skipped post can be restored",
        );
        return result.ok ? c.json(result.post, 200) : c.json({ error: result.error }, result.status);
      })

      .post("/:id/publish", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const result = await transition(
          c.req.valid("param").id,
          ["approved"],
          { status: "published", publishedAt: new Date() },
          "Approve the post before you mark it posted",
        );
        return result.ok ? c.json(result.post, 200) : c.json({ error: result.error }, result.status);
      })

      .post("/:id/unpublish", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const result = await transition(
          c.req.valid("param").id,
          ["published"],
          { status: "approved", publishedAt: null },
          "Only a published post can be taken back",
        );
        return result.ok ? c.json(result.post, 200) : c.json({ error: result.error }, result.status);
      })

      .post("/:id/export-link", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
        const { id } = c.req.valid("param");
        if (!(await one(id))) return c.json(notFound, 404);
        const link = exportLink(env.sessionSecret, new URL(c.req.url).origin, id);
        return c.json({ ...link, command: `pnpm post pull "${link.url}"` }, 200);
      })
  );
}

/** True when `url` is the project's cover or in its gallery. */
export function pictureOf(project: Pick<PostProject, "coverUrl" | "gallery"> | null, url: string): boolean {
  return Boolean(project) && (project!.coverUrl === url || project!.gallery.some((g) => g.url === url));
}
