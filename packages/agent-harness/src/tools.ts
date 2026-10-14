// Tool registry: zod schema → JSON Schema for the model; arguments are validated before the
// tool runs, every run has a timeout, and failures come back to the model as error results
// instead of failing the whole turn.

import { z } from "zod";

import type { ToolCall, ToolSpec } from "./llm/types.js";

/** What a tool can reach while it runs. `app` is whatever the app passes for this turn. */
export interface ToolContext<A = unknown> {
  sessionId: string;
  turnId: string;
  signal: AbortSignal;
  app: A;
}

export interface Tool<S extends z.ZodObject = z.ZodObject, A = unknown> {
  name: string;
  /** For the model: when to use it, and when not to. */
  description: string;
  schema: S;
  /** Returns the result text the model sees. Throw to report an error to the model. */
  run(args: z.infer<S>, ctx: ToolContext<A>): Promise<string> | string;
}

/** Type the arguments from the schema; annotate `ctx` to pick the app context type. */
export function defineTool<S extends z.ZodObject, A = unknown>(tool: Tool<S, A>): Tool<z.ZodObject, A> {
  return tool as unknown as Tool<z.ZodObject, A>;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

export class ToolRegistry<A = unknown> {
  private readonly tools = new Map<string, Tool<z.ZodObject, A>>();
  private readonly cachedSpecs: ToolSpec[];
  private readonly timeoutMs: number;

  constructor(tools: Tool<z.ZodObject, A>[], opts: { timeoutMs?: number } = {}) {
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    for (const t of tools) {
      if (this.tools.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
      this.tools.set(t.name, t);
    }
    // The tool set and its order are fixed for the life of the registry: changing them
    // changes the request prefix and invalidates the provider's prompt cache.
    this.cachedSpecs = tools.map((t) => {
      const { $schema: _ignored, ...parameters } = z.toJSONSchema(t.schema) as Record<string, unknown>;
      return Object.freeze({ name: t.name, description: t.description, parameters });
    });
    Object.freeze(this.cachedSpecs);
  }

  specs(): ToolSpec[] {
    return this.cachedSpecs;
  }

  /** Never throws: unknown tools, bad arguments, timeouts and exceptions become error results. */
  async execute(call: ToolCall, ctx: ToolContext<A>): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      const known = [...this.tools.keys()].join(", ");
      return { content: `Unknown tool: ${call.name}. Available tools: ${known}`, isError: true };
    }
    if (call.argsError) return { content: call.argsError, isError: true };

    const parsed = tool.schema.safeParse(call.args ?? {});
    if (!parsed.success) {
      return { content: `Invalid arguments, fix them and try again:\n${z.prettifyError(parsed.error)}`, isError: true };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const content = await Promise.race([
        Promise.resolve(tool.run(parsed.data, ctx)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out after ${this.timeoutMs} ms`)), this.timeoutMs);
        }),
      ]);
      return { content, isError: false };
    } catch (err) {
      return { content: `Tool failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    } finally {
      clearTimeout(timer);
    }
  }
}
