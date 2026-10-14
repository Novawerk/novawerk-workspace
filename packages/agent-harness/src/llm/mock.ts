// A model that needs no API key: tests script it step by step; local dev uses a demo step
// so the whole chain (streaming text, tool calls, app state) works offline.

import {
  emptyUsage,
  type AssistantMessage,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type StreamHandlers,
} from "./types.js";

type MockOutput = Pick<AssistantMessage, "text" | "toolCalls"> & { reasoning?: string };

/** One scripted step: given the request, what the assistant says and which tools it calls. */
export type MockStep = (req: ModelRequest) => MockOutput | Promise<MockOutput>;

export interface MockProviderOptions {
  /** Replayed in order, one entry per model call (tests). Throws when it runs out. */
  script?: MockStep[];
  /** Used for every call when there is no script (local dev). Defaults to an echo. */
  demo?: MockStep;
  /** Delay between streamed text chunks. Default: 0 with a script, 15 ms in demo mode. */
  chunkDelayMs?: number;
}

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

export class MockProvider implements ModelProvider {
  readonly name = "mock";
  readonly model = "mock";
  /** Every request received, for assertions. */
  readonly requests: ModelRequest[] = [];
  private readonly script: MockStep[] | null;
  private readonly demo: MockStep;
  private readonly chunkDelayMs: number;

  constructor(opts: MockProviderOptions | MockStep[] = {}) {
    const o = Array.isArray(opts) ? { script: opts } : opts;
    this.script = o.script ? [...o.script] : null;
    this.demo = o.demo ?? echoStep;
    this.chunkDelayMs = o.chunkDelayMs ?? (this.script ? 0 : 15);
  }

  buildRequest(req: ModelRequest) {
    return { model: this.model, system: req.system, messages: req.messages, tools: req.tools.map((t) => t.name) };
  }

  async stream(req: ModelRequest, handlers: StreamHandlers): Promise<ModelResponse> {
    this.requests.push(req);
    const step = this.script ? this.script.shift() : this.demo;
    if (!step) throw new Error("MockProvider: the script ran out of steps");
    if (req.signal?.aborted) throw abortError();
    const out = await step(req);

    if (out.reasoning) handlers.onReasoning?.(out.reasoning);
    for (const piece of chunk(out.text)) {
      if (req.signal?.aborted) throw abortError();
      handlers.onText?.(piece);
      if (this.chunkDelayMs) await sleep(this.chunkDelayMs);
    }
    if (req.signal?.aborted) throw abortError();

    const usage = emptyUsage();
    usage.inputTokens = Math.ceil((req.system.length + JSON.stringify(req.messages).length) / 4);
    usage.outputTokens = Math.ceil((out.text.length + JSON.stringify(out.toolCalls).length) / 4);
    return {
      message: {
        role: "assistant",
        text: out.text,
        toolCalls: out.toolCalls,
        ...(out.reasoning ? { reasoning: out.reasoning } : {}),
      },
      stopReason: out.toolCalls.length ? "tool_use" : "end_turn",
      usage,
    };
  }
}

/** Default demo: echo the last user message. Apps pass their own demo for richer behaviour. */
const echoStep: MockStep = (req) => {
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const said = lastUser?.role === "user" ? lastUser.text : "";
  return { text: `(mock model) You said: ${said}`, toolCalls: [] };
};

function* chunk(text: string, size = 8) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
