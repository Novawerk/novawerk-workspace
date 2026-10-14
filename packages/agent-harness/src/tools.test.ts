import { describe, expect, it } from "vitest";
import { z } from "zod";

import { LlmConfigError, resolveLlmConfig } from "./config.js";
import { renderTurnContext } from "./context.js";
import { ToolRegistry, defineTool, type ToolContext } from "./tools.js";

const ctx: ToolContext = { sessionId: "s", turnId: "t", signal: new AbortController().signal, app: {} };

describe("ToolRegistry", () => {
  const echo = defineTool({
    name: "echo",
    description: "Echo a word.",
    schema: z.object({ word: z.string().describe("The word") }),
    run: ({ word }) => word,
  });

  it("builds JSON Schema specs once, in registration order, without $schema", () => {
    const other = defineTool({ name: "other", description: "x", schema: z.object({}), run: () => "" });
    const registry = new ToolRegistry([echo, other]);
    const specs = registry.specs();
    expect(specs.map((s) => s.name)).toEqual(["echo", "other"]);
    expect(specs[0]!.parameters).toMatchObject({
      type: "object",
      properties: { word: { type: "string", description: "The word" } },
      required: ["word"],
    });
    expect(specs[0]!.parameters).not.toHaveProperty("$schema");
    expect(registry.specs()).toBe(specs);
  });

  it("rejects duplicate names", () => {
    expect(() => new ToolRegistry([echo, echo])).toThrow(/Duplicate tool name: echo/);
  });

  it("times out a slow tool and reports it as an error", async () => {
    const slow = defineTool({
      name: "slow",
      description: "Never finishes.",
      schema: z.object({}),
      run: () => new Promise<string>(() => {}),
    });
    const result = await new ToolRegistry([slow], { timeoutMs: 20 }).execute({ id: "1", name: "slow", args: {} }, ctx);
    expect(result).toEqual({ content: "Tool failed: timed out after 20 ms", isError: true });
  });

  it("treats missing args as an empty object", async () => {
    const none = defineTool({ name: "none", description: "", schema: z.object({}), run: () => "fine" });
    const result = await new ToolRegistry([none]).execute({ id: "1", name: "none", args: undefined }, ctx);
    expect(result).toEqual({ content: "fine", isError: false });
  });
});

describe("resolveLlmConfig", () => {
  it("defaults to Claude", () => {
    expect(resolveLlmConfig({ apiKey: "sk-ant-1" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      baseURL: undefined,
      apiKey: "sk-ant-1",
      maxOutputTokens: 16000,
    });
  });

  it("needs a key unless the provider is mock", () => {
    expect(() => resolveLlmConfig({})).toThrow(LlmConfigError);
    expect(resolveLlmConfig({ provider: "mock" }).model).toBe("mock");
  });

  it("needs model and base URL for a generic OpenAI-compatible endpoint", () => {
    expect(() => resolveLlmConfig({ provider: "openai-compatible", apiKey: "k" })).toThrow(
      /needs a model name, a base URL/,
    );
    expect(
      resolveLlmConfig({ provider: "openai-compatible", apiKey: "k", model: "qwen-plus", baseURL: "https://x/v1" }),
    ).toMatchObject({ model: "qwen-plus", baseURL: "https://x/v1" });
  });
});

describe("renderTurnContext", () => {
  it("renders time, sections and the reminder", () => {
    const text = renderTurnContext({
      now: new Date("2026-10-03T09:05:00Z"),
      sections: [{ tag: "draft", attrs: { mode: "pitch" }, body: '{"name":"Ada"}\n' }],
      reminder: "One question at a time.",
    });
    expect(text).toBe(
      [
        "<context>",
        "Current time: 2026-10-03 09:05 UTC",
        '<draft mode="pitch">',
        '{"name":"Ada"}',
        "</draft>",
        "<reminder>",
        "One question at a time.",
        "</reminder>",
        "</context>",
      ].join("\n"),
    );
  });
});
