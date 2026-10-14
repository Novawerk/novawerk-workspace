// The whole loop against a scripted MockProvider and the in-memory store. No network.

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { Agent, SessionBusyError, SessionNotFoundError } from "./agent.js";
import type { AgentEvent } from "./events.js";
import { MockProvider, type MockStep } from "./llm/mock.js";
import type { ToolCall } from "./llm/types.js";
import { MemoryAgentStore } from "./store.js";
import { ToolRegistry, defineTool, type ToolContext } from "./tools.js";

interface App {
  notes: string[];
}

const addNote = defineTool({
  name: "add_note",
  description: "Remember a note.",
  schema: z.object({ note: z.string().min(1) }),
  run({ note }, ctx: ToolContext<App>) {
    ctx.app.notes.push(note);
    return `Noted: ${note}`;
  },
});

const explode = defineTool({
  name: "explode",
  description: "Always fails.",
  schema: z.object({}),
  run() {
    throw new Error("boom");
  },
});

const say =
  (text: string): MockStep =>
  () => ({ text, toolCalls: [] });

const call =
  (...calls: Omit<ToolCall, "id">[]): MockStep =>
  () => ({ text: "", toolCalls: calls.map((c, i) => ({ id: `call_${c.name}_${i}`, ...c })) });

function setup(script: MockStep[], opts: { maxSteps?: number } = {}) {
  const provider = new MockProvider(script);
  const store = new MemoryAgentStore();
  const tools = new ToolRegistry<App>([addNote, explode]);
  const agent = new Agent<App>({ store, provider, tools, ...opts });
  const session = store.createSession("s1", "You are a test agent.");
  const app: App = { notes: [] };
  const events: AgentEvent[] = [];
  const run = (userText: string, extra: { context?: string; signal?: AbortSignal } = {}) =>
    agent.runTurn({ sessionId: session.id, userText, app, emit: (e) => events.push(e), ...extra });
  const roles = () => store.messages.get("s1")!.map((m) => m.message.role);
  const toolResults = () =>
    events.filter((e): e is Extract<AgentEvent, { type: "tool_result" }> => e.type === "tool_result");
  return { provider, store, agent, app, events, run, roles, toolResults };
}

