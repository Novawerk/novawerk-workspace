// The Intake Agent chat end to end: real migrations on PGlite, a scripted MockProvider, the
// real routes, tools and SSE stream.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { MockProvider, type MockStep, type ToolCall } from "@nw/agent-harness";
import type { IntakeEvent, IntakeSession } from "@nw/contracts";
import { agentMessages, agentSessions, agentTraces, memberApplications, projectSubmissions, type Database } from "@nw/db";

import type { IntakeChatOptions, IntakeRef } from "../src/types.js";
import { createTestDb, makeApp, postJson, resetDb, validApplication, validSubmission } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const say =
  (text: string): MockStep =>
  () => ({ text, toolCalls: [] });

const call =
  (...calls: Omit<ToolCall, "id">[]): MockStep =>
  () => ({ text: "", toolCalls: calls.map((c, i) => ({ id: `call_${c.name}_${i}`, ...c })) });

function setup(script: MockStep[] = [], opts: Partial<IntakeChatOptions> & { ip?: string } = {}) {
  const provider = new MockProvider(script);
  const triggered: IntakeRef[] = [];
  const { ip = "203.0.113.7", ...chatOpts } = opts;
  const made = makeApp(db, {
    intakeChat: { provider, ...chatOpts },
    triggerIntake: async (ref) => void triggered.push(ref),
  });
  const { app } = made;
  const headers = { "Content-Type": "application/json", "X-Forwarded-For": ip };

  const start = async (body: unknown = {}) => {
    const res = await app.request("/public/intake/sessions", { method: "POST", headers, body: JSON.stringify(body) });
    expect(res.status).toBe(201);
    return (await res.json()) as IntakeSession;
  };
  const get = async (id: string) => (await (await app.request(`/public/intake/sessions/${id}`)).json()) as IntakeSession;
  const send = (id: string, text: string) =>
    app.request(`/public/intake/sessions/${id}/messages`, { method: "POST", headers, body: JSON.stringify({ text }) });
  const turn = async (id: string, text: string) => {
    const res = await send(id, text);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    return parseSSE(await res.text());
  };
  const patch = (id: string, body: unknown) =>
    app.request(`/public/intake/sessions/${id}/draft`, { method: "PATCH", headers, body: JSON.stringify(body) });
  const submit = (id: string, body: unknown) =>
    app.request(`/public/intake/sessions/${id}/submit`, { method: "POST", headers, body: JSON.stringify(body) });
  const row = async (id: string) => (await db.select().from(agentSessions).where(eq(agentSessions.id, id)))[0]!;

  return { ...made, provider, triggered, start, get, send, turn, patch, submit, row };
}

/** One JSON IntakeEvent per `data:` line; comments (pings) and blank lines are skipped. */
function parseSSE(text: string): IntakeEvent[] {
  expect(text).not.toMatch(/^event:/m);
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)) as IntakeEvent);
}

const types = (events: IntakeEvent[]) => events.map((e) => e.type);

const { consent: _c, ...pitchFields } = validSubmission;
const { consent: _c2, ...joinFields } = validApplication;

