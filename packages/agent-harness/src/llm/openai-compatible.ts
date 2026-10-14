// OpenAI-compatible adapter: OpenAI, Qwen, Kimi, a local vLLM… all speak
// the Chat Completions protocol. Switch by base URL + model + key.

import OpenAI from "openai";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import type { LlmConfig } from "../config.js";
import {
  emptyUsage,
  parseToolArgs,
  renderUserText,
  type Message,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type StopReason,
  type StreamHandlers,
  type ToolCall,
} from "./types.js";

/** Extensions some compatible servers add to the streamed delta and usage (reasoning, cache hits). */
type ExtendedDelta = ChatCompletionChunk.Choice.Delta & { reasoning_content?: string | null };
type ExtendedUsage = NonNullable<ChatCompletionChunk["usage"]> & { prompt_cache_hit_tokens?: number };

export interface OpenAICompatibleOptions {
  /** Inject a fetch for tests. */
  fetch?: typeof fetch;
  /** Retries on 429/5xx before the stream starts. Default 2. */
  maxRetries?: number;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: string;
  readonly model: string;
  private readonly client: OpenAI;
  private readonly maxOutputTokens: number;

  constructor(cfg: LlmConfig, opts: OpenAICompatibleOptions = {}) {
    if (!cfg.apiKey) throw new Error(`LLM provider "${cfg.provider}" needs an API key`);
    this.name = cfg.provider;
    this.model = cfg.model;
    this.maxOutputTokens = cfg.maxOutputTokens;
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      maxRetries: opts.maxRetries ?? 2,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  buildRequest(req: ModelRequest): ChatCompletionCreateParamsStreaming {
    const tools: ChatCompletionTool[] = req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    return {
      model: this.model,
      max_tokens: this.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "system", content: req.system }, ...toOpenAIMessages(req.messages)],
      ...(tools.length ? { tools } : {}),
    };
  }

  async stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse> {
    const stream = await this.client.chat.completions.create(this.buildRequest(req), { signal: req.signal });

    let text = "";
    let reasoning = "";
    let finishReason: string | null = null;
    const usage = emptyUsage();
    // Tool call arguments stream in fragments keyed by index; collect them first.
    const partial = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (choice) {
        const delta = choice.delta as ExtendedDelta;
        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content;
          handlers.onReasoning?.(delta.reasoning_content);
        }
        if (delta.content) {
          text += delta.content;
          handlers.onText?.(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const cur = partial.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          partial.set(tc.index, cur);
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
      if (chunk.usage) {
        const u = chunk.usage as ExtendedUsage;
        usage.inputTokens = u.prompt_tokens;
        usage.outputTokens = u.completion_tokens;
        usage.cachedInputTokens = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
      }
    }

    const toolCalls: ToolCall[] = [...partial.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, p]) => ({ id: p.id || `call_${index}`, name: p.name, ...parseToolArgs(p.args) }));

    return {
      message: { role: "assistant", text, ...(reasoning ? { reasoning } : {}), toolCalls },
      stopReason: mapFinishReason(finishReason, toolCalls.length > 0),
      usage,
    };
  }
}

function mapFinishReason(reason: string | null, hasToolCalls: boolean): StopReason {
  switch (reason) {
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    case "stop":
      // Some compatible servers send tool calls with finish_reason "stop".
      return hasToolCalls ? "tool_use" : "end_turn";
    default:
      return hasToolCalls ? "tool_use" : "other";
  }
}

/** Deterministic: the same history always produces the same messages array. */
export function toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((m): ChatCompletionMessageParam => {
    switch (m.role) {
      case "user":
        return { role: "user", content: renderUserText(m) };
      case "assistant":
        // reasoning is never sent back: some servers reject reasoning_content in the input.
        return {
          role: "assistant",
          content: m.text || null,
          ...(m.toolCalls.length
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
                })),
              }
            : {}),
        };
      case "tool":
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
  });
}
