// The Anthropic adapter against a fake fetch: request shape, determinism, signed thinking going
// back verbatim, and how a streamed reply (thinking + text + tool call + usage) becomes one message.

import { describe, expect, it } from "vitest";

import { resolveLlmConfig } from "../config.js";
import { AnthropicProvider, OPENING_USER_TEXT, toAnthropicMessages } from "./anthropic.js";
import type { Message, ModelRequest } from "./types.js";

const config = resolveLlmConfig({ apiKey: "sk-ant-test" });

const thinking = { type: "thinking", thinking: "", signature: "sig-1" };
const history: Message[] = [
  { role: "assistant", text: "Hi! What are you building?", toolCalls: [] },
  { role: "user", text: "A climbing app", context: "<context>t</context>" },
  {
    role: "assistant",
    text: "",
    toolCalls: [{ id: "toolu_1", name: "update_draft", args: { pitch: { projectName: "Crags" } } }],
    providerContent: [
      thinking,
      { type: "tool_use", id: "toolu_1", name: "update_draft", input: { pitch: { projectName: "Crags" } } },
    ],
  },
  { role: "tool", toolCallId: "toolu_1", name: "update_draft", content: "Saved." },
];

const request: ModelRequest = {
  system: "You are the intake assistant.",
  messages: history,
  tools: [{ name: "update_draft", description: "Save fields.", parameters: { type: "object", properties: {} } }],
};

function sse(events: { event: string; data: Record<string, unknown> }[]): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify({ type: e.event, ...e.data })}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("AnthropicProvider", () => {
  it("builds a deterministic Messages request with cache breakpoints", () => {
    const provider = new AnthropicProvider(config);
    expect(JSON.stringify(provider.buildRequest(request))).toBe(JSON.stringify(provider.buildRequest(structuredClone(request))));

    const body = provider.buildRequest(request);
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 16000, stream: true });
    expect(body.system).toEqual([{ type: "text", text: "You are the intake assistant.", cache_control: { type: "ephemeral" } }]);
    expect(body.tools).toEqual([{ name: "update_draft", description: "Save fields.", input_schema: { type: "object", properties: {} } }]);
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: OPENING_USER_TEXT }] },
      { role: "assistant", content: [{ type: "text", text: "Hi! What are you building?" }] },
      { role: "user", content: [{ type: "text", text: "<context>t</context>\n\nA climbing app" }] },
      {
        role: "assistant",
        content: [thinking, { type: "tool_use", id: "toolu_1", name: "update_draft", input: { pitch: { projectName: "Crags" } } }],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Saved.", cache_control: { type: "ephemeral" } }] },
    ]);
  });

  it("puts tool results and the next user message in one user turn", () => {
    const messages = toAnthropicMessages([
      { role: "user", text: "Go" },
      { role: "assistant", text: "", toolCalls: [{ id: "a", name: "x", args: {} }, { id: "b", name: "y", args: {} }] },
      { role: "tool", toolCallId: "a", name: "x", content: "1" },
      { role: "tool", toolCallId: "b", name: "y", content: "2", isError: true },
      { role: "user", text: "And?" },
    ]);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[2]!.content).toEqual([
      { type: "tool_result", tool_use_id: "a", content: "1" },
      { type: "tool_result", tool_use_id: "b", content: "2", is_error: true },
      { type: "text", text: "And?" },
    ]);
  });

  it("assembles streamed thinking, text, a tool call and usage", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return sse([
        {
          event: "message_start",
          data: {
            message: {
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-5-5",
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 20, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
            },
          },
        },
        { event: "content_block_start", data: { index: 0, content_block: { type: "thinking", thinking: "", signature: "" } } },
        { event: "content_block_delta", data: { index: 0, delta: { type: "thinking_delta", thinking: "Hmm." } } },
        { event: "content_block_delta", data: { index: 0, delta: { type: "signature_delta", signature: "sig-2" } } },
        { event: "content_block_stop", data: { index: 0 } },
        { event: "content_block_start", data: { index: 1, content_block: { type: "text", text: "" } } },
        { event: "content_block_delta", data: { index: 1, delta: { type: "text_delta", text: "Saving " } } },
        { event: "content_block_delta", data: { index: 1, delta: { type: "text_delta", text: "it." } } },
        { event: "content_block_stop", data: { index: 1 } },
        { event: "content_block_start", data: { index: 2, content_block: { type: "tool_use", id: "toolu_2", name: "update_draft", input: {} } } },
        { event: "content_block_delta", data: { index: 2, delta: { type: "input_json_delta", partial_json: '{"pitch":' } } },
        { event: "content_block_delta", data: { index: 2, delta: { type: "input_json_delta", partial_json: '{"projectName":"Crags"}}' } } },
        { event: "content_block_stop", data: { index: 2 } },
        { event: "message_delta", data: { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 40 } } },
        { event: "message_stop", data: {} },
      ]);
    }) as typeof fetch;

    const provider = new AnthropicProvider(config, { fetch: fakeFetch, maxRetries: 0 });
    const texts: string[] = [];
    const thoughts: string[] = [];
    const res = await provider.stream(request, { onText: (d) => texts.push(d), onReasoning: (d) => thoughts.push(d) });

    expect(sent[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(texts).toEqual(["Saving ", "it."]);
    expect(thoughts).toEqual(["Hmm."]);
    expect(res.stopReason).toBe("tool_use");
    expect(res.message.text).toBe("Saving it.");
    expect(res.message.reasoning).toBe("Hmm.");
    expect(res.message.toolCalls).toEqual([{ id: "toolu_2", name: "update_draft", args: { pitch: { projectName: "Crags" } } }]);
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 40, cachedInputTokens: 100 });

    // Next call: the signed thinking goes back exactly as it came.
    const next = provider.buildRequest({ ...request, messages: [...history, res.message] });
    expect(next.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "thinking", thinking: "Hmm.", signature: "sig-2" }, { type: "text", text: "Saving it." }, { type: "tool_use", id: "toolu_2" }],
    });
  });
});
