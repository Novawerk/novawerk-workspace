// A post written in the repo: one folder under posts/ (posts/README.md is the guide).
//
//   posts/2026-10-12-open-day/
//     post.yml     what it is: project, kind, name, date, platforms, card, pictures
//     zh.md        the Chinese version: frontmatter (title, card) and the text
//     en.md        the English version; leave either file out for a one-language post
//     01.png …     its own pictures, in the order post.yml lists them
//
// This file reads a folder into a post (with everything wrong with it, as issues) and writes a
// post back into files. It doesn't touch the database; ./sync.ts does.

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, posix } from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import {
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  POST_KINDS,
  POST_KIND_INFO,
  POST_LANGS,
  POST_PLATFORMS,
  POST_PLATFORM_INFO,
  emptyPostCopy,
  isLifecycleKind,
  placeholdersIn,
  xiaohongshuLinks,
  postContent,
  postPlatforms,
  type PostCardInput,
  type PostContentInput,
  type PostCopyInput,
  type PostKind,
  type PostLang,
  type PostPlatform,
} from "@nw/contracts";

/** Where repo posts live, from the repo root. */
export const POSTS_DIR = "posts";
export const META_FILE = "post.yml";
/** Rendered cards for a local look (`pnpm post render`). Ignored by git and by the sync. */
export const RENDER_DIR = ".render";

/** Picture files a post may carry, by extension. */
export const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};
/** The card renderer draws these; WebP and AVIF can be the post's pictures but not the card's photo. */
export const CARD_PHOTO_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif"];

export interface Issue {
  level: "error" | "warning";
  /** The file it is about, inside the folder. */
  file?: string;
  message: string;
}

/** A picture of the post: a file in its folder, or a link that is already public. */
export type RepoPicture = { file: string; url?: undefined } | { url: string; file?: undefined };

export type RepoImage = RepoPicture & { alt?: string; lang?: PostLang };

export interface RepoPost {
  /** The folder, from the repo root, with forward slashes: "posts/2026-10-12-open-day". */
  dir: string;
  /** Set when the folder was exported from the admin panel: it updates that post. */
  id: string | null;
  /** The project's slug; null for a post about Novawerk itself. */
  project: string | null;
  kind: PostKind;
  /** A custom post's name. */
  label: string | null;
  /** Progress: the week. Retro: the day. Null: worked out on sync. */
  seq: number | null;
  dueOn: string;
  langs: PostLang[];
  /** Null: the kind's usual platforms. */
  platforms: PostPlatform[] | null;
  withCard: boolean;
  photo: RepoPicture | null;
  images: RepoImage[];
  /** Lands "to review" instead of approved. */
  draft: boolean;
  content: PostContentInput;
  /** Of every file in the folder: the sync rewrites the post only when it changes. */
  hash: string;
}

export interface LoadedPost {
  dir: string;
  /** Null when the folder has errors that leave no post to speak of. */
  post: RepoPost | null;
  issues: Issue[];
}

// ─── The files' shapes ───────────────────────────────────────────────────────

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use the project's slug, e.g. berlin-food-map");
const isoDate = z.iso.date({ error: "Use a date like 2026-10-12" });
const fileName = z
  .string()
  .trim()
  .min(1)
  .refine((f) => !f.includes("/") && !f.includes("\\") && !f.startsWith("."), "Name a file in this folder");
const httpsUrl = z.url({ protocol: /^https$/, error: "Use an https:// link" });

const imageEntry = z.union([
  z.string().trim().min(1),
  z.strictObject({
    file: fileName.optional(),
    url: httpsUrl.optional(),
    alt: z.string().trim().max(300).optional(),
    lang: z.enum(POST_LANGS).optional(),
  }),
]);

/** post.yml. Unknown keys are errors, so a typo doesn't pass silently. */
const metaSchema = z.strictObject({
  id: z.guid().optional(),
  project: slug.nullable().optional(),
  kind: z.enum(POST_KINDS).default("custom"),
  name: z.string().trim().min(1).max(80, "Keep the name under 80 characters").optional(),
  week: z.number().int().min(1).max(520).optional(),
  day: z.number().int().min(1).max(3650).optional(),
  date: isoDate,
  platforms: z.array(z.enum(POST_PLATFORMS)).min(1, "Name at least one platform, or leave the key out").optional(),
  card: z.boolean().default(true),
  photo: z.string().trim().min(1).optional(),
  images: z.array(imageEntry).max(MAX_POST_IMAGES, `Up to ${MAX_POST_IMAGES} pictures`).default([]),
  draft: z.boolean().default(false),
});

