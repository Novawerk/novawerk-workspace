#!/usr/bin/env tsx
// pnpm post — write posts in the repo (posts/, see posts/README.md) and sync them.
//
//   pnpm post new [--project <slug>] [--kind <kind>] [--name "<name>"] [--date <YYYY-MM-DD>] [--langs zh,en]
//                 [--week <n> | --day <n>] [--platforms xiaohongshu,linkedin,…] [--no-card]
//                                                starts from the kind's template (its fields as gaps)
//   pnpm post check [<folder>…]                  every folder, or the ones named; exit 1 on errors
//   pnpm post render <folder> [--lang zh|en] [--format portrait|square|link|wide|all]
//                                                the template card as PNG, in <folder>/.render/
//   pnpm post list
//   pnpm post sync [<folder>…] [--dry-run] [--local]
//                                                into the database: DATABASE_URL and
//                                                BLOB_PUBLIC_READ_WRITE_TOKEN from the shell (the
//                                                deploy workflow), or --local: apps/api/.env and
//                                                pictures served by the local API
//   pnpm post pull "<link>" [--force]           a post from the admin panel ("Continue in the repo")
//   pnpm post pull <post-id> [--local] [--force]  the same, straight from the database
//
// The text and the card are written by people and by Claude Code (the nw-posts skill); pictures
// can come from anywhere. After a merge to main the deploy workflow runs `pnpm post sync`.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  CARD_FORMAT_NAMES,
  POST_KINDS,
  POST_KIND_INFO,
  POST_LANGS,
  POST_PLATFORMS,
  POST_TEMPLATES,
  isLifecycleKind,
  postLabel,
  templatePlaceholders,
  type CardFormat,
  type PostContentInput,
  type PostKind,
  type PostLang,
  type PostPlatform,
} from "../packages/contracts/src/index.ts";
import { createDb } from "../packages/db/src/index.ts";
import { putPublicOnce } from "../packages/object-store/src/index.ts";
import {
  IMAGE_TYPES,
  META_FILE,
  POSTS_DIR,
  RENDER_DIR,
  describeOutcome,
  exportFolder,
  folderName,
  loadRepoPost,
  loadRepoPosts,
  postFiles,
  postForExport,
  syncRepoPosts,
  type ExportedFolder,
  type Issue,
  type LoadedPost,
  type PostFileStore,
} from "../packages/promo/src/repo/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const today = () => new Date().toISOString().slice(0, 10);

class UsageError extends Error {}

const { positionals, values: flags } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string" },
    kind: { type: "string" },
    name: { type: "string" },
    date: { type: "string" },
    langs: { type: "string" },
    platforms: { type: "string" },
    "no-card": { type: "boolean" },
    week: { type: "string" },
    day: { type: "string" },
    lang: { type: "string" },
    format: { type: "string" },
    "dry-run": { type: "boolean" },
    local: { type: "boolean" },
    force: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const HELP = `pnpm post — posts written in the repo (posts/README.md)

  new     [--project <slug>] [--kind <kind>] [--name "<name>"] [--date YYYY-MM-DD] [--langs zh,en]
          [--week <n> | --day <n>] [--platforms ${POST_PLATFORMS.join(",")}] [--no-card]
  check   [<folder>…]
  render  <folder> [--lang zh|en] [--format ${CARD_FORMAT_NAMES.join("|")}|all]
  list
  sync    [<folder>…] [--dry-run] [--local]
  pull    "<link>" | <post-id> [--local] [--force]

kinds: ${POST_KINDS.join(", ")}`;

/** A folder as given on the command line ("posts/x", "x", or a path) → "posts/x". */
function postDir(arg: string): string {
  const abs = resolve(process.cwd(), arg);
  const rel = existsSync(abs) ? relative(ROOT, abs) : arg.startsWith(`${POSTS_DIR}/`) ? arg : join(POSTS_DIR, arg);
  const dir = rel.split(/[\\/]+/).filter(Boolean).join("/");
  if (!dir.startsWith(`${POSTS_DIR}/`) || dir.split("/").length !== 2) throw new UsageError(`${arg} is not a folder in ${POSTS_DIR}/`);
  if (!existsSync(join(ROOT, dir))) throw new UsageError(`There is no folder ${dir}`);
  return dir;
}

