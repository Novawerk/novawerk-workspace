// /admin/posts and /admin/cards: a post goes planned → drafted → approved → published, a member
// in charge at every step; the card renders from what the editor sends.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyPostCard, type PostContentInput } from "@nw/contracts";
import { members, posts, projectMembers, projects, type Database } from "@nw/db";

import type { PromoRef } from "../src/types.js";
import { TEST_MEMBERS, adminFetch, adminJson, createTestDb, makeApp, resetDb } from "./helpers.js";

// No global fetch mock here: the card renderer decodes its layout engine from a data: URL with
// fetch. Nothing in these routes calls the website hook.
let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
});

const COVER = "https://store.public.blob.vercel-storage.com/projects/kiez/cover.png";
const SHOT = "https://store.public.blob.vercel-storage.com/projects/kiez/shot.jpg";

const content = (zhBody = "我们开始了。"): PostContentInput => ({
  zh: { title: "有人许愿了", body: zhBody, card: { ...emptyPostCard(), headline: "Kiez Pantry" } },
  en: { title: "Someone wished for it", body: "We started.", card: { ...emptyPostCard(), headline: "Kiez Pantry" } },
});

async function setup(opts: { cardFetch?: typeof fetch } = {}) {
  const woken: PromoRef[] = [];
  const { app } = makeApp(db, { triggerPromo: async (ref) => void woken.push(ref), ...opts });
  const [project] = await db
    .insert(projects)
    .values({ slug: "kiez", title: "Kiez Pantry", status: "building", coverUrl: COVER, gallery: [{ url: SHOT }] })
    .returning();
  const [post] = await db
    .insert(posts)
    .values({ projectId: project!.id, kind: "kickoff", dueOn: "2026-10-03" })
    .returning();
  return { app, woken, project: project!, post: post! };
}

describe("GET /admin/posts", () => {
  it("lists posts with their project and pictures, filtered by status or project", async () => {
    const { app, project, post } = await setup();
    const list = await adminJson(app, "GET", "/admin/posts");
    expect(list).toMatchObject([
      { id: post.id, kind: "kickoff", status: "planned", project: { id: project.id, title: "Kiez Pantry", coverUrl: COVER, gallery: [{ url: SHOT }] } },
    ]);
    expect(await adminJson(app, "GET", "/admin/posts?status=drafted")).toEqual([]);
    expect(await adminJson(app, "GET", `/admin/posts?projectId=${project.id}`)).toHaveLength(1);
    expect((await adminFetch(app, "GET", "/admin/posts?status=sent")).status).toBe(400);
    expect((await adminFetch(app, "GET", "/admin/posts/not-a-uuid")).status).toBe(404);
  });
});

describe("GET /admin/posts/board", () => {
  it("gives one lane per project under way, with its posts, what is ahead, and what it still needs", async () => {
    const { app, project, post } = await setup();
    await db.insert(projects).values([
      { slug: "soon", title: "Soon", status: "launching", launchDate: "2099-01-01" },
      { slug: "nodate", title: "No date", status: "launching" },
      { slug: "draft", title: "A draft", status: "draft" },
    ]);
    const { today, lanes } = await adminJson(app, "GET", "/admin/posts/board");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Launching first, then building; the draft without posts stays off.
    expect(lanes.map((l: { project: { title: string } }) => l.project.title)).toEqual(["No date", "Soon", "Kiez Pantry"]);

    const kiez = lanes.find((l: { project: { id: string } }) => l.project.id === project.id)
    expect(kiez.posts.map((p: { id: string }) => p.id)).toEqual([post.id]);
    expect(kiez.hints).toEqual(["No building start on record; add posts by hand"]);
    expect(lanes[0].hints).toEqual(["Set a launch date to plan the launch posts"]);
    // 2099 is beyond the horizon: nothing ahead yet.
    expect(lanes[1].upcoming).toEqual([]);
  });
});

describe("editing", () => {
  it("saves the brief and picture without changing the status, and a text makes it a draft", async () => {
    const { app, post } = await setup();
    const briefed = await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { brief: "We met on Sunday.", photoUrl: SHOT });
    expect(briefed).toMatchObject({ brief: "We met on Sunday.", photoUrl: SHOT, status: "planned" });

    const written = await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content() });
    expect(written).toMatchObject({ status: "drafted", content: content() });
  });

  it("puts the project's pictures or the post's own on the card, and nothing else", async () => {
    const { app, post } = await setup();
    const res = await adminFetch(app, "PATCH", `/admin/posts/${post.id}`, { photoUrl: "https://example.org/x.png" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      issues: { photoUrl: ["Pick the project's cover, one of its gallery pictures, or one of the post's"] },
    });
    const own = "https://store.public.blob.vercel-storage.com/posts/poster.png";
    const saved = await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { images: [{ url: own, lang: "zh" }], photoUrl: own });
    expect(saved).toMatchObject({ images: [{ url: own, lang: "zh" }], photoUrl: own });
  });

  it("sends an approved post back to review when its text changes", async () => {
    const { app, post } = await setup();
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content() });
    await adminJson(app, "POST", `/admin/posts/${post.id}/approve`);
    const edited = await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content("改了一句。") });
    expect(edited).toMatchObject({ status: "drafted", approvedBy: null });
  });
});

