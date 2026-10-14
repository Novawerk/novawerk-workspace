// What the agent loop reports while it runs (events) and what it stores afterwards (traces).
// Apps map AgentEvent onto their own wire format (e.g. SSE for a chat UI).

import type { Usage } from "./llm/types.js";

export type AgentErrorCode =
  /** The model call failed (network, auth, provider error). */
  | "model_error"
  /** The provider refused to answer. */
  | "refusal"
  /** The reply hit the output token limit. */
  | "max_tokens"
  /** The turn used up its step budget. */
  | "max_steps"
  /** Anything else (store, hooks). */
  | "internal";

export type AgentEvent =
  | { type: "turn_start"; turnId: string }
  | { type: "step_start"; step: number }
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; result: string; isError: boolean }
  | { type: "usage"; usage: Usage }
  | { type: "error"; code: AgentErrorCode; message: string }
  | { type: "turn_end"; turnId: string; steps: number; usage: Usage; durationMs: number; aborted: boolean };

export type TraceStep =
  | {
      kind: "model";
      step: number;
      startedAt: string;
      durationMs: number;
      /** The native request sent to the provider: the first thing to look at when debugging. */
      request: unknown;
      response: {
        text: string;
        reasoning: string;
        toolCalls: { id: string; name: string; args: unknown }[];
        stopReason: string;
      } | null;
      usage: Usage | null;
      error?: string;
    }
  | {
      kind: "tool";
      step: number;
      startedAt: string;
      durationMs: number;
      name: string;
      args: unknown;
      result: string;
      isError: boolean;
    };

/** One turn, step by step. Saved through AgentStore.saveTrace when the turn ends. */
export interface TurnTrace {
  /** The turn id. */
  id: string;
  sessionId: string;
  userMessage: string;
  startedAt: string;
  durationMs: number;
  provider: string;
  model: string;
  usage: Usage;
  steps: TraceStep[];
  error: string | null;
}
