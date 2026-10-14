// Posts written in the repo: a folder reads into a post (or into what is wrong with it), the sync
// writes it once and again only when its files change, and a post from the database turns back
// into the same folder.

import { eq } from "drizzle-orm";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { posts, projects, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import { exportFolder, postForExport } from "./export.js";
import { loadRepoPost, metaFile } from "./format.js";
import { syncRepoPosts, type PostFileStore } from "./sync.js";

// The smallest PNG there is.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");

let root: string;
let db: Database;
const stored: string[] = [];
const files: PostFileStore = {
  async put(pathname) {
    stored.push(pathname);
    return `https://blob.example/${pathname}`;
  },
};

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "nw-posts-"));
  stored.length = 0;
  await resetDb(db);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function folder(name: string, contents: Record<string, string | Buffer>) {
  const dir = join(root, "posts", name);
  await mkdir(dir, { recursive: true });
  for (const [file, body] of Object.entries(contents)) await writeFile(join(dir, file), body);
  return `posts/${name}`;
}

const zh = (title: string, body: string, headline = "来工作坊坐坐") =>
  `---\ntitle: ${title}\ncard:\n  eyebrow: Novawerk 开放日\n  headline: ${headline}\n  points:\n    - 14:00–18:00 · Kreuzberg\n  stats:\n    - "3 | 个项目"\n---\n\n${body}\n`;
const en = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;

const OPEN_DAY = {
  "post.yml": "kind: custom\nname: Open day\ndate: 2026-10-18\nplatforms: [xiaohongshu, discord]\nimages:\n  - file: poster.png\n    lang: zh\n",
  "zh.md": zh("来工作坊坐坐", "周六下午，我们开放工作坊。"),
  "en.md": en("Open day", "On Saturday we open the workshop."),
  "poster.png": PIXEL,
};

