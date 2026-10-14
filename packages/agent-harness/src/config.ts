// LLM config. This module never reads process.env: apps read their own env at the edge and
// pass plain values in; `resolveLlmConfig` fills in the per-provider defaults.

export const LLM_PROVIDERS = ["anthropic", "openai-compatible", "mock"] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

export interface LlmConfigInput {
  provider?: LlmProviderName;
  model?: string;
  baseURL?: string;
  apiKey?: string;
  maxOutputTokens?: number;
}

export interface LlmConfig {
  provider: LlmProviderName;
  model: string;
  baseURL: string | undefined;
  apiKey: string | undefined;
  maxOutputTokens: number;
}

const PROVIDER_DEFAULTS: Record<LlmProviderName, { model: string; baseURL?: string; maxOutputTokens: number }> = {
  anthropic: { model: "claude-sonnet-5-5", maxOutputTokens: 16000 },
  "openai-compatible": { model: "", maxOutputTokens: 8192 },
  mock: { model: "mock", maxOutputTokens: 4096 },
};

export const isLlmProviderName = (value: string): value is LlmProviderName =>
  (LLM_PROVIDERS as readonly string[]).includes(value);

/** Thrown when a config can't produce a working provider (missing key, model or base URL). */
export class LlmConfigError extends Error {
  override name = "LlmConfigError";
}

/**
 * Apply defaults and check the config is usable. Throws LlmConfigError with a message that
 * names what is missing; apps decide whether that is fatal or just turns one feature off.
 */
export function resolveLlmConfig(input: LlmConfigInput = {}): LlmConfig {
  const provider = input.provider ?? "anthropic";
  const defaults = PROVIDER_DEFAULTS[provider];
  const config: LlmConfig = {
    provider,
    model: input.model || defaults.model,
    baseURL: input.baseURL || defaults.baseURL,
    apiKey: input.apiKey || undefined,
    maxOutputTokens: input.maxOutputTokens ?? defaults.maxOutputTokens,
  };
  if (provider === "mock") return config;
  const missing: string[] = [];
  if (!config.apiKey) missing.push("an API key");
  if (!config.model) missing.push("a model name");
  // The Anthropic SDK knows its own endpoint.
  if (!config.baseURL && provider !== "anthropic") missing.push("a base URL");
  if (missing.length) throw new LlmConfigError(`LLM provider "${provider}" needs ${missing.join(", ")}`);
  if (!Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 1) {
    throw new LlmConfigError("maxOutputTokens must be a positive integer");
  }
  return config;
}
