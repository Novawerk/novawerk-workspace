// Pins the request shape we send to Claude and how we read the answer: fallbacks on, effort
// explicit, structured output when asked, refusals and truncation surfaced as errors.

import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { ClaudeRefusalError, createClaude, MODELS, stubClaude } from "./claude.js";

function fakeClient(response: Partial<Anthropic.Beta.BetaMessage>) {
  const create = vi.fn().mockResolvedValue({
    model: MODELS.draft,
    stop_reason: "end_turn",
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    content: [],
    ...response,
  });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

const CALL = { model: MODELS.draft, system: "Be brief.", user: "Say hi." };

describe("createClaude().text", () => {
  it("sends one request with fallbacks, explicit effort and a cached system prompt", async () => {
    const { client, create } = fakeClient({ content: [{ type: "text", text: "Hi.", citations: null }] });
    const usage = vi.fn();
    const text = await createClaude("sk-test", { client, onUsage: usage }).text(CALL);

    expect(text).toBe("Hi.");
    const req = create.mock.calls[0]![0];
    expect(req).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: "Be brief.", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Say hi." }],
      output_config: { effort: "medium" },
    });
    // Thinking is left to the model's default (adaptive); never disabled.
    expect(req).not.toHaveProperty("thinking");
    expect(usage).toHaveBeenCalledWith({ model: MODELS.draft, inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 });
  });

  it("returns only the text blocks, skipping thinking blocks", async () => {
    const { client } = fakeClient({
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Answer", citations: null },
      ] as Anthropic.Beta.BetaContentBlock[],
    });
    expect(await createClaude("k", { client }).text(CALL)).toBe("Answer");
  });

  it("throws ClaudeRefusalError when the whole fallback chain refuses", async () => {
    const { client } = fakeClient({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null } as Anthropic.Beta.BetaRefusalStopDetails,
    });
    await expect(createClaude("k", { client }).text(CALL)).rejects.toBeInstanceOf(ClaudeRefusalError);
  });

  it("throws instead of returning a cut-off answer", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", content: [{ type: "text", text: "Half", citations: null }] });
    await expect(createClaude("k", { client }).text(CALL)).rejects.toThrow(/max_tokens/);
  });
});

describe("createClaude().json", () => {
  it("asks for structured output and parses it", async () => {
    const { client, create } = fakeClient({ content: [{ type: "text", text: '{"ok":true}', citations: null }] });
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    const out = await createClaude("k", { client }).json<{ ok: boolean }>({ ...CALL, schema, effort: "low" });
    expect(out).toEqual({ ok: true });
    expect(create.mock.calls[0]![0].output_config).toEqual({ effort: "low", format: { type: "json_schema", schema } });
  });
});

describe("stubClaude", () => {
  it("answers from the reply function without a network", async () => {
    const claude = stubClaude((call) => (call.user.includes("json") ? { n: 1 } : "plain"));
    expect(await claude.text(CALL)).toBe("plain");
    expect(await claude.json({ ...CALL, user: "json please", schema: {} })).toEqual({ n: 1 });
  });
});
