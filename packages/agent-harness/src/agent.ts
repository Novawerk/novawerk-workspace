// The agent loop. One turn = the person sends a message → a few steps of "call the model →
// run the tools it asked for" → the model answers without tool calls.
//
//   ├ close any tool calls the previous turn left without a result
//   ├ append the user message (with the per-turn context block the app rendered)
//   └ loop, at most maxSteps times
//       ├ stream the model (text deltas go straight to `emit`)
//       ├ no tool calls → done
//       └ run the tools in parallel → append their results in call order → next step
//
// Invariants (they keep the provider's prompt cache hitting and the history valid):
// 1. The system prompt is frozen per session (the app writes it at creation; we only read it).
// 2. Messages are append-only. Nothing is rewritten; fixes are appended.
// 3. The tool set and order are fixed (ToolRegistry caches the specs).
// 4. Provider conversion is deterministic (see llm/openai-compatible.ts).
// 5. Every tool call in the history gets a result — refused, truncated, failed or interrupted
//    calls get an error result.
//
// Every step is recorded in a TurnTrace (including the native request) and saved at the end.

import { randomUUID } from "node:crypto";

import type { AgentErrorCode, AgentEvent, TraceStep, TurnTrace } from "./events.js";
import { HookRunner, type AgentHooks, type HookContext } from "./hooks.js";
import {
  addUsage,
  emptyUsage,
  type AssistantMessage,
  type Message,
  type ModelProvider,
  type ModelResponse,
  type ToolCall,
  type ToolResultMessage,
} from "./llm/types.js";
import type { AgentSessionState, AgentStore, StoredMessage } from "./store.js";
import type { ToolContext, ToolRegistry, ToolResult } from "./tools.js";

export interface AgentOptions<A> {
  store: AgentStore;
  provider: ModelProvider;
  tools: ToolRegistry<A>;
  hooks?: AgentHooks[];
  /** Model calls per turn before we stop. Default 8. */
  maxSteps?: number;
}

export interface RunTurnInput<A> {
  sessionId: string;
  userText: string;
  /** The rendered per-turn context block (see renderTurnContext). */
  context?: string;
  /** App-specific context handed to every tool in this turn. */
  app: A;
  emit?: (event: AgentEvent) => void;
  /** Abort the turn (e.g. the client disconnected). The model call is cancelled. */
  signal?: AbortSignal;
}

/** A turn is already running for this session in this process. */
export class SessionBusyError extends Error {
  override name = "SessionBusyError";
}

export class SessionNotFoundError extends Error {
  override name = "SessionNotFoundError";
}

/** Wraps errors thrown by the provider so the loop can tell them from store/hook failures. */
class ModelCallError extends Error {
  constructor(cause: unknown) {
    super(errorMessage(cause), { cause });
  }
}

const INTERRUPTED_MARK = "\n\n(interrupted)";

export class Agent<A = unknown> {
  private readonly opts: AgentOptions<A>;
  private readonly hooks: HookRunner;
  private readonly maxSteps: number;
  private readonly running = new Set<string>();

  constructor(opts: AgentOptions<A>) {
    this.opts = opts;
    this.hooks = new HookRunner(opts.hooks ?? []);
    this.maxSteps = opts.maxSteps ?? 8;
  }

  get provider(): ModelProvider {
    return this.opts.provider;
  }

