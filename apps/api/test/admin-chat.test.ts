// The admin assistant end to end: real migrations on PGlite, a scripted MockProvider, the real
// routes, tools and SSE stream. It reads, and its one write is a pending outbox row.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MockProvider, type MockStep, type ToolCall } from "@nw/agent-harness";
import type { AdminChatEvent, AdminChatSession } from "@nw/contracts";
import { agentSessions, members, outbox, partners, projectSubmissions, type Database } from "@nw/db";

import { createAdminTools } from "../src/admin-chat/tools.js";
import type { AdminChatOptions } from "../src/types.js";
import { TEST_MEMBERS, adminFetch, createTestDb, makeApp, resetDb, sessionCookie } from "./helpers.js";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: sendMock }; } }));

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  sendMock.mockReset();
  await resetDb(db);
  await db.insert(members).values([
    ...TEST_MEMBERS,
    { id: "mara", handle: "mara", displayName: "Mara", email: "mara@novawerk.io", role: "maintainer" },
  ]);
});

const say =
  (text: string): MockStep =>
  () => ({ text, toolCalls: [] });
const call =
  (...calls: Omit<ToolCall, "id">[]): MockStep =>
  () => ({ text: "", toolCalls: calls.map((c, i) => ({ id: `call_${c.name}_${i}`, ...c })) });

function parseSSE(text: string): AdminChatEvent[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as AdminChatEvent);
}

function setup(script: MockStep[] = [], opts: Partial<AdminChatOptions> = {}) {
  const provider = new MockProvider(script);
  const { app } = makeApp(db, {
    adminChat: { provider, ...opts },
    outbox: { from: "Novawerk <info@novawerk.io>", resendApiKey: "re_test" },
  });
  const start = async (memberId = "ada") => {
    const res = await adminFetch(app, "POST", "/admin/chat/sessions", undefined, memberId);
    expect(res.status).toBe(201);
    return (await res.json()) as AdminChatSession;
  };
  const send = (id: string, body: unknown, memberId = "ada") =>
    adminFetch(app, "POST", `/admin/chat/sessions/${id}/messages`, body, memberId);
  const turn = async (id: string, body: unknown) => {
    const res = await send(id, body);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    return parseSSE(await res.text());
  };
  return { app, provider, start, send, turn };
}

async function insertPitch() {
  const [row] = await db
    .insert(projectSubmissions)
    .values({
      name: "Lena Hoffmann",
      email: "lena@example.org",
      projectName: "Kiez Pantry",
      product: "Surplus food from small shops",
      userJourney: "u",
      referencesAndInnovation: "r",
      team: "t",
      timeline: "tl",
      consentAt: new Date(),
    })
    .returning();
  return row!;
}

