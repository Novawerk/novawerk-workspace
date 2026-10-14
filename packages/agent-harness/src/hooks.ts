// Lifecycle hooks: add logging, guardrails, metrics or approvals without touching the loop.

import type { ModelResponse, ToolCall, Usage } from "./llm/types.js";
import type { ToolResult } from "./tools.js";

export interface HookContext {
  sessionId: string;
  turnId: string;
}

export interface TurnEndInfo {
  steps: number;
  usage: Usage;
  durationMs: number;
  error: string | null;
}

export interface AgentHooks {
  onTurnStart?(ctx: HookContext, userText: string): void | Promise<void>;
  afterModelCall?(ctx: HookContext, step: number, res: ModelResponse, durationMs: number): void | Promise<void>;
  /** Return `{ deny: reason }` to block the call; the reason goes back to the model as an error result. */
  beforeToolCall?(ctx: HookContext, call: ToolCall): void | { deny: string } | Promise<void | { deny: string }>;
  afterToolCall?(ctx: HookContext, call: ToolCall, result: ToolResult, durationMs: number): void | Promise<void>;
  onTurnEnd?(ctx: HookContext, info: TurnEndInfo): void | Promise<void>;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\n/g, "⏎");

export interface ConsoleLogHookOptions {
  /**
   * Also print message text and tool arguments (clipped). Off in production: chat content
   * is personal data and does not belong in platform logs.
   */
  content?: boolean;
  log?: (line: string) => void;
}

/** Prints one line per turn, model call and tool call. */
export function createConsoleLogHook({ content = true, log = console.log }: ConsoleLogHookOptions = {}): AgentHooks {
  const short = (id: string) => id.slice(0, 8);
  return {
    onTurnStart(ctx, text) {
      log(`[agent] ▶ turn ${short(ctx.turnId)} session=${short(ctx.sessionId)}${content ? ` ${clip(text, 80)}` : ""}`);
    },
    afterModelCall(_ctx, step, res, ms) {
      const u = res.usage;
      const calls = res.message.toolCalls.map((c) => c.name).join(", ");
      const tail = calls ? ` → ${calls}` : content ? ` ${clip(res.message.text, 120)}` : "";
      log(
        `[agent]   model#${step} ${ms}ms in=${u.inputTokens} (cached ${u.cachedInputTokens}) out=${u.outputTokens} stop=${res.stopReason}${tail}`,
      );
    },
    afterToolCall(_ctx, call, result, ms) {
      const args = content ? `(${clip(JSON.stringify(call.args ?? {}), 100)})` : "";
      log(`[agent]     ${result.isError ? "✗" : "✓"} ${call.name}${args} ${ms}ms${content ? ` → ${clip(result.content, 100)}` : ""}`);
    },
    onTurnEnd(_ctx, info) {
      log(
        `[agent] ■ end steps=${info.steps} ${info.durationMs}ms in=${info.usage.inputTokens} out=${info.usage.outputTokens}${info.error ? ` error: ${info.error}` : ""}`,
      );
    },
  };
}

/** Prints everything, content included. For local development. */
export const consoleLogHook: AgentHooks = createConsoleLogHook();

/** Runs several hook sets in order. */
export class HookRunner {
  private readonly hooks: AgentHooks[];

  constructor(hooks: AgentHooks[] = []) {
    this.hooks = hooks;
  }

  async onTurnStart(ctx: HookContext, userText: string) {
    for (const h of this.hooks) await h.onTurnStart?.(ctx, userText);
  }

  async afterModelCall(ctx: HookContext, step: number, res: ModelResponse, ms: number) {
    for (const h of this.hooks) await h.afterModelCall?.(ctx, step, res, ms);
  }

  /** The first deny wins. Returns the reason, or null to let the call run. */
  async beforeToolCall(ctx: HookContext, call: ToolCall): Promise<string | null> {
    for (const h of this.hooks) {
      const r = await h.beforeToolCall?.(ctx, call);
      if (r && "deny" in r) return r.deny;
    }
    return null;
  }

  async afterToolCall(ctx: HookContext, call: ToolCall, result: ToolResult, ms: number) {
    for (const h of this.hooks) await h.afterToolCall?.(ctx, call, result, ms);
  }

  async onTurnEnd(ctx: HookContext, info: TurnEndInfo) {
    // A failing end hook must not affect a turn that already finished.
    for (const h of this.hooks) {
      try {
        await h.onTurnEnd?.(ctx, info);
      } catch (err) {
        console.error("[agent] onTurnEnd hook failed:", err);
      }
    }
  }
}
