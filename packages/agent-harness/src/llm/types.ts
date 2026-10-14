// Provider-neutral messages and calls. The agent loop only knows these types; each provider
// adapter converts them to and from its native wire format.
//
// Invariant: a provider's conversion is deterministic. The same history always becomes the
// same request bytes, so the provider's prefix cache keeps hitting (Anthropic's prompt cache,
// OpenAI's prompt cache).

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's cache (Anthropic cache_read_input_tokens, OpenAI cached_tokens). */
  cachedInputTokens: number;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments; undefined when the model sent invalid JSON (see argsError). */
  args: unknown;
  argsError?: string;
}

export interface UserMessage {
  role: "user";
  /** What the person typed. This is what a UI shows. */
  text: string;
  /**
   * The per-turn context block (time, app state…), rendered in front of `text` for the model.
   * It lives on the user message, not in the system prompt: the system prompt is frozen per
   * session and history is append-only, so the request prefix never changes.
   */
  context?: string;
}

export interface AssistantMessage {
  role: "assistant";
  text: string;
  /** Thinking or reasoning text the model streamed. Kept for traces; never sent back as text. */
  reasoning?: string;
  toolCalls: ToolCall[];
  /**
   * The provider's own content blocks for this message, when it must get them back verbatim
   * (Claude's signed thinking blocks in a tool loop). Other providers ignore it.
   */
  providerContent?: unknown;
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

/**
 * One entry of a session's history. A history may start with an assistant message (a static
 * greeting); OpenAI-compatible endpoints accept that.
 */
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of an object. */
  parameters: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface ModelResponse {
  message: AssistantMessage;
  stopReason: StopReason;
  usage: Usage;
}

/** Streaming callbacks; the provider calls them as deltas arrive. */
export interface StreamHandlers {
  onText?(delta: string): void;
  onReasoning?(delta: string): void;
}

export interface ModelProvider {
  /** e.g. "anthropic", "openai-compatible", "mock". */
  readonly name: string;
  readonly model: string;
  /**
   * The native request body for this neutral request, without runtime fields like `signal`.
   * Traces store it so we can see exactly what the model saw.
   */
  buildRequest(req: ModelRequest): unknown;
  /** Streams one model call and resolves with the complete assistant message. */
  stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse>;
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  };
}

/** The user message as one string, context block first (for providers without content blocks). */
export function renderUserText(m: UserMessage): string {
  return m.context ? `${m.context}\n\n${m.text}` : m.text;
}

export function parseToolArgs(raw: string): { args: unknown; argsError?: string } {
  if (!raw.trim()) return { args: {} };
  try {
    return { args: JSON.parse(raw) };
  } catch (err) {
    return {
      args: undefined,
      argsError: `Tool arguments are not valid JSON: ${(err as Error).message}. Raw: ${raw.slice(0, 500)}`,
    };
  }
}