describe("drafting", () => {
  it("asks the promo agent for a new draft and says whether it was woken", async () => {
    const { app, woken, post } = await setup();
    await db.update(posts).set({ draftError: "overloaded" }).where(eq(posts.id, post.id));
    const asked = await adminJson(app, "POST", `/admin/posts/${post.id}/draft`);
    expect(asked.dispatched).toBe(true);
    expect(asked.post.draftRequestedAt).not.toBeNull();
    expect(asked.post.draftError).toBeNull();
    expect(woken).toEqual([{ postId: post.id }]);

    const quiet = makeApp(db).app;
    expect((await adminJson(quiet, "POST", `/admin/posts/${post.id}/draft`)).dispatched).toBe(false);
  });

  it("won't approve while a new draft is on its way", async () => {
    const { app, post } = await setup();
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content() });
    await adminJson(app, "POST", `/admin/posts/${post.id}/draft`);
    const res = await adminFetch(app, "POST", `/admin/posts/${post.id}/approve`);
    expect(res.status).toBe(409);
  });
});

describe("approving and posting", () => {
  it("refuses an empty post and one with placeholders left", async () => {
    const { app, post } = await setup();
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/approve`)).status).toBe(409);
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content("首个交付截止【待补充：日期】。") });
    const res = await adminFetch(app, "POST", `/admin/posts/${post.id}/approve`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ issues: { content: ["Fill these in first: 【待补充：日期】"] } });
  });

  it("refuses a Xiaohongshu post whose Chinese version shows a link", async () => {
    const { app, post } = await setup();
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content("想加入？写信给 info@novawerk.io。") });
    const res = await adminFetch(app, "POST", `/admin/posts/${post.id}/approve`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      issues: { content: ["Xiaohongshu throttles notes with a link; take these out of the Chinese version: info@novawerk.io"] },
    });
  });

  it("goes approved → published when a member marks it posted, and back", async () => {
    const { app, post } = await setup();
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/publish`)).status).toBe(409);
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content() });
    const approved = await adminJson(app, "POST", `/admin/posts/${post.id}/approve`);
    expect(approved).toMatchObject({ status: "approved", approvedBy: "ada", publishedAt: null });

    const posted = await adminJson(app, "POST", `/admin/posts/${post.id}/publish`);
    expect(posted.status).toBe("published");
    expect(posted.publishedAt).not.toBeNull();

    // A published post is not edited any more.
    expect((await adminFetch(app, "PATCH", `/admin/posts/${post.id}`, { brief: "x" })).status).toBe(409);
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/skip`)).status).toBe(409);

    const undone = await adminJson(app, "POST", `/admin/posts/${post.id}/unpublish`);
    expect(undone).toMatchObject({ status: "approved", publishedAt: null });
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/unpublish`)).status).toBe(409);
  });

  it("skips and restores a post", async () => {
    const { app, post } = await setup();
    expect(await adminJson(app, "POST", `/admin/posts/${post.id}/skip`)).toMatchObject({ status: "skipped" });
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/draft`)).status).toBe(409);
    expect(await adminJson(app, "POST", `/admin/posts/${post.id}/restore`)).toMatchObject({ status: "planned" });
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/restore`)).status).toBe(409);
  });
});

