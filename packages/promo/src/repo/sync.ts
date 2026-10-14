// Repo posts into the database: what `pnpm post sync` does after a merge to main.
//
// The folder is the source. A post is matched by the `id` in post.yml (a folder exported from
// the admin panel), then by its folder, then (lifecycle posts) by project, kind and week/day, so
// a launch post written in the repo takes over the one the schedule planned. It is rewritten only
// when its files changed (the folder hash), and lands approved: the pull request was the review.
// `draft: true` lands it "to review" instead. A post already posted keeps its text. A folder
// that is gone skips its post.
//
// Pictures go to the public file store under posts/<folder>/, named by their content, so the
// same picture is uploaded once.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { and, eq, inArray, isNotNull, isNull, max, notInArray } from "drizzle-orm";

import { postLabel } from "@nw/contracts";
import { posts, projects, type Database, type Post, type PostImage } from "@nw/db";

import { IMAGE_TYPES, listPostDirs, loadRepoPosts, safeFileName, type Issue, type RepoPicture, type RepoPost } from "./format.js";

/** Where the pictures go. Same bytes, same place: putting them again changes nothing. */
export interface PostFileStore {
  /** The public URL of `bytes` stored at `pathname`. */
  put(pathname: string, bytes: Buffer, contentType: string): Promise<string>;
}

export interface SyncOptions {
  db: Database;
  /** The repo root. */
  root: string;
  /** Null: posts with picture files fail (no store to put them in). */
  files: PostFileStore | null;
  /** The commit this run comes from (GITHUB_SHA). */
  commit?: string | null;
  now?: Date;
  log?: (message: string) => void;
  /** Only these folders. Posts whose folder is gone are left alone. */
  only?: string[];
  /** Read and report, write nothing. */
  dryRun?: boolean;
}

export interface SyncOutcome {
  dir: string;
  result: "created" | "updated" | "unchanged" | "kept" | "skipped" | "failed";
  postId?: string;
  label?: string;
  reason?: string;
  issues?: Issue[];
}

const CLOSED = ["published", "skipped"] as const;

/** posts/<folder>/<content hash>-<name>: one place per picture. */
export function picturePath(dir: string, file: string, bytes: Buffer): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  return `${dir}/${hash}-${safeFileName(basename(file))}`;
}

class SyncError extends Error {}

/** The post this folder writes, if there is one already. */
async function existingFor(db: Database, root: string, post: RepoPost, projectId: string | null): Promise<Post | undefined> {
  if (post.id) {
    const [byId] = await db.select().from(posts).where(eq(posts.id, post.id)).limit(1);
    if (!byId) throw new SyncError(`id: there is no post ${post.id}`);
    // A renamed folder takes its post along; two folders can't write the same one.
    if (byId.sourcePath && byId.sourcePath !== post.dir && existsSync(join(root, byId.sourcePath))) {
      throw new SyncError(`id: post ${post.id} is written by ${byId.sourcePath}`);
    }
    return byId;
  }
  const [byDir] = await db.select().from(posts).where(eq(posts.sourcePath, post.dir)).limit(1);
  if (byDir) return byDir;
  if (post.kind === "custom" || !projectId || post.seq === null) return undefined;
  const [planned] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.projectId, projectId), eq(posts.kind, post.kind), eq(posts.seq, post.seq)))
    .limit(1);
  if (planned?.sourcePath) {
    throw new SyncError(`${planned.sourcePath} already writes this project's ${postLabel(post.kind, post.seq).toLowerCase()} post`);
  }
  return planned;
}

/** The next number for a custom post (per project, or among the posts without one). */
async function nextCustomSeq(db: Database, projectId: string | null): Promise<number> {
  const [row] = await db
    .select({ seq: max(posts.seq) })
    .from(posts)
    .where(and(projectId ? eq(posts.projectId, projectId) : isNull(posts.projectId), eq(posts.kind, "custom")));
  return (row?.seq ?? 0) + 1;
}

