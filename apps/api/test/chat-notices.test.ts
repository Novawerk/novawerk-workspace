// Task board news in the team's chat room: what needs one of us and what is only news, posted
// once each, with links and nothing private.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { proposalInput, suggestionInput } from "@nw/contracts";
import { chatNotices, members, taskEvents, tasks, type Member, type Database } from "@nw/db";
import { propose, suggestTask, transitionTask } from "@nw/tasks";

import { MAX_CHAT_ATTEMPTS, SMALL_GRACE_MS, chatBotPoster, runChatNotices } from "../src/chat-notices.js";
import { readEnv } from "../src/deps.js";
import { TEST_MEMBERS, createTestDb, makeApp, resetDb } from "./helpers.js";

const CRON_SECRET = "cron-secret-0123456789";
const links = { webUrl: "https://novawerk.io", adminUrl: "https://admin.novawerk.io" };
const logger = { error: () => undefined, warn: () => undefined };
const PR = "https://github.com/Novawerk/novawerk-workspace/pull/77";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

let lena: Member;
let jonas: Member;
let posts: string[];
const post = async (html: string) => {
  posts.push(html);
};
/** A minute later than now, so rows written just now are in the past. */
const later = (ms = 60_000) => new Date(Date.now() + ms);
const run = (at = later(), poster: ((html: string) => Promise<void>) | null = post) => runChatNotices(db, poster ?? undefined, links, logger, at);

beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values(TEST_MEMBERS);
  posts = [];
  const person = (handle: string, githubId: number) =>
    db
      .insert(members)
      .values({ handle, displayName: handle, githubId, email: `${handle}@example.org`, pledgeAcceptedAt: new Date() })
      .returning()
      .then((r) => r[0]!);
  lena = await person("lena-k", 1);
  jonas = await person("jonas", 2);
});

async function openTask(over: Partial<typeof tasks.$inferInsert> = {}) {
  const [t] = await db.insert(tasks).values({ title: "Sort the wall A–Z", status: "open", area: "web", size: "M", ...over }).returning();
  return t!;
}
const plan = proposalInput.parse({ approach: "Secret plan: add a sort select to the wall.", eta: "days", readCriteria: true });

describe("what goes to the room", () => {
  it("posts a new plan on an M task once, as a to-do with the proposals queue and the task", async () => {
    const task = await openTask();
    await propose(db, lena, task.id, plan);

    expect(await run()).toEqual({ configured: true, queued: 1, sent: 1, skipped: 0, failed: 0, stuck: 0, pruned: 0 });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("<strong>To do</strong>");
    expect(posts[0]).toContain(`<strong>NW-${task.id}</strong> Sort the wall A–Z`);
    expect(posts[0]).toContain("@lena-k");
    expect(posts[0]).toContain('href="https://admin.novawerk.io/proposals"');
    expect(posts[0]).toContain(`href="https://novawerk.io/tasks/${task.id}"`);
    // Nothing private: not the plan, not the address.
    expect(posts[0]).not.toContain("Secret plan");
    expect(posts[0]).not.toContain("example.org");

    await run();
    expect(posts).toHaveLength(1);
  });

  it("gives an S task's plan time to be chosen automatically, then says it waits", async () => {
    // A plan the system didn't choose (here: the task was an M when she sent it).
    const small = await openTask({ title: "Small", size: "M" });
    expect((await propose(db, lena, small.id, plan)).status).toBe("pending");
    await db.update(tasks).set({ size: "S" }).where(eq(tasks.id, small.id));

    await run(new Date());
    expect(posts).toEqual([]);
    await run(later(SMALL_GRACE_MS + 60_000));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("<strong>To do</strong>");
    expect(posts[0]).toContain("S task wasn't chosen automatically");
  });

  it("says as news, with no queue link, that the system gave an S task away", async () => {
    const task = await openTask({ size: "S", status: "assigned", assigneeId: jonas.id });
    // What autoChooseSmall writes: an `assigned` event with no actor.
    await db.insert(taskEvents).values({ taskId: task.id, kind: "assigned", fromStatus: "open", toStatus: "assigned", subjectContributorId: jonas.id });
    // A maintainer's choice is theirs to know: no news.
    await db.insert(taskEvents).values({ taskId: task.id, kind: "assigned", fromStatus: "open", toStatus: "assigned", actorMemberId: "ada", subjectContributorId: jonas.id });

    await run();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("<strong>FYI</strong>");
    expect(posts[0]).toContain("given to @jonas automatically");
    expect(posts[0]).not.toContain("/proposals");
  });

  it("posts a pull request to review with its link", async () => {
    const task = await openTask({ status: "assigned", assigneeId: lena.id });
    await transitionTask(db, { taskId: task.id, action: "link_pr", actor: { kind: "system" }, prUrl: PR });

    await run();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("<strong>To do</strong>");
    expect(posts[0]).toContain("pull request from @lena-k to review");
    expect(posts[0]).toContain(`href="${PR}"`);
  });

  it("posts a suggestion still waiting for triage, not one already triaged", async () => {
    const waiting = await suggestTask(db, lena, suggestionInput.parse({ title: "Dark mode", kind: "improvement", body: "Please add a dark mode to the board.", where: "site" }));
    const triaged = await suggestTask(db, jonas, suggestionInput.parse({ title: "Typo on /about", kind: "bug", body: "There is a typo in the second paragraph.", where: "site" }));
    await transitionTask(db, { taskId: triaged.id, action: "decline", actor: { kind: "member", id: "ada" }, note: "Private-ish reason" });

    await run();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("new suggestion from @lena-k to triage");
    expect(posts[0]).toContain(`href="https://admin.novawerk.io/suggestions?id=${waiting.id}"`);
    expect(posts[0]).not.toContain("dark mode to the board");
  });

  it("escapes titles", async () => {
    const task = await openTask({ title: `<script>alert("x")</script> & co` });
    await propose(db, lena, task.id, plan);
    await run();
    expect(posts[0]).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    expect(posts[0]).not.toContain("<script>");
  });
});