describe("/admin/chat", () => {
  it("answers 503 when no model is configured, and 401 without a session", async () => {
    const { app } = makeApp(db, { adminChat: { unavailable: "no key" } });
    const off = await adminFetch(app, "POST", "/admin/chat/sessions");
    expect(off.status).toBe(503);
    expect(((await off.json()) as { error: string }).error).toContain("no key");
    expect((await adminFetch(makeApp(db).app, "POST", "/admin/chat/sessions")).status).toBe(503);
    expect((await adminFetch(app, "POST", "/admin/chat/sessions", undefined, null)).status).toBe(401);
  });

  it("a chat belongs to the member who started it", async () => {
    const { app, start, send } = setup([say("hi")]);
    const session = await start("ada");
    const [row] = await db.select().from(agentSessions).where(eq(agentSessions.id, session.id));
    expect(row).toMatchObject({ agent: "admin-assistant", memberId: "ada", status: "open" });

    expect((await adminFetch(app, "GET", `/admin/chat/sessions/${session.id}`, undefined, "ada")).status).toBe(200);
    expect((await adminFetch(app, "GET", `/admin/chat/sessions/${session.id}`, undefined, "mara")).status).toBe(404);
    expect((await send(session.id, { text: "hello" }, "mara")).status).toBe(404);
  });

  it("looks things up, drafts into the outbox as pending, and never sends", async () => {
    const pitch = await insertPitch();
    const { provider, start, turn, app } = setup([
      call({ name: "get_submission", args: { id: pitch.id } }),
      call({
        name: "draft_email",
        args: {
          to: "lena@example.org",
          subject: "Your Novawerk pitch: Kiez Pantry",
          body: "Hi Lena,\n\nWe like it.\n\nNovawerk",
          relatedTable: "project_submissions",
          relatedId: pitch.id,
        },
      }),
      say("I drafted a reply. It waits in the outbox for approval."),
    ]);
    const session = await start();
    const events = await turn(session.id, { text: "Draft a reply to this pitch", subject: { kind: "submission", id: pitch.id } });

    expect(events.map((e) => e.type)).toEqual([
      "turn_start",
      "tool_call",
      "tool_result",
      "tool_call",
      "tool_result",
      "text_delta",
      ...events.slice(6, -1).map(() => "text_delta"),
      "turn_end",
    ]);
    const lookup = events.find((e) => e.type === "tool_result" && e.name === "get_submission");
    expect(lookup).toMatchObject({ isError: false, output: expect.stringContaining("Kiez Pantry") });

    // The context told the model which pitch is open and who is asking.
    const firstUser = provider.requests[0]!.messages.at(-1)!;
    expect(firstUser.role === "user" && firstUser.context).toContain('pitch "Kiez Pantry" by Lena Hoffmann');
    expect(firstUser.role === "user" && firstUser.context).toContain("Ada (member id ada)");

    const rows = await db.select().from(outbox);
    expect(rows).toEqual([
      expect.objectContaining({
        status: "pending",
        to: "lena@example.org",
        draftedBy: "assistant:ada",
        relatedTable: "project_submissions",
        relatedId: pitch.id,
        approvedBy: null,
      }),
    ]);
    expect(sendMock).not.toHaveBeenCalled();

    // Reload shows one bubble with both tool parts and the text.
    const reloaded = (await (await adminFetch(app, "GET", `/admin/chat/sessions/${session.id}`)).json()) as AdminChatSession;
    expect(reloaded.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const bubble = reloaded.messages[1]!;
    expect(bubble.role === "assistant" && bubble.parts.map((p) => (p.type === "tool" ? `${p.name}:${p.status}` : "text"))).toEqual([
      "get_submission:done",
      "draft_email:done",
      "text",
    ]);
    expect(reloaded.messages[0]).toMatchObject({ role: "user", text: "Draft a reply to this pitch" });
  });

  it("draft_email refuses bad addresses and unknown records, as an error the model sees", async () => {
    const { start, turn } = setup([
      call(
        { name: "draft_email", args: { to: "Lena <lena@example.org>", subject: "Hi", body: "x" } },
        { name: "draft_email", args: { to: "a@example.org", subject: "Hi", body: "x", relatedTable: "partners", relatedId: "nobody" } },
      ),
      say("Sorry."),
    ]);
    const session = await start();
    const events = await turn(session.id, { text: "draft something" });
    const results = events.filter((e) => e.type === "tool_result");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.type === "tool_result" && r.isError)).toBe(true);
    expect(await db.select().from(outbox)).toEqual([]);
  });

  it("lists partners, members and pitches without leaking emails in lists", async () => {
    await insertPitch();
    await db.insert(partners).values({ id: "acme", name: "Acme", primaryEmail: "jane@acme.example.org" });
    const { start, turn } = setup([
      call({ name: "list_submissions", args: {} }, { name: "list_members", args: {} }, { name: "list_partners", args: {} }),
      say("Done."),
    ]);
    const session = await start();
    const events = await turn(session.id, { text: "What's new?" });
    const out = Object.fromEntries(
      events.flatMap((e) => (e.type === "tool_result" ? [[e.name, e.output]] : [])),
    ) as Record<string, string>;
    expect(out.list_submissions).toContain("Kiez Pantry");
    expect(out.list_submissions).not.toContain("lena@example.org");
    expect(out.list_members).toContain('"id":"ada"');
    expect(out.list_members).not.toContain("linus"); // inactive by default
    expect(out.list_partners).toContain("jane@acme.example.org");
  });

  it("has no tool that changes records other than queueing a draft", () => {
    expect(createAdminTools().specs().map((s) => s.name)).toEqual([
      "list_submissions",
      "get_submission",
      "list_applications",
      "get_application",
      "list_members",
      "list_partners",
      "list_projects",
      "draft_email",
    ]);
  });

  it("validates the message and stops at the turn limit", async () => {
    const { start, send, turn } = setup([say("one")], { maxTurns: 1 });
    const session = await start();
    expect((await send(session.id, { text: "  " })).status).toBe(400);
    expect((await send(session.id, { text: "hi", subject: { kind: "submission", id: "nope" } })).status).toBe(400);
    await turn(session.id, { text: "first" });
    expect((await send(session.id, { text: "second" })).status).toBe(429);
  });

  it("reports a model failure as a friendly error and frees the session", async () => {
    const failing: MockStep = () => {
      throw new Error("upstream 500");
    };
    const { start, turn } = setup([failing, say("back")]);
    const session = await start();
    const first = await turn(session.id, { text: "hi" });
    expect(first).toContainEqual({ type: "error", message: expect.stringContaining("couldn't answer") });
    const second = await turn(session.id, { text: "again" });
    expect(second.some((e) => e.type === "text_delta")).toBe(true);
  });

  it("only signed-in admins reach it", async () => {
    const { app } = setup();
    const res = await app.request("/admin/chat/sessions", {
      method: "POST",
      headers: { Cookie: await sessionCookie("grace") },
    });
    expect(res.status).toBe(403);
  });
});
