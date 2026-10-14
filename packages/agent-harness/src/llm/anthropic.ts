// Anthropic adapter: Claude through the Messages API, streamed, with tools.
//
// Claude thinks before it answers (adaptive thinking is the model's default). In a tool loop the
// thinking blocks must go back exactly as they came, signature included, so the assistant message
// keeps Claude's own content blocks in `providerContent` and we send those back verbatim.
// The system prompt and the conversation so far are marked for prompt caching.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  ContentBlockParam,
  MessageCreateParamsStreaming,
  MessageParam,
  StopReason as AnthropicStopReason,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";

import type { LlmConfig } from "../config.js";
import {
  emptyUsage,
  renderUserText,
  type Message,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type StopReason,
  type StreamHandlers,
  type ToolCall,
} from "./types.js";

export interface AnthropicOptions {
  /** Inject a fetch for tests. */
  fetch?: typeof fetch;
  /** Retries on 429/5xx/529 before the stream starts. Default 2. */
  maxRetries?: number;
}

/** Stands in front of a history that starts with the assistant (a static greeting): Claude wants a user turn first. */
export const OPENING_USER_TEXT = "(The chat opens.)";

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxOutputTokens: number;

  constructor(cfg: LlmConfig, opts: AnthropicOptions = {}) {
    if (!cfg.apiKey) throw new Error('LLM provider "anthropic" needs an API key');
    this.model = cfg.model;
    this.maxOutputTokens = cfg.maxOutputTokens;
    this.client = new Anthropic({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
      maxRetries: opts.maxRetries ?? 2,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  buildRequest(req: ModelRequest): MessageCreateParamsStreaming {
    const tools: Tool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Tool["input_schema"],
    }));
    return {
      model: this.model,
      max_tokens: this.maxOutputTokens,
      stream: true,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: withCacheBreakpoint(toAnthropicMessages(req.messages)),
      ...(tools.length ? { tools } : {}),
    };
  }

  async stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse> {
    const { stream: _stream, ...params } = this.buildRequest(req);
    const stream = this.client.messages.stream(params, { signal: req.signal });
    stream.on("text", (delta) => handlers.onText?.(delta));
    stream.on("thinking", (delta) => handlers.onReasoning?.(delta));
    const final = await stream.finalMessage();

    const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const reasoning = final.content.flatMap((b) => (b.type === "thinking" ? [b.thinking] : [])).join("");
    const toolCalls: ToolCall[] = final.content.flatMap((b) =>
      b.type === "tool_use" ? [{ id: b.id, name: b.name, args: b.input ?? {} }] : [],
    );
    const usage = emptyUsage();
    const cached = final.usage.cache_read_input_tokens ?? 0;
    const written = final.usage.cache_creation_input_tokens ?? 0;
    usage.inputTokens = final.usage.input_tokens + cached + written;
    usage.outputTokens = final.usage.output_tokens;
    usage.cachedInputTokens = cached;

    return {
      message: {
        role: "assistant",
        text,
        ...(reasoning ? { reasoning } : {}),
        toolCalls,
        providerContent: final.content,
      },
      stopReason: mapStopReason(final.stop_reason, toolCalls.length > 0),
      usage,
    };
  }
}

function mapStopReason(reason: AnthropicStopReason | null, hasToolCalls: boolean): StopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "end_turn":
    case "stop_sequence":
      return hasToolCalls ? "tool_use" : "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return hasToolCalls ? "tool_use" : "other";
  }
}

/**
 * Deterministic: the same history always produces the same messages. Tool results that follow
 * one assistant turn go back together in one user message, followed by whatever the user said next.
 */
export function toAnthropicMessages(messages: Message[]): MessageParam[] {
  const out: MessageParam[] = [];
  const push = (role: MessageParam["role"], blocks: ContentBlockParam[]) => {
    const last = out.at(-1);
    if (last && last.role === role) (last.content as ContentBlockParam[]).push(...blocks);
    else out.push({ role, content: blocks });
  };

  for (const m of messages) {
    switch (m.role) {
      case "user":
        push("user", [{ type: "text", text: renderUserText(m) }]);
        break;
      case "assistant": {
        if (out.length === 0) push("user", [{ type: "text", text: OPENING_USER_TEXT }]);
        const native = m.providerContent as ContentBlock[] | undefined;
        const blocks: ContentBlockParam[] = native
          ? native.map(toParam)
          : [
              ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
              ...m.toolCalls.map((tc) => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.args ?? {} })),
            ];
        push("assistant", blocks.length ? blocks : [{ type: "text", text: "…" }]);
        break;
      }
      case "tool":
        push("user", [
          { type: "tool_result", tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) },
        ]);
        break;
    }
  }
  return out;
}

/** A response block as a request block: the same fields, minus what only responses carry. */
function toParam(block: ContentBlock): ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "thinking":
      return { type: "thinking", thinking: block.thinking, signature: block.signature };
    case "redacted_thinking":
      return { type: "redacted_thinking", data: block.data };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    default:
      return block as unknown as ContentBlockParam;
  }
}

/** Cache everything up to the newest message, so the next call reads the conversation from cache. */
function withCacheBreakpoint(messages: MessageParam[]): MessageParam[] {
  const last = messages.at(-1);
  if (!last || typeof last.content === "string") return messages;
  const blocks = last.content as ContentBlockParam[];
  const i = blocks.length - 1;
  const tail = blocks[i];
  if (!tail || tail.type === "thinking" || tail.type === "redacted_thinking") return messages;
  const marked = [...blocks];
  marked[i] = { ...tail, cache_control: { type: "ephemeral" } } as ContentBlockParam;
  return [...messages.slice(0, -1), { ...last, content: marked }];
}