describe("delivery", () => {
  it("does nothing at all without a bot URL: nothing queues up for later", async () => {
    const task = await openTask();
    await propose(db, lena, task.id, plan);
    expect(await run(later(), null)).toEqual({ configured: false });
    expect(await db.select().from(chatNotices)).toEqual([]);
  });

  it("keeps a row when the chat says no, stops the run, and gives up after 3 tries", async () => {
    await propose(db, lena, (await openTask()).id, plan);
    await propose(db, lena, (await openTask({ title: "Second" })).id, plan);
    const down = vi.fn(async () => {
      throw new Error("the chat answered 502");
    });

    expect(await run(later(), down)).toMatchObject({ queued: 2, sent: 0, failed: 0 });
    expect(down).toHaveBeenCalledTimes(1);
    for (let i = 1; i < MAX_CHAT_ATTEMPTS; i++) await run(later(), down);
    const rows = await db.select().from(chatNotices);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "pending"]);

    // Back up: the other one still goes.
    expect(await run()).toMatchObject({ sent: 1 });
    expect(posts).toHaveLength(1);
  });

  it("skips what has waited more than 48 hours", async () => {
    await propose(db, lena, (await openTask()).id, plan);
    await run(later(), async () => {
      throw new Error("down");
    });
    expect(await run(later(49 * 3_600_000))).toMatchObject({ sent: 0, skipped: 1 });
    expect(posts).toEqual([]);
  });

  it("posts the HTML to the bot URL", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const url = "https://chat.novawerk.io/rooms/3/7-abcDEF123456/messages";
    await chatBotPoster(url, fetchImpl as unknown as typeof fetch)("<strong>hi</strong>");
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.objectContaining({ method: "POST", body: "<strong>hi</strong>" }));

    const refused = vi.fn(async () => new Response(null, { status: 404 }));
    const error = await chatBotPoster(url, refused as unknown as typeof fetch)("x").catch((e: Error) => e);
    expect(String(error)).toContain("404");
    // The key stays out of errors (they are logged).
    expect(String(error)).not.toContain("abcDEF");
  });
});

describe("over HTTP and in the env", () => {
  it("runs on GET /cron/chat-notices with the cron secret", async () => {
    await propose(db, lena, (await openTask()).id, plan);
    const { app: off } = makeApp(db, { env: { cronSecret: CRON_SECRET } });
    const auth = { headers: { Authorization: `Bearer ${CRON_SECRET}` } };
    expect((await off.request("/cron/chat-notices")).status).toBe(401);
    expect(await (await off.request("/cron/chat-notices", auth)).json()).toEqual({ configured: false });

    const { app } = makeApp(db, { env: { cronSecret: CRON_SECRET }, postToChat: post });
    const res = await app.request("/cron/chat-notices", auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ configured: true, queued: 1, sent: 1 });
    expect(posts[0]).toContain('href="https://admin.novawerk.io/proposals"');
  });

  it("reads CHAT_BOT_URL, and refuses anything but a bot's messages URL", () => {
    const base = { DATABASE_URL: "postgres://x", GOOGLE_CLIENT_ID: "id", SESSION_SECRET: "s".repeat(32) };
    const url = "https://chat.novawerk.io/rooms/3/7-abcDEF123456/messages";
    expect(readEnv({ ...base, CHAT_BOT_URL: url }).chatBotUrl).toBe(url);
    expect(readEnv(base).chatBotUrl).toBeUndefined();
    expect(readEnv({ ...base, CHAT_BOT_URL: "http://localhost:3000/rooms/1/2-abc/messages" }).chatBotUrl).toBeDefined();
    for (const bad of ["http://chat.novawerk.io/rooms/3/7-abc/messages", "https://chat.novawerk.io/rooms/3", "not a url"]) {
      expect(() => readEnv({ ...base, CHAT_BOT_URL: bad })).toThrow(/CHAT_BOT_URL/);
    }
  });
});
