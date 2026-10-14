// Calling Claude. One request, one answer — our agents don't need tool loops.
//
// The API key is always passed in (from `loadConfig(["anthropic"])`); this module never reads
// env. Every request opts into server-side refusal fallbacks ("default" routing), so a request
// a safety classifier declines is re-run on Anthropic's recommended fallback model instead of
// failing the run. If the whole chain still refuses we throw ClaudeRefusalError.

import Anthropic from "@anthropic-ai/sdk";

/** Model choice per job. Change it here, not in agents. */
export const MODELS = {
  /** Drafting things people read: outreach emails, agendas, sponsor research. */
  draft: "claude-opus-5-5",
  /** Cheap, short summaries: intake ai_summary, standup digests. */
  summary: "claude-sonnet-5-5",
} as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** A JSON Schema for structured output. Objects need `additionalProperties: false`. */
export type JsonSchema = Record<string, unknown>;

export interface ClaudeCall {
  model: string;
  /** Stable instructions (brand voice, task rules). Cached when long enough. */
  system: string;
  /** The per-run material. Untrusted text belongs here, inside clear tags. */
  user: string;
  /** How hard the model thinks. Default "medium". */
  effort?: Effort;
  /** Output cap, thinking included. Default 16000. */
  maxTokens?: number;
}

export interface ClaudeJsonCall extends ClaudeCall {
  /** The answer is constrained to this schema and parsed. */
  schema: JsonSchema;
}

export interface ClaudeUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/** What agents and packages depend on. Real (createClaude) or fake (stubClaude). */
export interface Claude {
  text(call: ClaudeCall): Promise<string>;
  json<T>(call: ClaudeJsonCall): Promise<T>;
}

export class ClaudeRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Claude declined the request${category ? ` (category: ${category})` : ""}, fallbacks included.`);
    this.name = "ClaudeRefusalError";
  }
}

export interface CreateClaudeOptions {
  /** Called once per request with token usage — agents log it for cost visibility. */
  onUsage?: (usage: ClaudeUsage) => void;
  /** Inject a client (tests). Defaults to `new Anthropic({ apiKey })`. */
  client?: Anthropic;
}

/**
 * Call Claude once and return the text. The simplest entry point:
 *
 *   const text = await runClaude(cfg.anthropic.apiKey, { model: MODELS.draft, system, user });
 */
export async function runClaude(apiKey: string, call: ClaudeCall): Promise<string> {
  return createClaude(apiKey).text(call);
}

/** A Claude bound to one API key. */
export function createClaude(apiKey: string, opts: CreateClaudeOptions = {}): Claude {
  const client = opts.client ?? new Anthropic({ apiKey });

  async function request(call: ClaudeCall, schema?: JsonSchema): Promise<string> {
    const response = await client.beta.messages.create({
      model: call.model,
      max_tokens: call.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: call.user }],
      output_config: {
        effort: call.effort ?? "medium",
        ...(schema ? { format: { type: "json_schema" as const, schema } } : {}),
      },
    });

    opts.onUsage?.({
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });

    if (response.stop_reason === "refusal") {
      throw new ClaudeRefusalError(response.stop_details?.category ?? null);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(`Claude hit max_tokens (${call.maxTokens ?? 16000}); the answer is cut off.`);
    }
    // Thinking blocks come first and are empty by default; we only want the answer text.
    return response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
  }

  return {
    text: (call) => request(call),
    async json<T>(call: ClaudeJsonCall): Promise<T> {
      return JSON.parse(await request(call, call.schema)) as T;
    },
  };
}

/**
 * A fake Claude for dry runs and tests: no network, no key. `reply` returns the text answer,
 * or for json() calls the parsed value (an object) or a JSON string.
 */
export function stubClaude(reply: (call: ClaudeCall | ClaudeJsonCall) => unknown): Claude {
  return {
    async text(call) {
      const out = reply(call);
      return typeof out === "string" ? out : JSON.stringify(out);
    },
    async json<T>(call: ClaudeJsonCall): Promise<T> {
      const out = reply(call);
      return (typeof out === "string" ? JSON.parse(out) : out) as T;
    },
  };
}