const text = z.string().default("");
const statEntry = z.union([
  z.string(),
  z.strictObject({ value: z.union([z.string(), z.number()]), label: z.string().default("") }),
]);

/** The frontmatter of zh.md / en.md. */
const copySchema = z.strictObject({
  title: z.union([z.string(), z.number()]).default(""),
  card: z
    .strictObject({
      eyebrow: text,
      headline: text,
      lede: text,
      points: z.array(z.union([z.string(), z.number()])).default([]),
      quote: z.union([z.string(), z.strictObject({ text, by: text })]).optional(),
      by: z.string().optional(),
      stats: z.array(statEntry).default([]),
      footer: text,
    })
    .default({ eyebrow: "", headline: "", lede: "", points: [], stats: [], footer: "" }),
});

// ─── Reading ─────────────────────────────────────────────────────────────────

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Split "---\nyaml\n---\ntext" into its parts. No frontmatter: all of it is the text. */
export function splitFrontmatter(source: string): { data: string | null; body: string } {
  const m = source.replace(/^﻿/, "").match(FRONTMATTER);
  if (!m) return { data: null, body: source };
  return { data: m[1]!, body: source.slice(m[0].length) };
}

const zodIssues = (error: z.ZodError, file: string): Issue[] =>
  error.issues.map((i) => ({
    level: "error" as const,
    file,
    message: `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`,
  }));

function yamlOf(source: string, file: string, issues: Issue[]): unknown {
  try {
    return parseYaml(source) ?? {};
  } catch (err) {
    issues.push({ level: "error", file, message: `Not valid YAML: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` });
    return undefined;
  }
}

/** A language file into one version of the post. */
export function parseCopy(source: string, file: string, issues: Issue[]): PostCopyInput | null {
  const { data, body } = splitFrontmatter(source);
  const raw = data === null ? {} : yamlOf(data, file, issues);
  if (raw === undefined) return null;
  const parsed = copySchema.safeParse(raw);
  if (!parsed.success) {
    issues.push(...zodIssues(parsed.error, file));
    return null;
  }
  const c = parsed.data.card;
  const quote =
    typeof c.quote === "string" ? { text: c.quote, by: c.by ?? "" } : { text: c.quote?.text ?? "", by: c.quote?.by ?? c.by ?? "" };
  const card: PostCardInput = {
    eyebrow: c.eyebrow.trim(),
    headline: c.headline.trim(),
    lede: c.lede.trim(),
    points: c.points.map((p) => String(p).trim()).filter(Boolean),
    quote: { text: quote.text.trim(), by: quote.by.trim() },
    stats: c.stats
      .map((s) => {
        if (typeof s !== "string") return { value: String(s.value).trim(), label: s.label.trim() };
        const bar = s.indexOf("|");
        return bar === -1 ? { value: s.trim(), label: "" } : { value: s.slice(0, bar).trim(), label: s.slice(bar + 1).trim() };
      })
      .filter((s) => s.value),
    footer: c.footer.trim(),
  };
  return { title: String(parsed.data.title).trim(), body: body.trim(), card };
}

