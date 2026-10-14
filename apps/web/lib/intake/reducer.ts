// The Intake Agent's client state as a pure reducer: session loading, the streamed assistant
// turn (text deltas, tool chips, draft updates) and the visitor's own draft edits.
// No clocks, ids or fetches in here — the hook puts those into the actions.

import {
  emptyIntakeDraft,
  type IntakeDisplayMessage,
  type IntakeDraft,
  type IntakeEvent,
  type IntakeMessagePart,
  type IntakeMode,
  type IntakeSession,
  type JoinDraft,
  type PitchDraft,
  type ResumeRef,
} from "@nw/contracts";

export type UserMessage = Extract<IntakeDisplayMessage, { role: "user" }>;
export type AssistantMessage = Extract<IntakeDisplayMessage, { role: "assistant" }>;
export type ToolPart = Extract<IntakeMessagePart, { type: "tool" }>;

export interface DraftEdits {
  pitch: PitchDraft;
  join: JoinDraft;
}

/** A field's new value: text, a list of choices, or the CV (null removes it). */
export type DraftEditValue = string | string[] | ResumeRef | null;

/** A turn that failed, kept so "Try again" can resend the same text. */
export interface FailedTurn {
  userId: string;
  assistantId: string;
  text: string;
  message: string;
  /** The session is gone or already sent, so retrying is pointless; offer "Start over". */
  gone: boolean;
}

export interface IntakeState {
  /** starting: creating or resuming a session. unavailable: the agent is off → plain form. */
  phase: "starting" | "ready" | "error" | "unavailable";
  loadError: string | null;
  sessionId: string | null;
  status: IntakeSession["status"];
  messages: IntakeDisplayMessage[];
  /** The draft as the API last reported it. */
  serverDraft: IntakeDraft;
  /** The visitor's edits not yet confirmed by a PATCH. Shown on top of `serverDraft`. */
  edits: DraftEdits;
  saveFailed: boolean;
  turnsLeft: number | null;
  /** The assistant message being streamed, or null. */
  streamingId: string | null;
  stopped: Record<string, true>;
  failed: FailedTurn | null;
  /** Fields the agent just changed, for a brief highlight and a screen-reader note. */
  changed: { fields: string[]; seq: number };
}

export const initialIntakeState: IntakeState = {
  phase: "starting",
  loadError: null,
  sessionId: null,
  status: "open",
  messages: [],
  serverDraft: emptyIntakeDraft(),
  edits: { pitch: {}, join: {} },
  saveFailed: false,
  turnsLeft: null,
  streamingId: null,
  stopped: {},
  failed: null,
  changed: { fields: [], seq: 0 },
};

export type IntakeAction =
  | { type: "reset" }
  | { type: "loaded"; session: IntakeSession }
  | { type: "load_failed"; message: string; unavailable: boolean }
  | { type: "unavailable" }
  | { type: "send"; user: UserMessage; assistant: AssistantMessage }
  | { type: "event"; assistantId: string; event: IntakeEvent; seq: number }
  | { type: "stream_failed"; assistantId: string; userId: string; text: string; message: string; gone: boolean }
  | { type: "stream_end"; assistantId: string; stopped: boolean }
  | { type: "discard_failed" }
  | { type: "edit"; mode: IntakeMode; field: string; value: DraftEditValue }
  | { type: "saved"; draft: IntakeDraft; sent: DraftEdits }
  | { type: "save_failed" }
  | { type: "submitted" }
  | { type: "clear_changed"; seq: number };

/** What the panel shows: the server's draft with the visitor's pending edits on top. */
export function displayDraft(state: IntakeState, fallbackMode: IntakeMode): IntakeDraft & { mode: IntakeMode } {
  const { serverDraft, edits } = state;
  return {
    mode: serverDraft.mode ?? fallbackMode,
    pitch: { ...serverDraft.pitch, ...edits.pitch },
    join: { ...serverDraft.join, ...edits.join },
  };
}