export async function syncRepoPosts(opts: SyncOptions): Promise<SyncOutcome[]> {
  const { db, root } = opts;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const dirs = opts.only ?? (await listPostDirs(root));
  const loaded = await loadRepoPosts(root, dirs);

  const slugs = [...new Set(loaded.flatMap((l) => (l.post?.project ? [l.post.project] : [])))];
  const projectIds = new Map(
    slugs.length
      ? (await db.select({ id: projects.id, slug: projects.slug }).from(projects).where(inArray(projects.slug, slugs))).map((p) => [
          p.slug,
          p.id,
        ])
      : [],
  );

  const outcomes: SyncOutcome[] = [];
  for (const { dir, post, issues } of loaded) {
    if (!post) {
      outcomes.push({ dir, result: "failed", reason: "the folder has errors (pnpm post check)", issues });
      continue;
    }
    const label = postLabel(post.kind, post.seq ?? 0, post.label);
    try {
      const projectId = post.project ? projectIds.get(post.project) : null;
      if (projectId === undefined) throw new SyncError(`project: there is no project with the slug ${post.project}`);

      const existing = await existingFor(db, root, post, projectId);
      if (existing && existing.sourcePath === post.dir && existing.sourceHash === post.hash) {
        outcomes.push({ dir, result: "unchanged", postId: existing.id, label });
        continue;
      }
      if (existing?.status === "published") {
        // Already out there: the record keeps what was posted. Note the folder so this is said once.
        if (!opts.dryRun) {
          await db
            .update(posts)
            .set({ sourcePath: post.dir, sourceHash: post.hash, sourceCommit: opts.commit ?? null })
            .where(eq(posts.id, existing.id));
        }
        outcomes.push({ dir, result: "kept", postId: existing.id, label, reason: "it is already posted; its text stays as it went out" });
        continue;
      }

      const pictures = await uploadPictures(opts, post);
      const values = {
        projectId,
        kind: post.kind,
        label: post.label,
        dueOn: post.dueOn,
        langs: post.langs,
        platforms: post.platforms,
        withCard: post.withCard,
        images: pictures.images,
        photoUrl: pictures.photo,
        content: post.content,
        status: post.draft ? ("drafted" as const) : ("approved" as const),
        draftedAt: now,
        draftRequestedAt: null,
        draftError: null,
        approvedBy: null,
        approvedAt: post.draft ? null : now,
        sourcePath: post.dir,
        sourceHash: post.hash,
        sourceCommit: opts.commit ?? null,
      };

      if (opts.dryRun) {
        outcomes.push({ dir, result: existing ? "updated" : "created", postId: existing?.id, label, reason: "dry run: nothing written" });
        continue;
      }
      if (existing) {
        await db
          .update(posts)
          .set({ ...values, seq: post.seq ?? existing.seq })
          .where(eq(posts.id, existing.id));
        outcomes.push({ dir, result: "updated", postId: existing.id, label });
      } else {
        const seq = post.seq ?? (await nextCustomSeq(db, projectId));
        const [row] = await db
          .insert(posts)
          .values({ ...values, seq })
          .returning({ id: posts.id });
        outcomes.push({ dir, result: "created", postId: row!.id, label });
      }
      log(`${dir}: ${outcomes.at(-1)!.result} (${label}, ${values.status})`);
    } catch (err) {
      if (!(err instanceof SyncError)) throw err;
      outcomes.push({ dir, result: "failed", label, reason: err.message });
    }
  }

  // Folders that are gone: their posts are skipped (a member can restore one).
  if (!opts.only) {
    const gone = await db
      .select({ id: posts.id, sourcePath: posts.sourcePath, kind: posts.kind, seq: posts.seq, label: posts.label })
      .from(posts)
      .where(
        and(
          isNotNull(posts.sourcePath),
          dirs.length ? notInArray(posts.sourcePath, dirs) : undefined,
          notInArray(posts.status, [...CLOSED]),
        ),
      );
    for (const row of gone) {
      if (!opts.dryRun) await db.update(posts).set({ status: "skipped", draftRequestedAt: null }).where(eq(posts.id, row.id));
      outcomes.push({
        dir: row.sourcePath!,
        result: "skipped",
        postId: row.id,
        label: postLabel(row.kind, row.seq, row.label),
        reason: "its folder is gone",
      });
    }
  }
  return outcomes;
}

async function uploadPictures(opts: SyncOptions, post: RepoPost): Promise<{ images: PostImage[]; photo: string | null }> {
  const cache = new Map<string, string>();
  const urlOf = async (picture: RepoPicture): Promise<string> => {
    if (picture.url !== undefined) return picture.url;
    const file = picture.file;
    const known = cache.get(file);
    if (known) return known;
    if (opts.dryRun) return `(dry run) ${post.dir}/${file}`;
    if (!opts.files) throw new SyncError(`${file}: no file store to put pictures in (set BLOB_PUBLIC_READ_WRITE_TOKEN)`);
    const bytes = await readFile(join(opts.root, post.dir, file));
    const url = await opts.files.put(picturePath(post.dir, file, bytes), bytes, IMAGE_TYPES[extname(file).toLowerCase()]!);
    cache.set(file, url);
    return url;
  };
  const images: PostImage[] = [];
  for (const img of post.images) {
    images.push({ url: await urlOf(img), ...(img.alt ? { alt: img.alt } : {}), ...(img.lang ? { lang: img.lang } : {}) });
  }
  return { images, photo: post.photo ? await urlOf(post.photo) : null };
}

/** One line per outcome, for the log. */
export function describeOutcome(o: SyncOutcome): string {
  const what = o.label ? ` ${o.label}` : "";
  const why = o.reason ? `: ${o.reason}` : "";
  const lines = [`${o.result.padEnd(9)} ${o.dir}${what}${why}`];
  for (const i of o.issues ?? []) if (i.level === "error") lines.push(`          ${i.file ? `${i.file}: ` : ""}${i.message}`);
  return lines.join("\n");
}