function printIssues(issues: Issue[], indent = "  ") {
  for (const i of issues) {
    const mark = i.level === "error" ? "✗" : "!";
    console.log(`${indent}${mark} ${i.file ? `${i.file}: ` : ""}${i.message}`);
  }
}

// ─── new ─────────────────────────────────────────────────────────────────────

async function cmdNew() {
  const kind = (flags.kind ?? "custom") as PostKind;
  if (!POST_KINDS.includes(kind)) throw new UsageError(`--kind: one of ${POST_KINDS.join(", ")}`);
  const project = flags.project ?? null;
  if (isLifecycleKind(kind) && !project) throw new UsageError(`--project: a ${POST_KIND_INFO[kind].label.toLowerCase()} post belongs to a project`);
  const name = flags.name ?? null;
  if (kind === "custom" && !name) throw new UsageError('--name: what the post is, e.g. --name "Open day"');
  const dueOn = flags.date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new UsageError("--date: like 2026-10-12");
  const langs = (flags.langs ?? "zh,en").split(",").map((l) => l.trim()) as PostLang[];
  if (!langs.length || langs.some((l) => !POST_LANGS.includes(l))) throw new UsageError("--langs: zh, en or zh,en");
  const platforms = flags.platforms ? (flags.platforms.split(",").map((p) => p.trim()) as PostPlatform[]) : null;
  if (platforms?.some((p) => !POST_PLATFORMS.includes(p))) throw new UsageError(`--platforms: of ${POST_PLATFORMS.join(", ")}`);

  const dir = join(POSTS_DIR, folderName(dueOn, project, name ?? kind));
  if (existsSync(join(ROOT, dir))) throw new UsageError(`${dir} exists already`);

  const seq = kind === "progress" ? Number(flags.week ?? 1) : kind === "retro" ? Number(flags.day ?? 30) : null;
  if (seq !== null && (!Number.isInteger(seq) || seq < 1)) throw new UsageError(`--${kind === "progress" ? "week" : "day"}: a whole number`);
  const gap = { zh: (what: string) => `【待补充：${what}】`, en: (what: string) => `[To fill in: ${what}]` };
  // The template (Posts → Templates in the admin panel): its small line, and its fields as gaps.
  const version = (lang: PostLang) => ({
    title: gap[lang](lang === "zh" ? "标题，20 字以内" : "the title"),
    body: templatePlaceholders(kind, lang),
    card: {
      eyebrow: kind === "custom" ? "" : POST_TEMPLATES[kind].eyebrow[lang].replace("N", String(seq ?? "")),
      headline: gap[lang](lang === "zh" ? "卡片大标题" : "the headline"),
      lede: "",
      points: [],
      quote: { text: "", by: "" },
      stats: [],
      footer: "",
    },
  });
  const content: PostContentInput = { zh: version("zh"), en: version("en") };
  const files = postFiles({ project, kind, label: name, seq, dueOn, platforms, withCard: !flags["no-card"] }, content, langs);
  await mkdir(join(ROOT, dir), { recursive: true });
  for (const [file, text] of Object.entries(files)) await writeFile(join(ROOT, dir, file), text);

  console.log(`Made ${dir}/ (${Object.keys(files).join(", ")})`);
  if (seq && !flags.week && !flags.day) console.log(`  ${kind === "progress" ? "Week" : "Day"} ${seq}: change it in ${META_FILE} (and the card's small line) if that's not right.`);
  console.log("  Write the text and the card, drop pictures in the folder and list them under images.");
  console.log(`  Then: pnpm post render ${dir}   and   pnpm post check ${dir}`);
}

// ─── check, list ─────────────────────────────────────────────────────────────

async function loadArgs(): Promise<LoadedPost[]> {
  const dirs = positionals.slice(1).map(postDir);
  return loadRepoPosts(ROOT, dirs.length ? dirs : undefined);
}