export function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case "reset":
      return initialIntakeState;

    case "loaded": {
      const { session } = action;
      return {
        ...initialIntakeState,
        phase: "ready",
        sessionId: session.id,
        status: session.status,
        messages: session.messages,
        serverDraft: session.draft,
        turnsLeft: session.turnsLeft,
      };
    }

    case "load_failed":
      return {
        ...state,
        phase: action.unavailable ? "unavailable" : "error",
        loadError: action.message,
      };

    case "unavailable":
      return { ...state, phase: "unavailable", streamingId: null };

    case "send":
      if (state.phase !== "ready" || state.streamingId) return state;
      return {
        ...state,
        messages: [...state.messages, action.user, action.assistant],
        streamingId: action.assistant.id,
        failed: null,
        turnsLeft: state.turnsLeft === null ? null : Math.max(0, state.turnsLeft - 1),
      };

    case "event":
      if (action.assistantId !== state.streamingId) return state;
      return applyEvent(state, action);

    case "stream_failed":
      return {
        ...state,
        failed: {
          userId: action.userId,
          assistantId: action.assistantId,
          text: action.text,
          message: action.message,
          gone: action.gone,
        },
      };

    case "stream_end": {
      const settled = updateParts(state, action.assistantId, settleRunningTools);
      return {
        ...settled,
        streamingId: settled.streamingId === action.assistantId ? null : settled.streamingId,
        stopped: action.stopped ? { ...settled.stopped, [action.assistantId]: true } : settled.stopped,
      };
    }

    case "discard_failed": {
      const failed = state.failed;
      if (!failed) return state;
      return {
        ...state,
        failed: null,
        messages: state.messages.filter((m) => m.id !== failed.userId && m.id !== failed.assistantId),
        turnsLeft: state.turnsLeft === null ? null : state.turnsLeft + 1,
      };
    }

    case "edit":
      return {
        ...state,
        edits: { ...state.edits, [action.mode]: { ...state.edits[action.mode], [action.field]: action.value } },
      };

    case "saved": {
      // Drop the edits the API now has; keep anything typed while the PATCH was in flight.
      const keep = (mode: IntakeMode) => {
        const current: Record<string, unknown> = state.edits[mode];
        const sent: Record<string, unknown> = action.sent[mode];
        return Object.fromEntries(Object.entries(current).filter(([key, value]) => !sameValue(value, sent[key])));
      };
      return {
        ...state,
        serverDraft: action.draft,
        edits: { pitch: keep("pitch"), join: keep("join") },
        saveFailed: false,
      };
    }

    case "save_failed":
      return { ...state, saveFailed: true };

    case "submitted":
      return { ...state, status: "submitted" };

    case "clear_changed":
      return action.seq === state.changed.seq ? { ...state, changed: { fields: [], seq: state.changed.seq } } : state;
  }
}

function applyEvent(state: IntakeState, action: Extract<IntakeAction, { type: "event" }>): IntakeState {
  const { assistantId: id, event } = action;
  switch (event.type) {
    case "text_delta":
      return updateParts(state, id, (parts) => appendText(parts, event.text));

    case "tool_call":
      return updateParts(state, id, (parts) =>
        parts.some((p) => p.type === "tool" && p.id === event.id)
          ? parts
          : [...parts, { type: "tool", id: event.id, name: event.name, status: "running" }],
      );

    case "tool_result":
      return updateParts(state, id, (parts) => {
        const known = parts.some((p) => p.type === "tool" && p.id === event.id);
        const status = event.isError ? "error" : "done";
        if (!known) return [...parts, { type: "tool", id: event.id, name: event.name, status }];
        return parts.map((p) => (p.type === "tool" && p.id === event.id ? { ...p, status } : p));
      });

    case "draft": {
      const mode = event.draft.mode ?? state.serverDraft.mode;
      const fields = mode ? changedFields(state.serverDraft[mode], event.draft[mode], state.edits[mode]) : [];
      return {
        ...state,
        serverDraft: event.draft,
        changed: fields.length > 0 ? { fields, seq: action.seq } : state.changed,
      };
    }

    case "error":
      return {
        ...state,
        failed: {
          userId: previousUserId(state, id),
          assistantId: id,
          text: previousUserText(state, id),
          message: event.message || "Something went wrong on our side.",
          gone: false,
        },
      };

    case "turn_end":
      return { ...state, streamingId: null };

    case "turn_start":
    default:
      return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function updateParts(
  state: IntakeState,
  messageId: string,
  fn: (parts: IntakeMessagePart[]) => IntakeMessagePart[],
): IntakeState {
  const index = state.messages.findIndex((m) => m.id === messageId);
  const target = state.messages[index];
  if (!target || target.role !== "assistant") return state;
  const parts = fn(target.parts);
  if (parts === target.parts) return state;
  const messages = state.messages.slice();
  messages[index] = { ...target, parts };
  return { ...state, messages };
}

function appendText(parts: IntakeMessagePart[], text: string): IntakeMessagePart[] {
  if (!text) return parts;
  const last = parts[parts.length - 1];
  if (last?.type === "text") return [...parts.slice(0, -1), { type: "text", text: last.text + text }];
  return [...parts, { type: "text", text }];
}

/** A stream that ended with tools still running: mark them, so no spinner spins forever. */
function settleRunningTools(parts: IntakeMessagePart[]): IntakeMessagePart[] {
  if (!parts.some((p) => p.type === "tool" && p.status === "running")) return parts;
  return parts.map((p) => (p.type === "tool" && p.status === "running" ? { ...p, status: "error" } : p));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, editing: Record<string, unknown>) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !(key in editing) && !sameValue(before[key], after[key]));
}

function previousUser(state: IntakeState, assistantId: string): UserMessage | undefined {
  const index = state.messages.findIndex((m) => m.id === assistantId);
  const before = state.messages[index - 1];
  return before?.role === "user" ? before : undefined;
}
const previousUserId = (state: IntakeState, assistantId: string) => previousUser(state, assistantId)?.id ?? "";
const previousUserText = (state: IntakeState, assistantId: string) => previousUser(state, assistantId)?.text ?? "";