async function waitFor(check: () => Promise<boolean>, ms = 2000) {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("Intake Agent: availability", () => {
  it("answers 503 on every route when no provider is configured", async () => {
    const { app } = makeApp(db);
    const res = await app.request("/public/intake/sessions", postJson({ mode: "pitch" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/switched off/);
    expect((await app.request("/public/intake/sessions/00000000-0000-4000-8000-000000000000")).status).toBe(503);
    // The rest of the API is unaffected.
    expect((await app.request("/health")).status).toBe(200);
  });

  it("names the reason when the env switched it off", async () => {
    const { app, logger } = makeApp(db, { intakeChat: { unavailable: "LLM provider \"anthropic\" needs an API key" } });
    const res = await app.request("/public/intake/sessions", postJson({}));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("needs an API key");
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("POST /public/intake/sessions", () => {
  it.each([
    ["pitch", "pitch", /what do you want to build/],
    ["join", "join", /what do you do/],
    [undefined, null, /Which one brings you here/],
  ] as const)("mode %s: frozen system prompt, static greeting, no model call", async (mode, expected, greeting) => {
    const t = setup();
    const session = await t.start(mode ? { mode } : {});

    expect(session).toMatchObject({ status: "open", turnsLeft: 40, draft: { mode: expected, pitch: {}, join: {} } });
    expect(session.messages).toHaveLength(1);
    const [hello] = session.messages;
    expect(hello?.role).toBe("assistant");
    expect(hello?.role === "assistant" && hello.parts).toEqual([{ type: "text", text: expect.stringMatching(greeting) }]);
    expect(t.provider.requests).toHaveLength(0);

    const stored = await t.row(session.id);
    expect(stored.agent).toBe("intake");
    expect(stored.systemPrompt).toContain("You are Novawerk's assistant on novawerk.io");
    expect(stored.systemPrompt).toContain('"developer" (Developer)');
    expect(stored.systemPrompt).not.toContain("{{");
    expect(stored.systemPrompt).not.toContain("<!--");
  });

  it("drops a honeypot hit with 204 and stores nothing", async () => {
    const t = setup();
    const res = await t.app.request("/public/intake/sessions", postJson({ mode: "pitch", website: "spam.example" }));
    expect(res.status).toBe(204);
    expect(await db.select().from(agentSessions)).toEqual([]);
  });

  it("rejects an unknown mode", async () => {
    const t = setup();
    const res = await t.app.request("/public/intake/sessions", postJson({ mode: "invest" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: Record<string, string[]> }).issues).toHaveProperty("mode");
  });

  it("limits new sessions per IP", async () => {
    const t = setup([], { sessionsPerHour: 2 });
    await t.start();
    await t.start();
    const third = await t.app.request("/public/intake/sessions", postJson({}, { "X-Forwarded-For": "203.0.113.7" }));
    expect(third.status).toBe(429);
    const other = await t.app.request("/public/intake/sessions", postJson({}, { "X-Forwarded-For": "198.51.100.1" }));
    expect(other.status).toBe(201);
  });
});

describe("GET /public/intake/sessions/:id", () => {
  it("is 404 for unknown and malformed ids", async () => {
    const t = setup();
    expect((await t.app.request("/public/intake/sessions/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await t.app.request("/public/intake/sessions/not-a-uuid")).status).toBe(404);
  });

  // A session started before the prompts were reworded.
  async function staleSession(t: ReturnType<typeof setup>, mode: "pitch" | "join") {
    const session = await t.start({ mode });
    await db.update(agentSessions).set({ systemPrompt: "Old system prompt." }).where(eq(agentSessions.id, session.id));
    await db
      .update(agentMessages)
      .set({ payload: { role: "assistant", text: "Hi, I'm the old greeting.", toolCalls: [] } })
      .where(eq(agentMessages.sessionId, session.id));
    return session;
  }

  const greetingOf = (session: IntakeSession) => {
    const [hello] = session.messages;
    return hello?.role === "assistant" && hello.parts[0]?.type === "text" ? hello.parts[0].text : undefined;
  };

  it("gives an untouched session the current greeting and system prompt", async () => {
    const t = setup();
    const { id } = await staleSession(t, "join");

    const resumed = await t.get(id);
    expect(resumed.messages).toHaveLength(1);
    expect(greetingOf(resumed)).toMatch(/what do you do/);
    expect((await t.row(id)).systemPrompt).toContain("You are Novawerk's assistant on novawerk.io");
  });

  it("keeps the frozen prompts once the visitor wrote or edited the panel", async () => {
    const t = setup([say("Tell me more.")]);
    const wrote = await staleSession(t, "pitch");
    await t.turn(wrote.id, "A map of quiet cafés.");
    const edited = await staleSession(t, "pitch");
    await t.patch(edited.id, { pitch: { projectName: "Quiet cafés" } });

    for (const { id } of [wrote, edited]) {
      expect(greetingOf(await t.get(id))).toBe("Hi, I'm the old greeting.");
      expect((await t.row(id)).systemPrompt).toBe("Old system prompt.");
    }
  });
});

describe("POST /public/intake/sessions/:id/messages", () => {
  it("streams a turn that calls update_draft: draft event, persisted draft, display history", async () => {
    const t = setup([
      call({ name: "update_draft", args: { mode: "pitch", pitch: { product: "A map of bouldering routes for local crags" } } }),
      say("Nice. Who would use it, and how?"),
    ]);
    const session = await t.start();
    const events = await t.turn(session.id, "I want to build a map of bouldering routes");

    expect(types(events)).toEqual([
      "turn_start",
      "tool_call",
      "draft",
      "tool_result",
      ...Array(types(events).filter((x) => x === "text_delta").length).fill("text_delta"),
      "turn_end",
    ]);
    const draftEvent = events.find((e) => e.type === "draft");
    expect(draftEvent).toEqual({
      type: "draft",
      draft: { mode: "pitch", pitch: { product: "A map of bouldering routes for local crags" }, join: {} },
    });
    expect(events.find((e) => e.type === "tool_result")).toEqual({
      type: "tool_result",
      id: "call_update_draft_0",
      name: "update_draft",
      isError: false,
    });
    const text = events.flatMap((e) => (e.type === "text_delta" ? [e.text] : [])).join("");
    expect(text).toBe("Nice. Who would use it, and how?");
    const start = events[0] as Extract<IntakeEvent, { type: "turn_start" }>;
    expect(events.at(-1)).toEqual({ type: "turn_end", turnId: start.turnId });

    // What the model saw: the frozen prompt, the greeting first, the context block on the user message.
    const [first] = t.provider.requests;
    expect(first!.system).toBe((await t.row(session.id)).systemPrompt);
    expect(first!.tools.map((x) => x.name)).toEqual(["update_draft", "review_draft"]);
    expect(first!.messages[0]).toMatchObject({ role: "assistant" });
    const user = first!.messages[1]!;
    expect(user.role === "user" && user.context).toContain('<draft mode="not chosen">');
    expect(user.role === "user" && user.context).toContain("Visitor messages left after this one: 39");
    expect(user.role === "user" && user.context).toContain("<reminder>");

    const after = await t.get(session.id);
    expect(after.draft.pitch.product).toBe("A map of bouldering routes for local crags");
    expect(after.turnsLeft).toBe(39);
    expect(after.messages.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect(after.messages[1]).toMatchObject({ role: "user", text: "I want to build a map of bouldering routes" });
    const reply = after.messages[2]!;
    expect(reply.role === "assistant" && reply.parts).toEqual([
      { type: "tool", id: "call_update_draft_0", name: "update_draft", status: "done" },
      { type: "text", text: "Nice. Who would use it, and how?" },
    ]);

    // The trace is saved; the lock is released.
    expect(await db.select().from(agentTraces)).toHaveLength(1);
    expect((await t.row(session.id)).turnLockedUntil).toBeNull();
  });

  it("returns invalid update_draft arguments to the model as an error and keeps the draft", async () => {
    const t = setup([call({ name: "update_draft", args: { join: { availability: "lots" } } }), say("Sorry, how many hours?")]);
    const session = await t.start({ mode: "join" });
    const events = await t.turn(session.id, "I have lots of time");
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ isError: true });
    expect(events.some((e) => e.type === "draft")).toBe(false);
    expect((await t.get(session.id)).draft.join).toEqual({});
    const toolMsg = t.provider.requests[1]!.messages.at(-1)!;
    expect(toolMsg.role === "tool" && toolMsg.content).toContain("Invalid arguments");
  });

  it("review_draft lists gaps, then says ready and reminds about consent and Send", async () => {
    const t = setup([call({ name: "review_draft", args: {} }), say("A few things left."), call({ name: "review_draft", args: {} }), say("Ready.")]);
    const session = await t.start({ mode: "join" });
    await t.patch(session.id, { join: { name: "Grace Hopper", email: "grace@example.com" } });
    await t.turn(session.id, "Is it ready?");
    const gaps = t.provider.requests[1]!.messages.at(-1)!;
    expect(gaps.role === "tool" && gaps.content).toContain("✓ name");
    expect(gaps.role === "tool" && gaps.content).toContain("✗ motivation");
    expect(gaps.role === "tool" && gaps.content).toContain("Not ready yet");

    await t.patch(session.id, { join: joinFields });
    await t.turn(session.id, "Now?");
    const ready = t.provider.requests[3]!.messages.at(-1)!;
    expect(ready.role === "tool" && ready.content).toContain("Ready to send. You cannot send it");
    expect(ready.role === "tool" && ready.content).toContain("tick the privacy consent box and press Send");
    // Still open: only the visitor can send.
    expect((await t.row(session.id)).status).toBe("open");
  });

  it("puts the visitor's panel edits into the next turn's context", async () => {
    const t = setup([
      call({ name: "update_draft", args: { mode: "pitch", pitch: { product: "A map of bouldering routes for local crags" } } }),
      say("Got it."),
      say("Thanks for adding the team."),
    ]);
    const session = await t.start({ mode: "pitch" });
    await t.turn(session.id, "A bouldering map");
    const res = await t.patch(session.id, { pitch: { team: "Ada plus two climbers who code" } });
    expect(res.status).toBe(200);
    const patched = (await res.json()) as IntakeSession;
    expect(patched.draft.pitch).toEqual({
      product: "A map of bouldering routes for local crags",
      team: "Ada plus two climbers who code",
    });

    await t.turn(session.id, "I added the team in the panel");
    const user = t.provider.requests.at(-1)!.messages.at(-1)!;
    expect(user.role === "user" && user.context).toContain("Ada plus two climbers who code");
    expect(user.role === "user" && user.context).not.toContain("- team:");
  });

  it("answers 409 while a turn is running, then accepts the next message", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([
      async () => {
        await gate;
        return { text: "First answer.", toolCalls: [] };
      },
      say("Second answer."),
    ]);
    const session = await t.start({ mode: "pitch" });
    const first = await t.send(session.id, "one");
    expect(first.status).toBe(200);

    const second = await t.send(session.id, "two");
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toMatch(/still answering/);

    release();
    expect(types(parseSSE(await first.text())).at(-1)).toBe("turn_end");
    expect(types(await t.turn(session.id, "three"))).toContain("text_delta");
    // The refused message was not counted.
    expect((await t.get(session.id)).turnsLeft).toBe(38);
  });

  it("answers 429 when the session is out of turns", async () => {
    const t = setup([say("Hi.")], { maxTurns: 1 });
    const session = await t.start({ mode: "pitch" });
    await t.turn(session.id, "one");
    expect((await t.get(session.id)).turnsLeft).toBe(0);
    const res = await t.send(session.id, "two");
    expect(res.status).toBe(429);
    expect(t.provider.requests).toHaveLength(1);
  });

  it("validates the message", async () => {
    const t = setup();
    const session = await t.start();
    expect((await t.send(session.id, "   ")).status).toBe(400);
    expect((await t.send(session.id, "x".repeat(4001))).status).toBe(400);
    expect((await t.send("00000000-0000-4000-8000-000000000000", "hi")).status).toBe(404);
  });

  it("reports a model failure as a friendly error, logs the detail and releases the lock", async () => {
    const t = setup([
      () => {
        throw new Error("401 Authentication Fails (invalid api key)");
      },
    ]);
    const session = await t.start({ mode: "pitch" });
    const events = await t.turn(session.id, "hello");
    expect(types(events)).toEqual(["turn_start", "error", "turn_end"]);
    const error = events[1] as Extract<IntakeEvent, { type: "error" }>;
    expect(error.message).toMatch(/couldn't answer just now/);
    expect(error.message).not.toContain("api key");
    expect(t.logger.error).toHaveBeenCalledWith(expect.stringContaining("invalid api key"));
    expect((await t.row(session.id)).turnLockedUntil).toBeNull();
  });

  it("aborts the model call when the client disconnects and releases the lock", async () => {
    let started!: () => void;
    const running = new Promise<void>((r) => (started = r));
    const t = setup([
      async (req) => {
        started();
        await new Promise((r) => req.signal?.addEventListener("abort", r, { once: true }));
        return { text: "too late", toolCalls: [] };
      },
    ]);
    const session = await t.start({ mode: "pitch" });
    const res = await t.send(session.id, "hello");
    await running;
    await res.body!.cancel();

    await waitFor(async () => (await t.row(session.id)).turnLockedUntil === null);
    await waitFor(async () => (await db.select().from(agentTraces)).length === 1);
    const [trace] = await db.select().from(agentTraces);
    expect((trace!.payload as { error: string }).error).toBe("aborted");
  });
});

describe("PATCH /public/intake/sessions/:id/draft", () => {
  it("merges fields, sets the mode and validates limits", async () => {
    const t = setup();
    const session = await t.start();
    await t.patch(session.id, { mode: "join", join: { name: "Grace" } });
    const res = await t.patch(session.id, { join: { city: "Berlin" } });
    expect(((await res.json()) as IntakeSession).draft).toEqual({ mode: "join", pitch: {}, join: { name: "Grace", city: "Berlin" } });

    const bad = await t.patch(session.id, { join: { background: "x".repeat(301) } });
    expect(bad.status).toBe(400);
    expect((await t.patch("00000000-0000-4000-8000-000000000000", {})).status).toBe(404);
  });
});

describe("POST /public/intake/sessions/:id/submit", () => {
  it("sends a pitch like the plain form: row, notification, wake-up, session submitted", async () => {
    const t = setup();
    const session = await t.start({ mode: "pitch" });
    await t.patch(session.id, { pitch: pitchFields });

    const res = await t.submit(session.id, { consent: true });
    expect(res.status).toBe(201);
    const { ok, id } = (await res.json()) as { ok: true; id: string };
    expect(ok).toBe(true);

    const [row] = await db.select().from(projectSubmissions);
    expect(row).toMatchObject({ id, name: "Ada Lovelace", projectName: "Bouldering routes", links: "https://example.com/deck" });
    expect(row!.consentAt).toBeInstanceOf(Date);
    expect(t.notify).toHaveBeenCalledOnce();
    expect(t.sent[0]?.subject).toBe("New project pitch: Bouldering routes");
    expect(t.triggered).toEqual([{ table: "project_submissions", id }]);

    const stored = await t.row(session.id);
    expect(stored).toMatchObject({ status: "submitted", submissionId: id, applicationId: null });
    expect((await t.get(session.id)).status).toBe("submitted");
  });

  it("sends a member application with consent", async () => {
    const t = setup();
    const session = await t.start({ mode: "join" });
    await t.patch(session.id, { join: joinFields });

    const res = await t.submit(session.id, { consent: true });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await db.select().from(memberApplications);
    expect(row).toMatchObject({ id, name: "Grace Hopper", functions: ["developer", "research"], availability: "2to5", links: null });
    expect(t.sent[0]?.subject).toBe("New member application: Grace Hopper");
    expect(t.triggered).toEqual([{ table: "member_applications", id }]);
    expect(await t.row(session.id)).toMatchObject({ status: "submitted", applicationId: id });
  });

  it("answers 400 with the missing fields and stores nothing", async () => {
    const t = setup();
    const session = await t.start({ mode: "pitch" });
    await t.patch(session.id, { pitch: { name: "Ada", email: "not-an-email", product: "short" } });
    const res = await t.submit(session.id, { consent: true });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: Record<string, string[]> };
    expect(body.error).toBe("Validation failed");
    expect(Object.keys(body.issues).sort()).toEqual(
      ["email", "product", "projectName", "referencesAndInnovation", "team", "timeline", "userJourney"].sort(),
    );
    expect(body.issues.product?.[0]).toMatch(/20\+ characters/);
    expect(await db.select().from(projectSubmissions)).toEqual([]);
    expect((await t.row(session.id)).status).toBe("open");
  });

  it("asks to pick a mode first", async () => {
    const t = setup();
    const session = await t.start();
    const res = await t.submit(session.id, { consent: true });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: Record<string, string[]> }).issues).toHaveProperty("mode");
  });

  it("needs consent", async () => {
    const t = setup();
    const pitch = await t.start({ mode: "pitch" });
    await t.patch(pitch.id, { pitch: pitchFields });
    const noConsent = await t.submit(pitch.id, {});
    expect(noConsent.status).toBe(400);
    expect(((await noConsent.json()) as { issues: Record<string, string[]> }).issues).toEqual({
      consent: ["Please accept the privacy note so we can contact you"],
    });

    const join = await t.start({ mode: "join" });
    await t.patch(join.id, { join: joinFields });
    const joinNoConsent = await t.submit(join.id, { consent: false });
    expect(joinNoConsent.status).toBe(400);
    expect(((await joinNoConsent.json()) as { issues: Record<string, string[]> }).issues).toEqual({
      consent: ["Please accept the privacy note so we can contact you"],
    });
    expect(await db.select().from(projectSubmissions)).toEqual([]);
    expect(await db.select().from(memberApplications)).toEqual([]);
  });

  it("closes the session after Send: 410 on messages, edits and a second Send", async () => {
    const t = setup();
    const session = await t.start({ mode: "pitch" });
    await t.patch(session.id, { pitch: pitchFields });
    expect((await t.submit(session.id, { consent: true })).status).toBe(201);

    expect((await t.send(session.id, "one more thing")).status).toBe(410);
    expect((await t.patch(session.id, { pitch: { team: "changed my mind" } })).status).toBe(410);
    expect((await t.submit(session.id, { consent: true })).status).toBe(410);
    expect(await db.select().from(projectSubmissions)).toHaveLength(1);
    expect(t.notify).toHaveBeenCalledOnce();
  });

  it("refuses update_draft after Send", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([
      async () => {
        await gate;
        return { text: "", toolCalls: [{ id: "late", name: "update_draft", args: { pitch: { team: "late edit" } } }] };
      },
      say("Ok."),
    ]);
    const session = await t.start({ mode: "pitch" });
    await t.patch(session.id, { pitch: pitchFields });
    const streaming = await t.send(session.id, "add the team");
    expect((await t.submit(session.id, { consent: true })).status).toBe(201);
    release();
    const events = parseSSE(await streaming.text());
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ isError: true });
    expect((await t.row(session.id)).draft).toMatchObject({ pitch: { team: pitchFields.team } });
  });
});

describe("display history", () => {
  it("hides tool results and context, merges a multi-step turn into one bubble", async () => {
    const t = setup([
      () => ({
        text: "Let me note that.",
        toolCalls: [{ id: "u1", name: "update_draft", args: { mode: "pitch", pitch: { projectName: "Crags" } } }],
      }),
      call({ name: "review_draft", args: {} }),
      say("Saved. What problem does it solve?"),
    ]);
    const session = await t.start();
    await t.turn(session.id, "Call it Crags");
    const { messages } = await t.get(session.id);
    expect(messages).toHaveLength(3);
    const bubble = messages[2]!;
    expect(bubble.role === "assistant" && bubble.parts).toEqual([
      { type: "text", text: "Let me note that." },
      { type: "tool", id: "u1", name: "update_draft", status: "done" },
      { type: "tool", id: "call_review_draft_0", name: "review_draft", status: "done" },
      { type: "text", text: "Saved. What problem does it solve?" },
    ]);
    expect(JSON.stringify(messages)).not.toContain("<context>");
    expect(JSON.stringify(messages)).not.toContain("Mode: pitch");
  });
});

describe("dev mock", () => {
  it("fills the next missing field from each message", async () => {
    const { intakeMockStep } = await import("../src/intake-chat/mock.js");
    const provider = new MockProvider({ demo: intakeMockStep, chunkDelayMs: 0 });
    const made = makeApp(db, { intakeChat: { provider } });
    const res = await made.app.request("/public/intake/sessions", postJson({}));
    const session = (await res.json()) as IntakeSession;
    const sendText = async (text: string) =>
      parseSSE(await (await made.app.request(`/public/intake/sessions/${session.id}/messages`, postJson({ text }))).text());

    const first = await sendText("I want to join as a member");
    expect(first.find((e) => e.type === "draft")).toMatchObject({ draft: { mode: "join" } });
    const second = await sendText("Grace");
    expect(second.find((e) => e.type === "draft")).toMatchObject({ draft: { join: { name: "Grace" } } });
    // Not an email: a placeholder, so the next message goes on to the next field.
    const third = await sendText("I build things");
    expect(third.find((e) => e.type === "draft")).toMatchObject({ draft: { join: { email: "visitor@example.com" } } });
  });
});