/** Every file in the folder that belongs to the post (not dotfiles, not .render/). */
async function folderFiles(abs: string): Promise<string[]> {
  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/** sha256 of the folder's files, names and bytes. */
export async function hashFolder(abs: string, files?: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const name of files ?? (await folderFiles(abs))) {
    hash.update(name).update("\0").update(await readFile(join(abs, name))).update("\0");
  }
  return hash.digest("hex");
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/**
 * Read one folder. `dir` is relative to `root` ("posts/2026-10-12-open-day"). Never throws for
 * a bad post: everything wrong with it comes back as issues.
 */
export async function loadRepoPost(root: string, dir: string): Promise<LoadedPost> {
  const issues: Issue[] = [];
  const abs = join(root, dir);
  const relDir = dir.split(/[\\/]+/).join("/");
  const files = await folderFiles(abs);

  if (!files.includes(META_FILE)) {
    return { dir: relDir, post: null, issues: [{ level: "error", file: META_FILE, message: "Missing: every post folder needs a post.yml" }] };
  }
  const rawMeta = yamlOf(await readFile(join(abs, META_FILE), "utf8"), META_FILE, issues);
  const meta = rawMeta === undefined ? null : metaSchema.safeParse(rawMeta);
  if (meta && !meta.success) issues.push(...zodIssues(meta.error, META_FILE));
  const m = meta?.success ? meta.data : null;

  // The language versions.
  const content: PostContentInput = { zh: emptyPostCopy(), en: emptyPostCopy() };
  const langs: PostLang[] = [];
  for (const lang of POST_LANGS) {
    const file = `${lang}.md`;
    if (!files.includes(file)) continue;
    const copy = parseCopy(await readFile(join(abs, file), "utf8"), file, issues);
    if (!copy) continue;
    content[lang] = copy;
    langs.push(lang);
    if (!copy.title && !copy.body) issues.push({ level: "error", file, message: "Write a title or a text, or delete the file" });
  }
  if (!files.includes("zh.md") && !files.includes("en.md")) {
    issues.push({ level: "error", message: "Add zh.md, en.md or both: the post's language versions" });
  }
  const checked = postContent.safeParse(content);
  if (!checked.success) {
    for (const i of checked.error.issues) {
      issues.push({ level: "error", file: `${String(i.path[0])}.md`, message: `${i.path.slice(1).join(".")}: ${i.message}` });
    }
  }

  if (!m) return { dir: relDir, post: null, issues };

  // What it is.
  if (isLifecycleKind(m.kind) && !m.project) {
    issues.push({ level: "error", file: META_FILE, message: `project: a ${POST_KIND_INFO[m.kind].label.toLowerCase()} post belongs to a project` });
  }
  if (m.kind === "custom" && !m.name) {
    issues.push({ level: "error", file: META_FILE, message: "name: a custom post needs a name, e.g. name: Open day" });
  }
  if (m.week !== undefined && m.kind !== "progress") issues.push({ level: "error", file: META_FILE, message: "week: only progress posts have one" });
  if (m.day !== undefined && m.kind !== "retro") issues.push({ level: "error", file: META_FILE, message: "day: only retrospectives have one" });
  if (m.kind === "progress" && m.week === undefined) issues.push({ level: "error", file: META_FILE, message: "week: which week of building, e.g. week: 4" });
  if (m.kind === "retro" && m.day === undefined) issues.push({ level: "error", file: META_FILE, message: "day: how many days after launch, e.g. day: 30" });

  // Pictures.
  const picture = (entry: string, where: string): RepoPicture | null => {
    if (isUrl(entry)) {
      if (!entry.startsWith("https://")) {
        issues.push({ level: "error", file: META_FILE, message: `${where}: use an https:// link` });
        return null;
      }
      return { url: entry };
    }
    if (!files.includes(entry)) {
      issues.push({ level: "error", file: META_FILE, message: `${where}: there is no file ${entry} in this folder` });
      return null;
    }
    if (!IMAGE_TYPES[extname(entry).toLowerCase()]) {
      issues.push({ level: "error", file: entry, message: "Use a PNG, JPEG, GIF, WebP or AVIF picture" });
      return null;
    }
    return { file: entry };
  };
  const images: RepoImage[] = [];
  m.images.forEach((entry, i) => {
    const where = `images[${i}]`;
    if (typeof entry === "string") {
      const p = picture(entry, where);
      if (p) images.push(p);
      return;
    }
    if (Boolean(entry.file) === Boolean(entry.url)) {
      issues.push({ level: "error", file: META_FILE, message: `${where}: give either file or url` });
      return;
    }
    const p = picture((entry.file ?? entry.url)!, where);
    if (!p) return;
    if (entry.lang && !langs.includes(entry.lang)) {
      issues.push({ level: "warning", file: META_FILE, message: `${where}: lang ${entry.lang}, but the post has no ${entry.lang}.md` });
    }
    images.push({ ...p, ...(entry.alt ? { alt: entry.alt } : {}), ...(entry.lang ? { lang: entry.lang } : {}) });
  });
  const photo = m.photo ? picture(m.photo, "photo") : null;
  if (photo?.file && !CARD_PHOTO_EXTENSIONS.includes(extname(photo.file).toLowerCase())) {
    issues.push({ level: "error", file: META_FILE, message: "photo: the card takes a PNG, JPEG or GIF photo" });
  }
  if (photo && !m.card) issues.push({ level: "warning", file: META_FILE, message: "photo: there is no card (card: false), so it isn't shown" });

  for (const file of new Set([...images, ...(photo ? [photo] : [])].flatMap((p) => (p.file ? [p.file] : [])))) {
    const size = (await stat(join(abs, file))).size;
    if (size > MAX_IMAGE_BYTES) issues.push({ level: "error", file, message: "Pictures can be up to 10 MB" });
  }
  const used = new Set([META_FILE, "zh.md", "en.md", "README.md", ...images.flatMap((p) => (p.file ? [p.file] : [])), ...(photo?.file ? [photo.file] : [])]);
  for (const file of files) {
    if (!used.has(file)) issues.push({ level: "warning", file, message: "Not used by the post: list it under images, or remove it" });
  }

  if (!m.card && images.length === 0) {
    // A text-only post is fine (Discord, the newsletter), but say so: Xiaohongshu needs a picture.
    const platforms = postPlatforms({ kind: m.kind, platforms: m.platforms ?? null, langs });
    if (platforms.includes("xiaohongshu")) {
      issues.push({ level: "warning", file: META_FILE, message: "No card and no pictures: Xiaohongshu needs at least one picture" });
    }
  }

  // Ready to go out?
  const gaps = placeholdersIn(content, langs);
  if (gaps.length && !m.draft) {
    issues.push({
      level: "error",
      message: `Fill these in first, or set draft: true to review it in the admin panel: ${gaps.join(", ")}`,
    });
  }
  const links = xiaohongshuLinks({ kind: m.kind, platforms: m.platforms ?? null, langs }, content);
  if (links.length) {
    issues.push({
      level: m.draft ? "warning" : "error",
      file: "zh.md",
      message: `Xiaohongshu throttles notes with a link (videos/BRAND.md): take these out of the Chinese version: ${links.join(", ")}`,
    });
  }
  for (const lang of langs) {
    const copy = content[lang];
    for (const platform of postPlatforms({ kind: m.kind, platforms: m.platforms ?? null, langs: [lang] })) {
      const info = POST_PLATFORM_INFO[platform];
      if (info.titleLimit && [...copy.title].length > info.titleLimit) {
        issues.push({ level: "warning", file: `${lang}.md`, message: `title: ${info.label} cuts titles at ${info.titleLimit} characters` });
      }
      if ([...copy.body].length > info.bodyLimit) {
        issues.push({ level: "warning", file: `${lang}.md`, message: `The text is over ${info.label}'s ${info.bodyLimit} characters` });
      }
    }
  }
  if (m.platforms) {
    const unread = m.platforms.filter((p) => !POST_PLATFORM_INFO[p].langs.some((l) => langs.includes(l)));
    if (unread.length && langs.length) {
      issues.push({
        level: "warning",
        file: META_FILE,
        message: `platforms: ${unread.map((p) => POST_PLATFORM_INFO[p].label).join(", ")} reads ${unread.map((p) => POST_PLATFORM_INFO[p].langs.join("/")).join(", ")}, which this post doesn't have`,
      });
    }
  }

  if (issues.some((i) => i.level === "error")) return { dir: relDir, post: null, issues };

  return {
    dir: relDir,
    issues,
    post: {
      dir: relDir,
      id: m.id ?? null,
      project: m.project ?? null,
      kind: m.kind,
      label: m.kind === "custom" ? m.name! : (m.name ?? null),
      seq: m.kind === "progress" ? m.week! : m.kind === "retro" ? m.day! : m.kind === "custom" ? null : 0,
      dueOn: m.date,
      langs,
      platforms: m.platforms ? POST_PLATFORMS.filter((p) => m.platforms!.includes(p)) : null,
      withCard: m.card,
      photo,
      images,
      draft: m.draft,
      content,
      hash: await hashFolder(abs, files),
    },
  };
}

/** The post folders under posts/ (each with a post.yml, or meant to have one). Sorted. */
export async function listPostDirs(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(root, POSTS_DIR), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("_"))
    .map((e) => posix.join(POSTS_DIR, e.name))
    .sort();
}