describe("POST /admin/cards", () => {
  const card = { ...emptyPostCard(), eyebrow: "Someone wished for it", headline: "Kiez Pantry", lede: "Food, not waste." };
  const pngSize = async (res: Response) => {
    const view = new DataView(await res.arrayBuffer());
    return { width: view.getUint32(16), height: view.getUint32(20) };
  };

  it("renders the card the editor sends as a PNG", async () => {
    const { app } = await setup();
    const res = await adminFetch(app, "POST", "/admin/cards", { kind: "kickoff", lang: "en", format: "link", card });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await pngSize(res)).toEqual({ width: 1200, height: 630 });
  });

  it("puts in one of the project's own pictures, and only those", async () => {
    const pixel = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="),
      (ch) => ch.charCodeAt(0),
    );
    const cardFetch = vi.fn(async (url: string | URL | Request) =>
      String(url) === SHOT
        ? new Response(pixel, { headers: { "content-type": "image/png" } })
        : new Response(pixel, { headers: { "content-type": "image/webp" } }),
    );
    const { app } = await setup({ cardFetch: cardFetch as unknown as typeof fetch });

    const withShot = await adminFetch(app, "POST", "/admin/cards", { kind: "launch", lang: "en", format: "square", card, photoUrl: SHOT });
    expect(withShot.status).toBe(200);
    expect(await pngSize(withShot)).toEqual({ width: 1200, height: 1200 });

    const stranger = await adminFetch(app, "POST", "/admin/cards", {
      kind: "launch",
      lang: "en",
      format: "square",
      card,
      photoUrl: "https://example.org/x.png",
    });
    expect(stranger.status).toBe(400);
    expect(cardFetch).not.toHaveBeenCalledWith("https://example.org/x.png", expect.anything());

    const webp = await adminFetch(app, "POST", "/admin/cards", { kind: "launch", lang: "en", format: "square", card, photoUrl: COVER });
    expect(webp.status).toBe(422);
    expect(await webp.json()).toMatchObject({ issues: { photoUrl: [expect.stringContaining("PNG, JPEG or GIF")] } });
  });

  it("shows where the photo goes, without fetching one (the template previews)", async () => {
    const cardFetch = vi.fn();
    const { app } = await setup({ cardFetch: cardFetch as unknown as typeof fetch });
    const res = await adminFetch(app, "POST", "/admin/cards", { kind: "launch", lang: "zh", format: "portrait", card, samplePhoto: true });
    expect(res.status).toBe(200);
    expect(await pngSize(res)).toEqual({ width: 1242, height: 1656 });
    expect(cardFetch).not.toHaveBeenCalled();
  });

  it("refuses a card that doesn't fit the template", async () => {
    const { app } = await setup();
    const res = await adminFetch(app, "POST", "/admin/cards", {
      kind: "kickoff",
      lang: "en",
      format: "poster",
      card: { ...card, points: ["1", "2", "3", "4", "5", "6"] },
    });
    expect(res.status).toBe(400);
    expect(Object.keys(((await res.json()) as { issues: object }).issues).sort()).toEqual(["card", "format"]);
  });

  it("needs a signed-in member", async () => {
    const { app } = await setup();
    const res = await adminFetch(app, "POST", "/admin/cards", { kind: "kickoff", lang: "en", format: "link", card }, null);
    expect(res.status).toBe(401);
  });
});

describe("any post", () => {
  it("adds a custom post about Novawerk itself, in one language, for the platforms it names", async () => {
    const { app, woken } = await setup();
    const { post, dispatched } = await adminJson(
      app,
      "POST",
      "/admin/posts",
      { kind: "custom", label: "Open day", langs: ["en"], platforms: ["linkedin", "discord"], withCard: false, dueOn: "2026-10-18" },
      201,
    );
    expect(post).toMatchObject({
      projectId: null,
      project: null,
      kind: "custom",
      label: "Open day",
      seq: 1,
      langs: ["en"],
      platforms: ["linkedin", "discord"],
      withCard: false,
      status: "planned",
    });
    expect(dispatched).toBe(true);
    expect(woken).toEqual([{ postId: post.id }]);

    // The next one gets the next number; the board shows them apart from the projects.
    const second = await adminJson(app, "POST", "/admin/posts", { kind: "custom", label: "Thanks", draft: false }, 201);
    expect(second.post).toMatchObject({ seq: 2, langs: ["zh", "en"], platforms: null, draftRequestedAt: null });
    const { general } = await adminJson(app, "GET", "/admin/posts/board");
    expect(general.map((p: { label: string }) => p.label)).toEqual(["Thanks", "Open day"]);
  });

  it("needs a name for a custom post and a project for a lifecycle one", async () => {
    const { app, project } = await setup();
    const unnamed = await adminFetch(app, "POST", "/admin/posts", { kind: "custom" });
    expect(await unnamed.json()).toMatchObject({ issues: { label: ["Name the post"] } });
    const homeless = await adminFetch(app, "POST", "/admin/posts", { kind: "launch" });
    expect(await homeless.json()).toMatchObject({ issues: { projectId: ["A lifecycle post belongs to a project"] } });
    const custom = await adminJson(app, "POST", `/admin/projects/${project.id}/posts`, { kind: "custom", label: "Playtest" }, 201);
    expect(custom.post).toMatchObject({ projectId: project.id, label: "Playtest", seq: 1 });
  });

  it("leaves posts about Novawerk itself to admins", async () => {
    const { app, project } = await setup();
    await db.insert(projectMembers).values({ projectId: project.id, memberId: "grace", role: "Developer" });
    const { post } = await adminJson(app, "POST", "/admin/posts", { kind: "custom", label: "Open day" }, 201);
    expect((await adminFetch(app, "POST", "/admin/posts", { kind: "custom", label: "Mine" }, "grace")).status).toBe(403);
    expect((await adminFetch(app, "GET", `/admin/posts/${post.id}`, undefined, "grace")).status).toBe(404);
    const theirs = await adminFetch(app, "POST", "/admin/posts", { projectId: project.id, kind: "custom", label: "Ours" }, "grace");
    expect(theirs.status).toBe(201);
    const board = (await (await adminFetch(app, "GET", "/admin/posts/board", undefined, "grace")).json()) as { general: unknown[] };
    expect(board.general).toEqual([]);
  });

  it("approves a one-language post once that language is written", async () => {
    const { app, post } = await setup();
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { langs: ["zh"], content: { ...content(), en: { title: "", body: "", card: emptyPostCard() } } });
    expect(await adminJson(app, "POST", `/admin/posts/${post.id}/approve`)).toMatchObject({ status: "approved" });

    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { langs: ["zh", "en"] });
    const res = await adminFetch(app, "POST", `/admin/posts/${post.id}/approve`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ issues: { content: ["Write the English version first"] } });
  });
});

