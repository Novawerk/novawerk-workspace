import type { LlmConfig } from "../config.js";
import { AnthropicProvider, type AnthropicOptions } from "./anthropic.js";
import { MockProvider, type MockStep } from "./mock.js";
import { OpenAICompatibleProvider, type OpenAICompatibleOptions } from "./openai-compatible.js";
import type { ModelProvider } from "./types.js";

export interface CreateProviderOptions extends OpenAICompatibleOptions, AnthropicOptions {
  /** Demo behaviour for provider "mock" (otherwise it echoes). */
  mockDemo?: MockStep;
}

/** Build a provider from a resolved config (see resolveLlmConfig). */
export function createProvider(cfg: LlmConfig, opts: CreateProviderOptions = {}): ModelProvider {
  switch (cfg.provider) {
    case "mock":
      return new MockProvider(opts.mockDemo ? { demo: opts.mockDemo } : {});
    case "anthropic":
      return new AnthropicProvider(cfg, opts);
    case "openai-compatible":
      return new OpenAICompatibleProvider(cfg, opts);
  }
}