/** Every post folder, read. */
export async function loadRepoPosts(root: string, dirs?: string[]): Promise<LoadedPost[]> {
  const list = dirs ?? (await listPostDirs(root));
  return Promise.all(list.map((dir) => loadRepoPost(root, dir)));
}

// ─── Writing ─────────────────────────────────────────────────────────────────

const yaml = (value: unknown) => stringifyYaml(value, { lineWidth: 0 }).trimEnd();

/** One language file: its title and card as frontmatter, then the text. */
export function copyFile(copy: PostCopyInput): string {
  const card = copy.card;
  const front: Record<string, unknown> = {
    title: copy.title,
    card: {
      eyebrow: card.eyebrow,
      headline: card.headline,
      lede: card.lede,
      points: card.points,
      quote: { text: card.quote.text, by: card.quote.by },
      stats: card.stats.map((s) => (s.label ? `${s.value} | ${s.label}` : s.value)),
      footer: card.footer,
    },
  };
  return `---\n${yaml(front)}\n---\n\n${copy.body.trim()}\n`;
}

export interface PostFileSpec {
  id?: string | null;
  project: string | null;
  kind: PostKind;
  label?: string | null;
  seq?: number | null;
  dueOn: string;
  platforms?: readonly PostPlatform[] | null;
  withCard?: boolean;
  /** A file name in the folder, or a link. */
  photo?: string | null;
  images?: { file?: string; url?: string; alt?: string; lang?: PostLang }[];
  draft?: boolean;
}