describe("posts written in the repo", () => {
  async function repoPost() {
    const ctx = await setup();
    const [post] = await db
      .update(posts)
      .set({ content: content(), status: "approved", approvedAt: new Date(), sourcePath: "posts/2026-10-03-kiez-kickoff", sourceHash: "abc" })
      .where(eq(posts.id, ctx.post.id))
      .returning();
    return { ...ctx, post: post! };
  }

  it("are changed in the repo, not here", async () => {
    const { app, post } = await repoPost();
    const res = await adminFetch(app, "PATCH", `/admin/posts/${post.id}`, { brief: "x" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("posts/2026-10-03-kiez-kickoff") });
    expect((await adminFetch(app, "POST", `/admin/posts/${post.id}/draft`)).status).toBe(409);
  });

  it("are still posted, skipped and restored here; a restored one is approved again", async () => {
    const { app, post } = await repoPost();
    expect(await adminJson(app, "POST", `/admin/posts/${post.id}/skip`)).toMatchObject({ status: "skipped" });
    expect(await adminJson(app, "POST", `/admin/posts/${post.id}/restore`)).toMatchObject({ status: "approved" });
    expect(await adminJson(app, "POST", `/admin/posts/${post.id}/publish`)).toMatchObject({ status: "published" });
  });
});

describe("continuing in the repo", () => {
  it("hands out a signed link to the post's folder, good for one post and half an hour", async () => {
    const { app, post } = await setup();
    await adminJson(app, "PATCH", `/admin/posts/${post.id}`, { content: content(), images: [{ url: SHOT }], photoUrl: SHOT });
    const link = await adminJson(app, "POST", `/admin/posts/${post.id}/export-link`);
    expect(link.command).toBe(`pnpm post pull "${link.url}"`);

    const { pathname, search } = new URL(link.url);
    const folder = (await (await app.request(`${pathname}${search}`)).json()) as {
      dir: string;
      files: Record<string, string>;
      downloads: { file: string; url: string }[];
    };
    expect(folder.dir).toBe("posts/2026-10-03-kiez-kickoff");
    expect(folder.files["post.yml"]).toContain(`id: ${post.id}`);
    expect(folder.files["post.yml"]).toContain("project: kiez");
    expect(folder.files["zh.md"]).toContain("我们开始了。");
    expect(folder.downloads).toEqual([{ file: "01-shot.jpg", url: SHOT }]);

    const forged = await app.request(`${pathname}${search.replace(/sig=[^&]+/, "sig=forged")}`);
    expect(forged.status).toBe(403);
    const other = await app.request(`/exports/posts/${crypto.randomUUID()}${search}`);
    expect(other.status).toBe(403);
    const expires = Number(new URL(link.url).searchParams.get("expires"));
    vi.useFakeTimers({ now: expires + 1, toFake: ["Date"] });
    try {
      expect((await app.request(`${pathname}${search}`)).status).toBe(410);
    } finally {
      vi.useRealTimers();
    }
  });
});
