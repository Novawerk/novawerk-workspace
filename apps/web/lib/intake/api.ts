// Browser client for the Intake Agent endpoints in apps/api (see @nw/contracts → intake.ts).
// Every failure becomes an IntakeApiError with the HTTP status (0 = unreachable), so the UI
// can tell "the agent is off" (503) from "this session is gone" (404) from a bad draft (400).

import type {
  ApiError,
  IntakeDraftPatchInput,
  IntakeEvent,
  IntakeMode,
  IntakeResumeInput,
  IntakeSession,
  IntakeSubmitInput,
} from "@nw/contracts";

import { readSse } from "./sse";

export class IntakeApiError extends Error {
  readonly status: number;
  readonly issues?: Record<string, string[]>;

  constructor(status: number, message: string, issues?: Record<string, string[]>) {
    super(message);
    this.name = "IntakeApiError";
    this.status = status;
    this.issues = issues;
  }

  /** The API is up but the agent isn't (or the API isn't configured): use the plain form. */
  get unavailable() {
    return this.status === 503;
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function apiBase(): string | null {
  // Must be referenced literally so Next inlines it into the client bundle.
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  return base ? base.replace(/\/+$/, "") : null;
}

async function request(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; accept?: string } = {},
): Promise<Response> {
  const base = apiBase();
  // No API configured: behave like an agent that's switched off.
  if (!base) throw new IntakeApiError(503, "The API isn't configured.");

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        accept: init.accept ?? "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new IntakeApiError(0, "We can't reach Novawerk right now. Check your connection and try again.");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    const issues = body?.issues && typeof body.issues === "object" ? body.issues : undefined;
    throw new IntakeApiError(res.status, typeof body?.error === "string" ? body.error : `HTTP ${res.status}`, issues);
  }
  return res;
}

const sessionPath = (id: string) => `/public/intake/sessions/${encodeURIComponent(id)}`;

export async function startSession(mode: IntakeMode): Promise<IntakeSession> {
  const res = await request("/public/intake/sessions", { method: "POST", body: { mode } });
  return (await res.json()) as IntakeSession;
}

export async function getSession(id: string): Promise<IntakeSession> {
  const res = await request(sessionPath(id));
  return (await res.json()) as IntakeSession;
}

export async function patchDraft(id: string, patch: IntakeDraftPatchInput): Promise<IntakeSession> {
  const res = await request(`${sessionPath(id)}/draft`, { method: "PATCH", body: patch });
  return (await res.json()) as IntakeSession;
}

export async function submitSession(id: string, input: IntakeSubmitInput): Promise<{ ok: boolean; id: string }> {
  const res = await request(`${sessionPath(id)}/submit`, { method: "POST", body: input });
  return (await res.json()) as { ok: boolean; id: string };
}

const EVENT_TYPES = new Set<IntakeEvent["type"]>([
  "turn_start",
  "text_delta",
  "tool_call",
  "tool_result",
  "draft",
  "error",
  "turn_end",
]);

/** POST a visitor message and yield the agent's events as they stream in. Abort with `signal`. */
export function streamMessage(id: string, text: string, signal: AbortSignal): AsyncGenerator<IntakeEvent> {
  return streamTurn(`${sessionPath(id)}/messages`, { text }, signal);
}

/** Hand the agent a CV the visitor just uploaded; it reads it in a turn of its own. */
export function streamResume(id: string, input: IntakeResumeInput, signal: AbortSignal): AsyncGenerator<IntakeEvent> {
  return streamTurn(`${sessionPath(id)}/resume`, input, signal);
}

async function* streamTurn(path: string, body: unknown, signal: AbortSignal): AsyncGenerator<IntakeEvent> {
  const res = await request(path, { method: "POST", body, signal, accept: "text/event-stream" });
  if (!res.body) throw new IntakeApiError(res.status, "The server sent no stream.");

  for await (const message of readSse(res.body)) {
    let payload: unknown;
    try {
      payload = JSON.parse(message.data);
    } catch {
      continue;
    }
    if (!payload || typeof payload !== "object") continue;
    const type = (payload as { type?: unknown }).type ?? message.event;
    // Events this client doesn't know yet are skipped, so the API can add new ones safely.
    if (typeof type === "string" && EVENT_TYPES.has(type as IntakeEvent["type"])) {
      yield { ...(payload as object), type } as IntakeEvent;
    }
  }
}
