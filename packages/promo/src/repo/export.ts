// A post from the database as a repo folder: `pnpm post pull` and the admin panel's
// "Continue in the repo" download. The folder keeps the post's id, so the next sync updates
// that post instead of making a new one.

import { basename, extname, posix } from "node:path";

import { eq } from "drizzle-orm";

import { emptyPostCopy, type PostContentInput, type PostKind, type PostLang, type PostPlatform } from "@nw/contracts";
import { posts, projects, type Database, type Post, type PostImage } from "@nw/db";

import { IMAGE_TYPES, POSTS_DIR, folderName, kebab, postFiles, safeFileName } from "./format.js";

export interface ExportablePost {
  id: string;
  kind: PostKind;
  seq: number;
  label: string | null;
  dueOn: string;
  langs: PostLang[];
  platforms: string[] | null;
  withCard: boolean;
  images: PostImage[];
  photoUrl: string | null;
  content: PostContentInput | null;
  sourcePath: string | null;
}

export interface ExportedFolder {
  /** "posts/2026-10-12-open-day" */
  dir: string;
  /** Text files by name. */
  files: Record<string, string>;
  /** Pictures to fetch into the folder. */
  downloads: { file: string; url: string }[];
}

/** "https://…/abc123-poster.png?x" → "02-poster.png" */
function pictureFile(url: string, index: number): string {
  let name = "picture";
  try {
    name = basename(new URL(url).pathname) || name;
  } catch {
    // Not a URL we can read a name from; "picture" it is.
  }
  const ext = IMAGE_TYPES[extname(name).toLowerCase()] ? extname(name).toLowerCase() : ".png";
  const stem = safeFileName(basename(name, extname(name))).replace(/\.[a-z0-9]*$/, "").replace(/^[0-9a-f]{16}-/, "");
  return `${String(index + 1).padStart(2, "0")}-${stem || "picture"}${ext}`;
}

export function exportFolder(post: ExportablePost, projectSlug: string | null): ExportedFolder {
  const dir = post.sourcePath ?? posix.join(POSTS_DIR, folderName(post.dueOn, projectSlug, post.label ?? kebab(post.kind)));
  const downloads = post.images.map((img, i) => ({ file: pictureFile(img.url, i), url: img.url }));
  const fileOf = new Map(downloads.map((d) => [d.url, d.file]));
  const content = post.content ?? { zh: emptyPostCopy(), en: emptyPostCopy() };
  const files = postFiles(
    {
      id: post.id,
      project: projectSlug,
      kind: post.kind,
      label: post.label,
      seq: post.seq,
      dueOn: post.dueOn,
      platforms: post.platforms as PostPlatform[] | null,
      withCard: post.withCard,
      photo: post.photoUrl ? (fileOf.get(post.photoUrl) ?? post.photoUrl) : null,
      images: post.images.map((img, i) => ({
        file: downloads[i]!.file,
        ...(img.alt ? { alt: img.alt } : {}),
        ...(img.lang ? { lang: img.lang } : {}),
      })),
    },
    content,
    post.langs,
  );
  return { dir, files, downloads };
}

/** A post and its project's slug, for an export. */
export async function postForExport(db: Database, id: string): Promise<{ post: Post; projectSlug: string | null } | null> {
  const [row] = await db
    .select({ post: posts, slug: projects.slug })
    .from(posts)
    .leftJoin(projects, eq(projects.id, posts.projectId))
    .where(eq(posts.id, id))
    .limit(1);
  return row ? { post: row.post, projectSlug: row.slug } : null;
}
