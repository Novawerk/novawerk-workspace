// The post writer end to end: real migrations on PGlite, a scripted MockProvider, the real routes,
// tools and SSE stream. It reads the post, keeps its brief and asks for a rewrite; draftPost is a fake.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MockProvider, type MockStep, type ToolCall } from "@nw/agent-harness";
import type { AdminChatEvent, AdminChatSession } from "@nw/contracts";
import { agentSessions, members, posts, projects, type Database } from "@nw/db";

import { TEST_MEMBERS, adminFetch, createTestDb, makeApp, resetDb } from "./helpers.js";

let db: Database;
let postId: string;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  const [project] = await db.insert(projects).values({ slug: "kiez-pantry", title: "Kiez Pantry", status: "building" }).returning();
  const [post] = await db
    .insert(posts)
    .values({ projectId: project!.id, kind: "progress", seq: 3, dueOn: "2026-10-14", langs: ["zh", "en"] })
    .returning();
  postId = post!.id;
});

const say =
  (text: string): MockStep =>
  () => ({ text, toolCalls: [] });
const call =
  (...calls: Omit<ToolCall, "id">[]): MockStep =>
  () => ({ text: "", toolCalls: calls.map((c, i) => ({ id: `call_${c.name}_${i}`, ...c })) });

const parseSSE = (text: string) =>
  text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as AdminChatEvent);

function setup(script: MockStep[], draftPost?: (postId: string) => Promise<void>) {
  const provider = new MockProvider(script);
  const { app } = makeApp(db, { adminChat: { provider }, ...(draftPost ? { draftPost } : {}) });
  const open = (memberId = "ada") => adminFetch(app, "GET", `/admin/posts/${postId}/chat`, undefined, memberId);
  const turn = async (text: string) => {
    const res = await adminFetch(app, "POST", `/admin/posts/${postId}/chat/messages`, { text }, "ada");
    expect(res.status).toBe(200);
    return parseSSE(await res.text());
  };
  return { app, provider, open, turn };
}

const results = (events: AdminChatEvent[]) =>
  events.flatMap((e) => (e.type === "tool_result" ? [{ name: e.name, isError: e.isError, output: e.output }] : []));

describe("the post writer", () => {
  it("keeps one chat per post, shared by the members who can see it", async () => {
    const { open } = setup([]);
    const first = (await (await open("ada")).json()) as AdminChatSession;
    const again = (await (await open("ada")).json()) as AdminChatSession;
    expect(again.id).toBe(first.id);
    const rows = await db.select().from(agentSessions).where(eq(agentSessions.postId, postId));
    expect(rows).toHaveLength(1);
  });

  it("hides a project's post from a member who isn't on the project", async () => {
    const { open } = setup([]);
    expect((await open("grace")).status).toBe(404);
  });

  it("reads the post, saves the brief and has the promo agent rewrite it", async () => {
    const draftPost = vi.fn(async () => {});
    const { turn, provider } = setup(
      [
        call({ name: "read_post", args: {} }),
        call({ name: "save_brief", args: { brief: "完成：20 家店的种子清单（Yu）" } }),
        call({ name: "rewrite_post", args: {} }),
        say("写好了。"),
      ],
      draftPost,
    );
    const events = await turn("这周 20 家店的清单上线了，是 Yu 做的。写吧。");

    const done = results(events);
    expect(done.map((r) => r.name)).toEqual(["read_post", "save_brief", "rewrite_post"]);
    expect(done.every((r) => !r.isError)).toBe(true);
    const read = JSON.parse(done[0]!.output) as { project: string; platforms: string[]; draft: unknown };
    expect(read.project).toBe("Kiez Pantry");
    expect(read.platforms.length).toBeGreaterThan(0);
    expect(read.draft).toBe("not written yet");

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(post?.brief).toBe("完成：20 家店的种子清单（Yu）");
    expect(draftPost).toHaveBeenCalledWith(postId);
    expect(events.some((e) => e.type === "turn_end")).toBe(true);
    // The open post rides on the message as context.
    expect(JSON.stringify(provider.requests[0])).toContain(postId);
  });

  it("a rewrite without the promo agent comes back as a failed step", async () => {
    const { turn } = setup([call({ name: "rewrite_post", args: {} }), say("Not now.")]);
    const [rewrite] = results(await turn("Write it."));
    expect(rewrite).toMatchObject({ name: "rewrite_post", isError: true });
    expect(rewrite!.output).toMatch(/switched off/);
  });

  it("leaves a published post's brief alone", async () => {
    await db.update(posts).set({ status: "published" }).where(eq(posts.id, postId));
    const { turn } = setup([call({ name: "save_brief", args: { brief: "new" } }), say("ok")]);
    const [save] = results(await turn("Change it."));
    expect(save!.output).toMatch(/published/);
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(post?.brief).toBeNull();
  });

  it("answers 503 when no model is set up", async () => {
    const { app } = makeApp(db);
    const res = await adminFetch(app, "GET", `/admin/posts/${postId}/chat`, undefined, "ada");
    expect(res.status).toBe(503);
  });
});