describe("reading a folder", () => {
  it("reads post.yml, the language files and the pictures into a post", async () => {
    const dir = await folder("2026-10-18-open-day", OPEN_DAY);
    const { post, issues } = await loadRepoPost(root, dir);
    expect(issues).toEqual([]);
    expect(post).toMatchObject({
      dir: "posts/2026-10-18-open-day",
      project: null,
      kind: "custom",
      label: "Open day",
      seq: null,
      dueOn: "2026-10-18",
      langs: ["zh", "en"],
      platforms: ["xiaohongshu", "discord"],
      withCard: true,
      images: [{ file: "poster.png", lang: "zh" }],
      draft: false,
    });
    expect(post!.content.zh).toMatchObject({
      title: "来工作坊坐坐",
      body: "周六下午，我们开放工作坊。",
      card: { eyebrow: "Novawerk 开放日", headline: "来工作坊坐坐", points: ["14:00–18:00 · Kreuzberg"], stats: [{ value: "3", label: "个项目" }] },
    });
    expect(post!.content.en.card.headline).toBe("");
    expect(post!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("says what is wrong, file by file", async () => {
    const dir = await folder("broken", {
      "post.yml": "kind: launch\ndate: tomorrow\nplatfroms: [linkedin]\nimages: [missing.png]\n",
      "zh.md": zh("标题", "首个交付截止【待补充：日期】。"),
      "notes.txt": "scratch",
    });
    const { post, issues } = await loadRepoPost(root, dir);
    expect(post).toBeNull();
    const messages = issues.map((i) => `${i.level} ${i.file ?? "-"}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^error post\.yml: date: /),
        expect.stringMatching(/^error post\.yml: .*platfroms/),
      ]),
    );

    const fixed = await folder("half", {
      "post.yml": "kind: launch\ndate: 2026-10-18\nimages: [missing.png]\n",
      "zh.md": zh("标题", "首个交付截止【待补充：日期】。"),
      "notes.txt": "scratch",
    });
    const second = await loadRepoPost(root, fixed);
    expect(second.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        "project: a launch post belongs to a project",
        "images[0]: there is no file missing.png in this folder",
        "Not used by the post: list it under images, or remove it",
        "Fill these in first, or set draft: true to review it in the admin panel: 【待补充：日期】",
      ]),
    );
  });

  it("refuses a link in the Chinese version of a Xiaohongshu post, and lets the English one keep it", async () => {
    const dir = await folder("open-day-link", {
      "post.yml": "kind: custom\nname: Open day\ndate: 2026-10-18\nplatforms: [xiaohongshu, linkedin]\n",
      "zh.md": zh("来工作坊坐坐", "报名：novawerk.io/community，或者写信给 info@novawerk.io。"),
      "en.md": en("Open day", "Sign up at novawerk.io/community."),
    });
    const { post, issues } = await loadRepoPost(root, dir);
    expect(post).toBeNull();
    expect(issues).toEqual([
      expect.objectContaining({ level: "error", file: "zh.md", message: expect.stringContaining("novawerk.io/community, info@novawerk.io") }),
    ]);

    const discordOnly = await folder("open-day-discord", {
      "post.yml": "kind: custom\nname: Open day\ndate: 2026-10-18\nplatforms: [discord]\ncard: false\n",
      "zh.md": zh("来工作坊坐坐", "报名：novawerk.io/community"),
    });
    expect((await loadRepoPost(root, discordOnly)).issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("takes a one-language post, and lets placeholders through as a draft", async () => {
    const dir = await folder("draft", {
      "post.yml": "kind: custom\nname: Thanks\ndate: 2026-10-20\ncard: false\ndraft: true\n",
      "en.md": en("Thank you", "Thanks to [To fill in: the partners]."),
    });
    const { post, issues } = await loadRepoPost(root, dir);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(post).toMatchObject({ langs: ["en"], withCard: false, draft: true });
  });
});

describe("syncing", () => {
  it("creates the post approved, then leaves it alone until its files change", async () => {
    await folder("2026-10-18-open-day", OPEN_DAY);
    const first = await syncRepoPosts({ db, root, files, commit: "abc1234" });
    expect(first).toMatchObject([{ dir: "posts/2026-10-18-open-day", result: "created", label: "Open day" }]);
    expect(stored).toEqual([expect.stringMatching(/^posts\/2026-10-18-open-day\/[0-9a-f]{16}-poster\.png$/)]);

    const [row] = await db.select().from(posts);
    expect(row).toMatchObject({
      projectId: null,
      kind: "custom",
      label: "Open day",
      seq: 1,
      status: "approved",
      langs: ["zh", "en"],
      platforms: ["xiaohongshu", "discord"],
      images: [{ url: `https://blob.example/${stored[0]}`, lang: "zh" }],
      sourcePath: "posts/2026-10-18-open-day",
      sourceCommit: "abc1234",
    });
    expect(row!.approvedAt).not.toBeNull();

    expect(await syncRepoPosts({ db, root, files })).toMatchObject([{ result: "unchanged" }]);

    await writeFile(join(root, "posts/2026-10-18-open-day/en.md"), en("Open day", "On Saturday we open the doors."));
    await db.update(posts).set({ status: "skipped" }).where(eq(posts.id, row!.id));
    expect(await syncRepoPosts({ db, root, files })).toMatchObject([{ result: "updated", postId: row!.id }]);
    const [after] = await db.select().from(posts);
    expect(after).toMatchObject({ status: "approved", content: { en: { body: "On Saturday we open the doors." } } });
  });

  it("takes over the lifecycle post the schedule planned, and keeps a posted one as it went out", async () => {
    const [project] = await db.insert(projects).values({ slug: "kiez", title: "Kiez Pantry", status: "launched" }).returning();
    const [planned] = await db.insert(posts).values({ projectId: project!.id, kind: "launch", dueOn: "2026-10-10" }).returning();
    await folder("kiez-launch", {
      "post.yml": "project: kiez\nkind: launch\ndate: 2026-10-10\ndraft: true\n",
      "zh.md": zh("Kiez Pantry 上线了", "今天上线。"),
    });
    expect(await syncRepoPosts({ db, root, files })).toMatchObject([{ result: "updated", postId: planned!.id }]);
    const [taken] = await db.select().from(posts);
    expect(taken).toMatchObject({ id: planned!.id, status: "drafted", langs: ["zh"], sourcePath: "posts/kiez-launch", approvedAt: null });

    await db.update(posts).set({ status: "published" }).where(eq(posts.id, planned!.id));
    await writeFile(join(root, "posts/kiez-launch/zh.md"), zh("Kiez Pantry 上线了", "改了一句。"));
    expect(await syncRepoPosts({ db, root, files })).toMatchObject([{ result: "kept" }]);
    expect((await db.select().from(posts))[0]!.content!.zh.body).toBe("今天上线。");
  });

  it("fails a folder with errors or an unknown project, and skips the posts whose folder is gone", async () => {
    await folder("2026-10-18-open-day", OPEN_DAY);
    await syncRepoPosts({ db, root, files });
    await rm(join(root, "posts/2026-10-18-open-day"), { recursive: true });
    await folder("nowhere", { "post.yml": "project: nowhere\nkind: custom\nname: X\ndate: 2026-10-18\n", "en.md": en("X", "Y") });
    await folder("bad", { "post.yml": "kind: custom\ndate: 2026-10-18\n" });

    const outcomes = await syncRepoPosts({ db, root, files });
    expect(outcomes).toMatchObject([
      { dir: "posts/bad", result: "failed", reason: "the folder has errors (pnpm post check)" },
      { dir: "posts/nowhere", result: "failed", reason: "project: there is no project with the slug nowhere" },
      { dir: "posts/2026-10-18-open-day", result: "skipped", reason: "its folder is gone" },
    ]);
    expect((await db.select().from(posts))[0]!.status).toBe("skipped");
  });

  it("writes nothing on a dry run", async () => {
    await folder("2026-10-18-open-day", OPEN_DAY);
    expect(await syncRepoPosts({ db, root, files, dryRun: true })).toMatchObject([{ result: "created" }]);
    expect(await db.select().from(posts)).toEqual([]);
    expect(stored).toEqual([]);
  });
});

describe("exporting", () => {
  it("turns a post back into the folder it came from, and the folder updates that post", async () => {
    await folder("2026-10-18-open-day", OPEN_DAY);
    await syncRepoPosts({ db, root, files });
    const [row] = await db.select().from(posts);

    const exported = exportFolder((await postForExport(db, row!.id))!.post, null);
    expect(exported.dir).toBe("posts/2026-10-18-open-day");
    expect(exported.downloads).toEqual([{ file: "01-poster.png", url: row!.images[0]!.url }]);

    // Write it out as `pnpm post pull` would, under another name: the id keeps it the same post.
    await rm(join(root, "posts/2026-10-18-open-day"), { recursive: true });
    await folder("renamed", { ...exported.files, "01-poster.png": PIXEL });
    const { post, issues } = await loadRepoPost(root, "posts/renamed");
    expect(issues).toEqual([]);
    expect(post).toMatchObject({ id: row!.id, label: "Open day", platforms: ["xiaohongshu", "discord"], images: [{ file: "01-poster.png", lang: "zh" }] });
    expect(post!.content).toEqual(row!.content);

    expect(await syncRepoPosts({ db, root, files })).toMatchObject([{ dir: "posts/renamed", result: "updated", postId: row!.id }]);
    expect(await db.select().from(posts)).toHaveLength(1);
  });

  it("names a week and a day for progress posts and retrospectives", () => {
    expect(metaFile({ project: "kiez", kind: "progress", seq: 4, dueOn: "2026-10-18" })).toContain("week: 4");
    expect(metaFile({ project: "kiez", kind: "retro", seq: 30, dueOn: "2026-10-18" })).toContain("day: 30");
  });
});
