// The OpenAI-compatible adapter against a fake fetch: request shape, determinism, and how a
// streamed reply (text + fragmented tool call + usage) becomes one AssistantMessage.

import { describe, expect, it } from "vitest";

import { resolveLlmConfig } from "../config.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { Message, ModelRequest } from "./types.js";

const config = resolveLlmConfig({ provider: "openai-compatible", apiKey: "sk-test", model: "test-model", baseURL: "https://llm.example/v1" });

const history: Message[] = [
  { role: "assistant", text: "Hi! What are you building?", toolCalls: [] },
  { role: "user", text: "A climbing app", context: "<context>t</context>" },
  {
    role: "assistant",
    text: "",
    reasoning: "never sent back",
    toolCalls: [{ id: "c1", name: "update_draft", args: { pitch: { projectName: "Crags" } } }],
  },
  { role: "tool", toolCallId: "c1", name: "update_draft", content: "Saved." },
];

const request: ModelRequest = {
  system: "You are the intake assistant.",
  messages: history,
  tools: [{ name: "update_draft", description: "Save fields.", parameters: { type: "object", properties: {} } }],
};

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
  id: "x",
  object: "chat.completion.chunk",
  created: 0,
  model: "test-model",
  choices: [{ index: 0, delta, finish_reason: finish }],
});

describe("OpenAICompatibleProvider", () => {
  it("builds a deterministic Chat Completions request", () => {
    const provider = new OpenAICompatibleProvider(config);
    const a = JSON.stringify(provider.buildRequest(request));
    const b = JSON.stringify(provider.buildRequest(structuredClone(request)));
    expect(a).toBe(b);

    const body = provider.buildRequest(request);
    expect(body).toMatchObject({ model: "test-model", max_tokens: 8192, stream: true });
    expect(body.messages).toEqual([
      { role: "system", content: "You are the intake assistant." },
      { role: "assistant", content: "Hi! What are you building?" },
      { role: "user", content: "<context>t</context>\n\nA climbing app" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "update_draft", arguments: '{"pitch":{"projectName":"Crags"}}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "Saved." },
    ]);
    expect(body.tools).toHaveLength(1);
  });

  it("assembles streamed text, tool call fragments and cache usage", async () => {
    let sent: { url: string; body: Record<string, unknown> } | undefined;
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) };
      return sse([
        chunk({ role: "assistant", content: "Let me " }),
        chunk({ content: "save that." }),
        chunk({ tool_calls: [{ index: 0, id: "call_9", type: "function", function: { name: "update_", arguments: "" } }] }),
        chunk({ tool_calls: [{ index: 0, function: { name: "draft", arguments: '{"pitch":' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{"team":"Ada"}}' } }] }),
        chunk({}, "tool_calls"),
        {
          ...chunk({}),
          choices: [],
          usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_cache_hit_tokens: 100 },
        },
      ]);
    }) as typeof fetch;

    const provider = new OpenAICompatibleProvider(config, { fetch: fakeFetch, maxRetries: 0 });
    const deltas: string[] = [];
    const res = await provider.stream(request, { onText: (t) => deltas.push(t) });

    expect(sent?.url).toBe("https://llm.example/v1/chat/completions");
    expect(sent?.body.model).toBe("test-model");
    expect(deltas.join("")).toBe("Let me save that.");
    expect(res.stopReason).toBe("tool_use");
    expect(res.message).toEqual({
      role: "assistant",
      text: "Let me save that.",
      toolCalls: [{ id: "call_9", name: "update_draft", args: { pitch: { team: "Ada" } } }],
    });
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30, cachedInputTokens: 100 });
  });

  it("keeps a tool call with broken JSON and explains the problem", async () => {
    const fakeFetch = (async () =>
      sse([
        chunk({ tool_calls: [{ index: 0, id: "c", type: "function", function: { name: "update_draft", arguments: '{"pitch": ' } }] }),
        chunk({}, "tool_calls"),
      ])) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider(config, { fetch: fakeFetch, maxRetries: 0 });
    const res = await provider.stream(request, {});
    expect(res.message.toolCalls[0]).toMatchObject({ id: "c", name: "update_draft", args: undefined });
    expect(res.message.toolCalls[0]!.argsError).toMatch(/not valid JSON/);
  });
});