/** post.yml, with a line on where the format is explained. */
export function metaFile(spec: PostFileSpec): string {
  const data: Record<string, unknown> = {};
  if (spec.id) data.id = spec.id;
  if (spec.project) data.project = spec.project;
  data.kind = spec.kind;
  if (spec.label) data.name = spec.label;
  if (spec.kind === "progress" && spec.seq) data.week = spec.seq;
  if (spec.kind === "retro" && spec.seq) data.day = spec.seq;
  data.date = spec.dueOn;
  if (spec.platforms) data.platforms = [...spec.platforms];
  data.card = spec.withCard ?? true;
  if (spec.photo) data.photo = spec.photo;
  if (spec.images?.length) {
    data.images = spec.images.map((img) => {
      const where = img.file ? { file: img.file } : { url: img.url };
      return img.alt || img.lang ? { ...where, ...(img.alt ? { alt: img.alt } : {}), ...(img.lang ? { lang: img.lang } : {}) } : (img.file ?? img.url);
    });
  }
  if (spec.draft) data.draft = true;
  return `# A Novawerk post. The format: posts/README.md. Check it with pnpm post check.\n${yaml(data)}\n`;
}

/** The files of a post folder (text only; pictures are the caller's to copy). */
export function postFiles(spec: PostFileSpec, content: PostContentInput, langs: readonly PostLang[]): Record<string, string> {
  const out: Record<string, string> = { [META_FILE]: metaFile(spec) };
  for (const lang of langs) out[`${lang}.md`] = copyFile(content[lang]);
  return out;
}

/** "Open Day, Kreuzberg!" → "open-day-kreuzberg". Empty when nothing Latin is left. */
export function kebab(text: string, max = 50): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
}

/** "Poster (final).PNG" → "poster-final.png". */
export function safeFileName(file: string): string {
  const ext = extname(file).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `${kebab(basename(file, extname(file)), 60) || "picture"}${ext}`;
}

/** "2026-10-12-open-day": the date, then the project or the name, as a folder name. */
export function folderName(dueOn: string, ...words: (string | null | undefined)[]): string {
  const tail = kebab(words.filter(Boolean).join(" "));
  return tail ? `${dueOn}-${tail}` : dueOn;
}