async function cmdCheck(): Promise<number> {
  const loaded = await loadArgs();
  if (!loaded.length) {
    console.log(`No posts in ${POSTS_DIR}/ yet. Start one: pnpm post new --name "…"`);
    return 0;
  }
  let errors = 0;
  for (const l of loaded) {
    const bad = l.issues.filter((i) => i.level === "error").length;
    errors += bad;
    console.log(`${bad ? "✗" : "✓"} ${l.dir}${l.post ? `  ${postLabel(l.post.kind, l.post.seq ?? 0, l.post.label)} · ${l.post.dueOn} · ${l.post.langs.join("+")}${l.post.draft ? " · draft" : ""}` : ""}`);
    printIssues(l.issues);
  }
  console.log(errors ? `\n${errors} error(s). Fix them before the merge: the sync skips a post with errors.` : `\n${loaded.length} post(s) fine.`);
  return errors ? 1 : 0;
}

async function cmdList() {
  const loaded = await loadRepoPosts(ROOT);
  for (const l of loaded) {
    const p = l.post;
    const state = l.issues.some((i) => i.level === "error") ? "errors" : l.issues.length ? "warnings" : "ok";
    console.log(
      [l.dir.padEnd(48), p ? p.dueOn : "", p ? (p.project ?? "novawerk").padEnd(18) : "", p ? postLabel(p.kind, p.seq ?? 0, p.label) : "", `(${state})`].join("  "),
    );
  }
  if (!loaded.length) console.log(`No posts in ${POSTS_DIR}/ yet.`);
}

// ─── render ──────────────────────────────────────────────────────────────────

async function cmdRender() {
  const arg = positionals[1];
  if (!arg) throw new UsageError("render <folder>");
  const dir = postDir(arg);
  const { post, issues } = await loadRepoPost(ROOT, dir);
  if (!post) {
    printIssues(issues);
    throw new UsageError(`${dir} has errors; fix them first`);
  }
  if (!post.withCard) console.log("Note: card: false — the post goes out without the card. Rendering it anyway.");
  const langs = flags.lang ? [flags.lang as PostLang] : post.langs;
  if (langs.some((l) => !post.langs.includes(l))) throw new UsageError(`--lang: the post has ${post.langs.join(", ")}`);
  const formats = !flags.format || flags.format === "all" ? CARD_FORMAT_NAMES : [flags.format as CardFormat];
  if (formats.some((f) => !CARD_FORMAT_NAMES.includes(f))) throw new UsageError(`--format: ${CARD_FORMAT_NAMES.join(", ")} or all`);

  const { createFontLoader, photoDataUri, renderCard } = await import("../packages/promo/src/cards/index.ts");
  const fonts = createFontLoader({ warn: (m) => console.warn(m) });
  let photo: string | null = null;
  if (post.photo?.file) {
    const bytes = await readFile(join(ROOT, dir, post.photo.file));
    photo = `data:${IMAGE_TYPES[extname(post.photo.file).toLowerCase()]};base64,${bytes.toString("base64")}`;
  } else if (post.photo?.url) {
    photo = await photoDataUri(post.photo.url);
  }

  const out = join(ROOT, dir, RENDER_DIR);
  await mkdir(out, { recursive: true });
  for (const lang of langs) {
    for (const format of formats) {
      const png = await renderCard({ kind: post.kind, lang, format, card: post.content[lang].card, photo }, { fonts });
      const file = join(out, `${lang}-${format}.png`);
      await writeFile(file, Buffer.from(png));
      console.log(relative(process.cwd(), file));
    }
  }
}

// ─── sync, pull ──────────────────────────────────────────────────────────────

/** apps/api/.env, for --local. Values already in the shell win. */
async function localEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    for (const line of (await readFile(join(ROOT, "apps/api/.env"), "utf8")).split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    throw new UsageError("--local reads apps/api/.env; there is none (cp apps/api/.env.example apps/api/.env)");
  }
  return env;
}