describe("Agent.runTurn", () => {
  it("answers in plain text: events, history and trace", async () => {
    const t = setup([say("Hello there.")]);
    const trace = await t.run("Hi", { context: "<context>now</context>" });

    expect(trace.error).toBeNull();
    expect(t.events[0]).toEqual({ type: "turn_start", turnId: trace.id });
    expect(t.events.at(-1)).toMatchObject({ type: "turn_end", turnId: trace.id, steps: 1, aborted: false });
    const text = t.events.flatMap((e) => (e.type === "text_delta" ? [e.text] : [])).join("");
    expect(text).toBe("Hello there.");

    expect(t.roles()).toEqual(["user", "assistant"]);
    expect(t.store.messages.get("s1")![0]!.message).toEqual({ role: "user", text: "Hi", context: "<context>now</context>" });
    expect(t.provider.requests[0]!.system).toBe("You are a test agent.");
    expect(trace.steps.map((s) => s.kind)).toEqual(["model"]);
    expect(t.store.traces).toHaveLength(1);
    expect((await t.store.getSession("s1"))!.lastInputTokens).toBeGreaterThan(0);
  });

  it("runs a tool and feeds the result back to the model", async () => {
    const t = setup([call({ name: "add_note", args: { note: "likes climbing" } }), say("Got it.")]);
    const trace = await t.run("I like climbing");

    expect(t.app.notes).toEqual(["likes climbing"]);
    expect(t.roles()).toEqual(["user", "assistant", "tool", "assistant"]);
    const second = t.provider.requests[1]!;
    expect(second.messages.at(-1)).toEqual({
      role: "tool",
      toolCallId: "call_add_note_0",
      name: "add_note",
      content: "Noted: likes climbing",
    });
    expect(t.events.map((e) => e.type)).toEqual([
      "turn_start",
      "step_start",
      "usage",
      "tool_call",
      "tool_result",
      "step_start",
      "text_delta",
      "usage",
      "turn_end",
    ]);
    expect(trace.steps.map((s) => s.kind)).toEqual(["model", "tool", "model"]);
  });

  it("runs parallel calls and appends results in call order", async () => {
    const t = setup([
      call({ name: "add_note", args: { note: "a" } }, { name: "add_note", args: { note: "b" } }),
      say("Both noted."),
    ]);
    await t.run("two things");
    const tools = t.store.messages.get("s1")!.filter((m) => m.message.role === "tool");
    expect(tools.map((m) => m.message.role === "tool" && m.message.toolCallId)).toEqual([
      "call_add_note_0",
      "call_add_note_1",
    ]);
  });

  it("returns a throwing tool's error to the model instead of failing the turn", async () => {
    const t = setup([call({ name: "explode", args: {} }), say("Sorry, that failed.")]);
    const trace = await t.run("go");
    expect(trace.error).toBeNull();
    expect(t.toolResults()[0]).toMatchObject({ isError: true, result: "Tool failed: boom" });
    expect(t.events.some((e) => e.type === "error")).toBe(false);
  });

  it("answers an unknown tool with an error result", async () => {
    const t = setup([call({ name: "launch_rocket", args: {} }), say("I can't do that.")]);
    await t.run("go");
    expect(t.toolResults()[0]!.isError).toBe(true);
    expect(t.toolResults()[0]!.result).toMatch(/Unknown tool: launch_rocket.*add_note, explode/);
    expect(t.roles()).toEqual(["user", "assistant", "tool", "assistant"]);
  });

  it("answers invalid arguments and unparseable JSON with error results", async () => {
    const t = setup([
      () => ({
        text: "",
        toolCalls: [
          { id: "c1", name: "add_note", args: { note: "" } },
          { id: "c2", name: "add_note", args: undefined, argsError: "Tool arguments are not valid JSON" },
        ],
      }),
      say("Let me fix that."),
    ]);
    const trace = await t.run("go");
    expect(trace.error).toBeNull();
    const [r1, r2] = t.toolResults();
    expect(r1).toMatchObject({ id: "c1", isError: true });
    expect(r1!.result).toContain("Invalid arguments");
    expect(r2).toMatchObject({ id: "c2", isError: true, result: "Tool arguments are not valid JSON" });
    expect(t.app.notes).toEqual([]);
  });

  it("stops at maxSteps with an error instead of looping forever", async () => {
    const loop = call({ name: "add_note", args: { note: "again" } });
    const t = setup([loop, loop, loop], { maxSteps: 3 });
    const trace = await t.run("loop");
    expect(trace.steps.filter((s) => s.kind === "model")).toHaveLength(3);
    expect(t.events).toContainEqual(expect.objectContaining({ type: "error", code: "max_steps" }));
    // Every call still has its result.
    expect(t.roles()).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant", "tool"]);
  });

  it("aborts mid-stream: keeps the partial text, ends the turn, emits no error", async () => {
    const controller = new AbortController();
    const provider = new MockProvider([say("This reply is long enough to be split into several chunks.")]);
    const store = new MemoryAgentStore();
    store.createSession("s1", "sys");
    const agent = new Agent<App>({ store, provider, tools: new ToolRegistry<App>([addNote]) });
    const events: AgentEvent[] = [];
    const trace = await agent.runTurn({
      sessionId: "s1",
      userText: "hi",
      app: { notes: [] },
      // The client goes away right after the first chunk.
      emit: (e) => {
        events.push(e);
        if (e.type === "text_delta") controller.abort();
      },
      signal: controller.signal,
    });

    expect(trace.error).toBe("aborted");
    expect(events.filter((e) => e.type === "text_delta")).toHaveLength(1);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "turn_end", aborted: true });
    const last = store.messages.get("s1")!.at(-1)!.message;
    expect(last).toEqual({ role: "assistant", text: "This rep\n\n(interrupted)", toolCalls: [] });
  });

  it("reports a model failure as model_error and saves the trace", async () => {
    const t = setup([
      () => {
        throw new Error("401 invalid api key");
      },
    ]);
    const trace = await t.run("hi");
    expect(trace.error).toBe("401 invalid api key");
    expect(t.events).toContainEqual({ type: "error", code: "model_error", message: "401 invalid api key" });
    expect(t.store.traces).toHaveLength(1);
    expect(t.roles()).toEqual(["user"]);
  });

  it("keeps the system prompt frozen and the history append-only across turns", async () => {
    const t = setup([say("one"), say("two")]);
    await t.run("first", { context: "<context>1</context>" });
    await t.run("second", { context: "<context>2</context>" });
    const [r1, r2] = t.provider.requests;
    expect(r1!.system).toBe(r2!.system);
    expect(r2!.messages.slice(0, r1!.messages.length)).toEqual(r1!.messages);
    expect(r2!.tools).toBe(r1!.tools);
  });

  it("closes tool calls a crashed turn left without results before the next turn", async () => {
    const t = setup([say("Back again.")]);
    await t.store.appendMessage("s1", "old-turn", { role: "user", text: "earlier" });
    await t.store.appendMessage("s1", "old-turn", {
      role: "assistant",
      text: "",
      toolCalls: [
        { id: "x1", name: "add_note", args: { note: "a" } },
        { id: "x2", name: "add_note", args: { note: "b" } },
      ],
    });
    await t.store.appendMessage("s1", "old-turn", { role: "tool", toolCallId: "x1", name: "add_note", content: "ok" });

    await t.run("hello?");
    const stored = t.store.messages.get("s1")!;
    expect(stored.map((m) => m.message.role)).toEqual(["user", "assistant", "tool", "tool", "user", "assistant"]);
    expect(stored[3]).toMatchObject({ turnId: "old-turn", message: { role: "tool", toolCallId: "x2", isError: true } });
  });

  it("refuses a second turn on the same session while one is running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup([
      async () => {
        await gate;
        return { text: "done", toolCalls: [] };
      },
    ]);
    const first = t.run("one");
    await expect(t.run("two")).rejects.toBeInstanceOf(SessionBusyError);
    expect(t.agent.isRunning("s1")).toBe(true);
    release();
    await first;
    expect(t.agent.isRunning("s1")).toBe(false);
  });

  it("throws for an unknown session without emitting anything", async () => {
    const t = setup([]);
    const events: AgentEvent[] = [];
    await expect(
      t.agent.runTurn({ sessionId: "nope", userText: "hi", app: t.app, emit: (e) => events.push(e) }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(events).toEqual([]);
  });

  it("lets a hook deny a tool call", async () => {
    const provider = new MockProvider([call({ name: "add_note", args: { note: "secret" } }), say("ok")]);
    const store = new MemoryAgentStore();
    store.createSession("s1", "sys");
    const agent = new Agent<App>({
      store,
      provider,
      tools: new ToolRegistry<App>([addNote]),
      hooks: [{ beforeToolCall: () => ({ deny: "Not allowed here." }) }],
    });
    const app: App = { notes: [] };
    const events: AgentEvent[] = [];
    await agent.runTurn({ sessionId: "s1", userText: "hi", app, emit: (e) => events.push(e) });
    expect(app.notes).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "tool_result", isError: true, result: "Not allowed here." }));
  });
});