  /** In-process guard only. Apps on serverless need their own cross-instance lock. */
  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }

  async runTurn(input: RunTurnInput<A>): Promise<TurnTrace> {
    const { sessionId } = input;
    if (this.running.has(sessionId)) throw new SessionBusyError("A reply is still being written for this session");
    this.running.add(sessionId);
    try {
      const session = await this.opts.store.getSession(sessionId);
      if (!session) throw new SessionNotFoundError(`No session ${sessionId}`);
      return await this.runTurnInner(session, input);
    } finally {
      this.running.delete(sessionId);
    }
  }

  private async runTurnInner(session: AgentSessionState, input: RunTurnInput<A>): Promise<TurnTrace> {
    const { store, provider } = this.opts;
    const { sessionId, userText } = input;
    const signal = input.signal ?? new AbortController().signal;
    const emit = (event: AgentEvent) => {
      try {
        input.emit?.(event);
      } catch {
        // A broken listener (e.g. a closed connection) must not break the turn.
      }
    };

    const turnId = randomUUID();
    const startedAt = Date.now();
    const hookCtx: HookContext = { sessionId, turnId };
    const trace: TurnTrace = {
      id: turnId,
      sessionId,
      userMessage: userText,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: 0,
      provider: provider.name,
      model: provider.model,
      usage: emptyUsage(),
      steps: [],
      error: null,
    };
    let step = 0;
    // The history as the model sees it; mirrors every append below.
    let messages: Message[] = [];
    const append = async (turn: string, message: Message) => {
      await store.appendMessage(sessionId, turn, message);
      messages.push(message);
    };
    const fail = (code: AgentErrorCode, message: string) => emit({ type: "error", code, message });

    emit({ type: "turn_start", turnId });
    try {
      await this.hooks.onTurnStart(hookCtx, userText);

      const stored = await store.listMessages(sessionId);
      messages = stored.map((m) => m.message);
      for (const fix of danglingToolResults(stored)) await append(fix.turnId, fix.message);

      await append(turnId, { role: "user", text: userText, ...(input.context ? { context: input.context } : {}) });

      const toolCtx: ToolContext<A> = { sessionId, turnId, signal, app: input.app };

      while (step < this.maxSteps) {
        step++;
        emit({ type: "step_start", step });
        const { response, durationMs } = await this.callModel(session, messages, step, trace, emit, signal, append, turnId);
        await this.hooks.afterModelCall(hookCtx, step, response, durationMs);

        const { stopReason, message } = response;
        await append(turnId, message);
        await store.updateSession(sessionId, { lastInputTokens: response.usage.inputTokens });
        trace.usage = addUsage(trace.usage, response.usage);
        emit({ type: "usage", usage: response.usage });

        if (stopReason === "refusal") {
          await this.closeCalls(message.toolCalls, "The model refused; this call was not run.", append, turnId);
          fail("refusal", "The model refused to answer this request.");
          break;
        }
        if (!message.toolCalls.length) {
          if (stopReason === "max_tokens") fail("max_tokens", "The reply hit the length limit and was cut off.");
          break;
        }

        // Cut-off output may carry incomplete arguments: don't run them, tell the model instead.
        const truncated = stopReason === "max_tokens";
        const results = await Promise.all(
          message.toolCalls.map((call) => this.runTool(call, step, truncated, toolCtx, hookCtx, trace, emit)),
        );
        for (const [i, call] of message.toolCalls.entries()) {
          const result = results[i]!;
          await append(turnId, toolResult(call, result));
        }

        if (signal.aborted) break;
        if (step === this.maxSteps) fail("max_steps", `Stopped after ${this.maxSteps} steps in one turn.`);
      }
    } catch (err) {
      if (signal.aborted) {
        trace.error = "aborted";
      } else {
        trace.error = errorMessage(err);
        fail(err instanceof ModelCallError ? "model_error" : "internal", trace.error);
      }
    } finally {
      trace.durationMs = Date.now() - startedAt;
      try {
        await store.saveTrace(trace);
      } catch (err) {
        console.error(`[agent] could not save trace ${turnId}:`, err);
      }
      emit({
        type: "turn_end",
        turnId,
        steps: step,
        usage: trace.usage,
        durationMs: trace.durationMs,
        aborted: signal.aborted,
      });
      await this.hooks.onTurnEnd(hookCtx, {
        steps: step,
        usage: trace.usage,
        durationMs: trace.durationMs,
        error: trace.error,
      });
    }
    return trace;
  }

  private async callModel(
    session: AgentSessionState,
    messages: Message[],
    step: number,
    trace: TurnTrace,
    emit: (e: AgentEvent) => void,
    signal: AbortSignal,
    append: (turnId: string, m: Message) => Promise<void>,
    turnId: string,
  ): Promise<{ response: ModelResponse; durationMs: number }> {
    const { provider, tools } = this.opts;
    // A snapshot: the trace and the provider must not see later appends.
    const req = { system: session.systemPrompt, messages: [...messages], tools: tools.specs(), signal };
    const t0 = Date.now();
    const traceStep: Extract<TraceStep, { kind: "model" }> = {
      kind: "model",
      step,
      startedAt: new Date(t0).toISOString(),
      durationMs: 0,
      request: provider.buildRequest(req),
      response: null,
      usage: null,
    };
    trace.steps.push(traceStep);

    let partialText = "";
    try {
      const response = await provider.stream(req, {
        onText: (t) => {
          partialText += t;
          emit({ type: "text_delta", text: t });
        },
        onReasoning: (t) => emit({ type: "reasoning_delta", text: t }),
      });
      const m = response.message;
      traceStep.durationMs = Date.now() - t0;
      traceStep.usage = response.usage;
      traceStep.response = {
        text: m.text,
        reasoning: m.reasoning ?? "",
        toolCalls: m.toolCalls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
        stopReason: response.stopReason,
      };
      return { response, durationMs: traceStep.durationMs };
    } catch (err) {
      traceStep.durationMs = Date.now() - t0;
      traceStep.error = errorMessage(err);
      // Keep what the person already saw, so a reload shows the same thing.
      if (partialText) {
        const partial: AssistantMessage = { role: "assistant", text: partialText + INTERRUPTED_MARK, toolCalls: [] };
        await append(turnId, partial);
      }
      throw new ModelCallError(err);
    }
  }

  /** Runs one call; never throws, so every call is guaranteed a result. */
  private async runTool(
    call: ToolCall,
    step: number,
    truncated: boolean,
    toolCtx: ToolContext<A>,
    hookCtx: HookContext,
    trace: TurnTrace,
    emit: (e: AgentEvent) => void,
  ): Promise<ToolResult> {
    const { tools } = this.opts;
    emit({ type: "tool_call", id: call.id, name: call.name, args: call.args });
    const t0 = Date.now();
    let result: ToolResult;
    try {
      const denied = truncated
        ? "The reply was cut off, so these arguments may be incomplete. Not run. Send shorter content and try again."
        : await this.hooks.beforeToolCall(hookCtx, call);
      result = denied ? { content: denied, isError: true } : await tools.execute(call, toolCtx);
    } catch (err) {
      result = { content: `Tool failed: ${errorMessage(err)}`, isError: true };
    }
    const durationMs = Date.now() - t0;
    emit({ type: "tool_result", id: call.id, name: call.name, result: result.content, isError: result.isError });
    trace.steps.push({
      kind: "tool",
      step,
      startedAt: new Date(t0).toISOString(),
      durationMs,
      name: call.name,
      args: call.args,
      result: result.content,
      isError: result.isError,
    });
    try {
      await this.hooks.afterToolCall(hookCtx, call, result, durationMs);
    } catch (err) {
      console.error("[agent] afterToolCall hook failed:", err);
    }
    return result;
  }

  private async closeCalls(
    calls: ToolCall[],
    reason: string,
    append: (turnId: string, m: Message) => Promise<void>,
    turnId: string,
  ) {
    for (const call of calls) await append(turnId, toolResult(call, { content: reason, isError: true }));
  }
}

function toolResult(call: ToolCall, result: ToolResult): ToolResultMessage {
  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: result.content,
    ...(result.isError ? { isError: true } : {}),
  };
}

/**
 * If the history ends with an assistant message whose tool calls never got results (the
 * process died mid-turn), the error results that close them — appended under that message's
 * turn id, so they stay next to it.
 */
export function danglingToolResults(stored: StoredMessage[]): { turnId: string; message: ToolResultMessage }[] {
  let i = stored.length - 1;
  const answered = new Set<string>();
  while (i >= 0 && stored[i]!.message.role === "tool") {
    answered.add((stored[i]!.message as ToolResultMessage).toolCallId);
    i--;
  }
  const last = stored[i];
  if (!last || last.message.role !== "assistant") return [];
  return last.message.toolCalls
    .filter((c) => !answered.has(c.id))
    .map((c) => ({
      turnId: last.turnId,
      message: toolResult(c, { content: "Interrupted before this call ran.", isError: true }),
    }));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