async function connect() {
  const local = flags.local ? await localEnv() : {};
  const url = process.env.DATABASE_URL ?? local.DATABASE_URL;
  if (!url) throw new UsageError("Set DATABASE_URL, or use --local for the database in apps/api/.env");
  const db = createDb(url);
  const close = () => (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  return { db, close, local };
}

/**
 * Where the sync puts pictures: the public Blob store, or for --local, .local-files/ in the repo,
 * which the local API serves at /dev/files/.
 */
function fileStore(local: Record<string, string> | null): PostFileStore | null {
  const token = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
  if (token && !flags.local) return { put: (pathname, bytes, type) => putPublicOnce(token, pathname, bytes, type) };
  if (!local) return null;
  const api = `http://localhost:${process.env.PORT ?? local.PORT ?? 8787}`;
  return {
    async put(pathname, bytes) {
      const file = join(ROOT, ".local-files", pathname);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
      return `${api}/dev/files/${pathname}`;
    },
  };
}

async function cmdSync(): Promise<number> {
  const only = positionals.slice(1).map(postDir);
  const { db, close, local } = await connect();
  try {
    const outcomes = await syncRepoPosts({
      db,
      root: ROOT,
      files: fileStore(flags.local ? local : null),
      commit: process.env.GITHUB_SHA ?? null,
      only: only.length ? only : undefined,
      dryRun: flags["dry-run"],
    });
    for (const o of outcomes) console.log(describeOutcome(o));
    const failed = outcomes.filter((o) => o.result === "failed");
    const counts = [...new Set(outcomes.map((o) => o.result))].map((r) => `${outcomes.filter((o) => o.result === r).length} ${r}`);
    console.log(outcomes.length ? `\n${counts.join(", ")}` : `No posts in ${POSTS_DIR}/.`);
    return failed.length ? 1 : 0;
  } finally {
    await close();
  }
}

/** A post from the admin panel's "Continue in the repo" link, or by id from the database. */
async function cmdPull() {
  const arg = positionals[1];
  if (!arg) throw new UsageError('pull "<link>" (the admin panel\'s "Continue in the repo"), or pull <post-id> with database access');
  let folder: ExportedFolder;
  let label: string;
  if (/^https?:\/\//.test(arg)) {
    const res = await fetch(arg);
    const body = (await res.json().catch(() => ({}))) as ExportedFolder & { error?: string };
    if (!res.ok) throw new UsageError(body.error ?? `The link answered ${res.status}`);
    folder = body;
    label = folder.dir;
  } else {
    const { db, close } = await connect();
    try {
      const row = await postForExport(db, arg);
      if (!row) throw new UsageError(`There is no post ${arg}`);
      folder = exportFolder(row.post, row.projectSlug);
      label = postLabel(row.post.kind, row.post.seq, row.post.label);
    } finally {
      await close();
    }
  }

  const abs = join(ROOT, folder.dir);
  if (existsSync(abs) && !flags.force) throw new UsageError(`${folder.dir} exists already (--force to overwrite it)`);
  await mkdir(abs, { recursive: true });
  for (const [file, text] of Object.entries(folder.files)) await writeFile(join(abs, file), text);
  for (const { file, url } of folder.downloads) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await writeFile(join(abs, file), Buffer.from(await res.arrayBuffer()));
  }
  console.log(`Wrote ${folder.dir}/ (${[...Object.keys(folder.files), ...folder.downloads.map((d) => d.file)].join(", ")})`);
  console.log(`It keeps the post's id: after the merge, the sync updates ${label} instead of adding a post.`);
  console.log(`Next: edit it, pnpm post render ${folder.dir}, pnpm post check ${folder.dir}, open a pull request.`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const command = positionals[0];
  if (!command || flags.help) {
    console.log(HELP);
    return command ? 0 : 1;
  }
  switch (command) {
    case "new":
      await cmdNew();
      return 0;
    case "check":
      return cmdCheck();
    case "list":
      await cmdList();
      return 0;
    case "render":
      await cmdRender();
      return 0;
    case "sync":
      return cmdSync();
    case "pull":
      await cmdPull();
      return 0;
    default:
      throw new UsageError(`Unknown command ${command}\n\n${HELP}`);
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof UsageError) {
      console.error(err.message);
      process.exit(2);
    }
    console.error(err);
    process.exit(1);
  },
);
