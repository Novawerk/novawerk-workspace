"use client";

// The Intake Agent session hook: create or resume a session, stream the agent's turns,
// save the visitor's draft edits (debounced PATCH) and send the result.
// All state folding lives in ./reducer; this file only does the side effects.

import {
  RESUME_ATTACHED_TEXT,
  intakeMessageInput,
  type IntakeDraftPatchInput,
  type IntakeEvent,
  type IntakeFailureReason,
  type IntakeMode,
  type IntakeSession,
  type ResumeRef,
} from "@nw/contracts";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";

import { track } from "@/lib/analytics";
import { seedFormDraft } from "@/lib/form-drafts";

import {
  IntakeApiError,
  getSession,
  isAbortError,
  patchDraft,
  startSession,
  streamMessage,
  streamResume,
  submitSession,
} from "./api";
import {
  displayDraft,
  initialIntakeState,
  intakeReducer,
  type AssistantMessage,
  type DraftEditValue,
  type DraftEdits,
  type IntakeState,
  type UserMessage,
} from "./reducer";

const SAVE_DELAY_MS = 700;
const HIGHLIGHT_MS = 1800;

export const sessionStorageKey = (mode: IntakeMode) => `nw:intake:${mode}`;

function readStoredId(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // Storage blocked (private mode): every visit starts fresh.
  }
}

function writeStoredId(key: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    // Ignore: resuming is a convenience.
  }
}

/** Short, human messages for the error banner. */
export function describeError(error: unknown): string {
  // A stream that breaks mid-reply surfaces as a TypeError from the body reader.
  if (error instanceof TypeError) return "The connection dropped before the reply was done. Please try again.";
  if (!(error instanceof IntakeApiError)) return "Something went wrong on our side. Please try again.";
  switch (error.status) {
    case 0:
      return error.message;
    // A field the API refused (a CV it can't find): its own words.
    case 400:
      return Object.values(error.issues ?? {}).flat()[0] ?? "That didn't go through. Please try again.";
    case 404:
      return "This chat has expired. Start over, and we'll keep it short.";
    // Busy (409), already sent (410), limits (429), too long (413): the API words these for visitors.
    case 409:
    case 410:
    case 413:
    case 429:
      return error.message.startsWith("HTTP ") ? "That didn't go through. Please try again in a moment." : error.message;
    default:
      return "Something went wrong on our side. Please try again.";
  }
}

/** The session can't continue (unknown, expired or already sent): offer "Start over", not "Try again". */
const isClosed = (error: unknown) => error instanceof IntakeApiError && (error.status === 404 || error.status === 410);

/** A saved session id the API doesn't know (any more): start a new chat instead. */
const cannotResume = (error: unknown) => error instanceof IntakeApiError && [400, 404, 410].includes(error.status);

/** For the usage count: why a reply didn't arrive, from the status alone. */
function failureReason(error: unknown): IntakeFailureReason {
  if (error instanceof TypeError) return "network";
  if (!(error instanceof IntakeApiError)) return "error";
  if (error.status === 0) return "network";
  if (error.status === 409) return "busy";
  if (error.status === 413 || error.status === 429) return "limit";
  if (error.status === 404 || error.status === 410) return "gone";
  if (error.status === 503) return "unavailable";
  return "error";
}

/** Visitor messages so far (a resumed chat counts its earlier ones). */
export const turnsOf = (state: IntakeState) => state.messages.filter((m) => m.role === "user").length;

const localId = () =>
  `local-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

const hasKeys = (value: object) => Object.keys(value).length > 0;

export type SubmitResult =
  | { ok: true }
  | { ok: false; issues?: Record<string, string[]>; message?: string };

export function useIntake(pageMode: IntakeMode) {
  const [state, dispatch] = useReducer(intakeReducer, initialIntakeState);
  const storageKey = sessionStorageKey(pageMode);

  // Latest state for callbacks and timers (updated after every commit).
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  /** Non-null while a turn is in flight. */
  const controllerRef = useRef<AbortController | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<boolean> | null>(null);
  /** Bumped by "Start over" so a slow, older start can't overwrite the new session. */
  const generationRef = useRef(0);
  const seqRef = useRef(0);
  const startedRef = useRef(false);
  /** Draft fields the visitor has edited in this chat (counted once each). */
  const editedRef = useRef(new Set<string>());

  const modeOf = useCallback((s: IntakeState): IntakeMode => s.serverDraft.mode ?? pageMode, [pageMode]);

  // ─── Session ───────────────────────────────────────────────────────────────

  const open = useCallback(
    async (fresh: boolean) => {
      const generation = ++generationRef.current;
      const current = () => generation === generationRef.current;
      dispatch({ type: "reset" });

      const load = (session: IntakeSession, resumed: boolean) => {
        if (!current()) return;
        writeStoredId(storageKey, session.id);
        dispatch({ type: "loaded", session });
        editedRef.current = new Set();
        track("intake_open", { mode: session.draft.mode ?? pageMode, resumed });
      };

      try {
        const savedId = fresh ? null : readStoredId(storageKey);
        if (savedId) {
          try {
            return load(await getSession(savedId), true);
          } catch (error) {
            if (!cannotResume(error)) throw error;
            writeStoredId(storageKey, null); // Expired or unknown: start a new one.
          }
        }
        load(await startSession(pageMode), false);
      } catch (error) {
        if (!current()) return;
        const unavailable = error instanceof IntakeApiError && error.unavailable;
        if (unavailable) track("intake_unavailable", { mode: pageMode });
        dispatch({
          type: "load_failed",
          unavailable,
          message:
            error instanceof IntakeApiError && (error.status === 0 || error.status === 429)
              ? describeError(error)
              : "We couldn't start the chat. Please try again.",
        });
      }
    },
    [pageMode, storageKey],
  );

  useEffect(() => {
    // Once per mount (StrictMode runs effects twice in dev; Activity re-runs them on show).
    if (startedRef.current) return;
    startedRef.current = true;
    void open(false);
  }, [open]);

  // ─── Draft edits ───────────────────────────────────────────────────────────

  /** Save pending edits now. Resolves false if the PATCH failed (the edits stay on screen). */
  const flushEdits = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    while (savingRef.current) await savingRef.current;

    const s = stateRef.current;
    if (!s.sessionId || s.status !== "open") return true;
    const sent: DraftEdits = { pitch: s.edits.pitch, join: s.edits.join };
    const patch: IntakeDraftPatchInput = {};
    if (hasKeys(sent.pitch)) patch.pitch = sent.pitch;
    if (hasKeys(sent.join)) patch.join = sent.join;
    if (!patch.pitch && !patch.join) return true;
    if (!s.serverDraft.mode) patch.mode = pageMode;

    const saving = patchDraft(s.sessionId, patch)
      .then((session) => {
        dispatch({ type: "saved", draft: session.draft, sent });
        return true;
      })
      .catch(() => {
        dispatch({ type: "save_failed" });
        return false;
      })
      .finally(() => {
        savingRef.current = null;
      });
    savingRef.current = saving;
    return saving;
  }, [pageMode]);

  const editField = useCallback(
    (mode: IntakeMode, field: string, value: DraftEditValue) => {
      dispatch({ type: "edit", mode, field, value });
      if (!editedRef.current.has(`${mode}.${field}`)) {
        editedRef.current.add(`${mode}.${field}`);
        track("intake_field_edit", { mode, field });
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void flushEdits(), SAVE_DELAY_MS);
    },
    [flushEdits],
  );

  // Save before the page is hidden: tab switch, or Next hiding this route on navigation.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushEdits();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (saveTimerRef.current) void flushEdits();
    };
  }, [flushEdits]);

  // ─── Chat ──────────────────────────────────────────────────────────────────

  /** True when a new turn can start now (a session, open, not busy, turns left). */
  const canTakeTurn = useCallback(
    (s: IntakeState) =>
      Boolean(s.sessionId) && s.phase === "ready" && s.status === "open" && !controllerRef.current && s.turnsLeft !== 0,
    [],
  );

  /**
   * One turn: show the visitor's bubble and an empty reply, stream the agent's events into it,
   * and handle every way it can end. `open` starts the request (a message, or an attached CV).
   */
  const runTurn = useCallback(
    async (text: string, open: (sessionId: string, signal: AbortSignal) => AsyncGenerator<IntakeEvent>) => {
      const s = stateRef.current;
      const sessionId = s.sessionId!;
      const controller = new AbortController();
      controllerRef.current = controller;

      // The agent should see what the visitor just typed into the panel.
      await flushEdits();

      const now = new Date().toISOString();
      const user: UserMessage = { id: localId(), role: "user", text, createdAt: now };
      const assistant: AssistantMessage = { id: localId(), role: "assistant", parts: [], createdAt: now };
      dispatch({ type: "send", user, assistant });
      const mode = modeOf(s);

      let stopped = false;
      try {
        for await (const event of open(sessionId, controller.signal)) {
          if (event.type === "error") track("intake_reply_failed", { mode, reason: "error" });
          const seq = ++seqRef.current;
          dispatch({ type: "event", assistantId: assistant.id, event, seq });
          if (event.type === "draft") {
            setTimeout(() => dispatch({ type: "clear_changed", seq }), HIGHLIGHT_MS);
          }
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          stopped = true;
        } else if (error instanceof IntakeApiError && error.unavailable) {
          track("intake_unavailable", { mode });
          // The agent went away mid-chat: the plain form takes over with what we have so far.
          const draft = displayDraft(stateRef.current, pageMode);
          seedFormDraft(draft.mode, draft[draft.mode]);
          dispatch({ type: "unavailable" });
        } else {
          track("intake_reply_failed", { mode, reason: failureReason(error) });
          dispatch({
            type: "stream_failed",
            assistantId: assistant.id,
            userId: user.id,
            text,
            message: describeError(error),
            gone: isClosed(error),
          });
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        dispatch({ type: "stream_end", assistantId: assistant.id, stopped });
      }
    },
    [flushEdits, modeOf, pageMode],
  );

  const send = useCallback(
    async (raw: string, { suggestion = false }: { suggestion?: boolean } = {}): Promise<boolean> => {
      const s = stateRef.current;
      const parsed = intakeMessageInput.safeParse({ text: raw });
      if (!parsed.success || !canTakeTurn(s)) return false;
      const text = parsed.data.text;
      track("intake_message", { mode: modeOf(s), turn: turnsOf(s) + 1, suggestion });
      await runTurn(text, (sessionId, signal) => streamMessage(sessionId, text, signal));
      return true;
    },
    [canTakeTurn, modeOf, runTurn],
  );

  /**
   * The visitor uploaded a CV (lib/uploads.ts). In a turn of its own the agent reads it and fills
   * in the draft. When no turn can start (a reply is running, no turns left), the CV is only
   * attached, like an edit in the panel.
   */
  const attachResume = useCallback(
    async (resume: ResumeRef | null) => {
      const s = stateRef.current;
      const mode = modeOf(s);
      if (!editedRef.current.has(`${mode}.resume`)) {
        editedRef.current.add(`${mode}.resume`);
        track("intake_field_edit", { mode, field: "resume" });
      }
      if (!resume || !canTakeTurn(s)) {
        dispatch({ type: "edit", mode, field: "resume", value: resume });
        await flushEdits();
        return;
      }
      await runTurn(RESUME_ATTACHED_TEXT, (sessionId, signal) => streamResume(sessionId, { resume, mode }, signal));
    },
    [canTakeTurn, flushEdits, modeOf, runTurn],
  );

  const stop = useCallback(() => {
    if (!controllerRef.current) return;
    track("intake_stop", { mode: modeOf(stateRef.current) });
    controllerRef.current.abort();
  }, [modeOf]);

  /** Resend the turn that failed (its messages are removed first). */
  const retry = useCallback(() => {
    const s = stateRef.current;
    const failed = s.failed;
    if (!failed || controllerRef.current) return;
    // A CV turn is retried with the CV the draft holds now.
    const resume = failed.text === RESUME_ATTACHED_TEXT ? displayDraft(s, pageMode)[modeOf(s)].resume : null;
    dispatch({ type: "discard_failed" });
    // Let the discard commit (stateRef) before sending again.
    setTimeout(() => void (resume ? attachResume(resume) : send(failed.text)), 0);
  }, [attachResume, modeOf, pageMode, send]);

  const startOver = useCallback(() => {
    const s = stateRef.current;
    track("intake_start_over", { mode: modeOf(s), turns: turnsOf(s) });
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    writeStoredId(storageKey, null);
    void open(true);
  }, [modeOf, open, storageKey]);

  /** Reload after a failed start (or resume). */
  const reload = useCallback(() => void open(false), [open]);

  // ─── Send the draft ────────────────────────────────────────────────────────

  const submit = useCallback(
    async ({ consent }: { consent: boolean }): Promise<SubmitResult> => {
      const s = stateRef.current;
      if (!s.sessionId || !consent) return { ok: false };
      const mode = modeOf(s);
      if (!(await flushEdits())) {
        track("intake_submit_failed", { mode, reason: "error" });
        return { ok: false, message: "We couldn't save your last edit. Please try again." };
      }
      try {
        await submitSession(s.sessionId, { consent: true });
        dispatch({ type: "submitted" });
        track("intake_submitted", { mode, turns: turnsOf(s) });
        return { ok: true };
      } catch (error) {
        if (error instanceof IntakeApiError && error.issues && hasKeys(error.issues)) {
          track("intake_submit_failed", { mode, reason: "invalid" });
          return { ok: false, issues: error.issues };
        }
        track("intake_submit_failed", { mode, reason: "error" });
        return { ok: false, message: describeError(error) };
      }
    },
    [flushEdits, modeOf],
  );

  return {
    state,
    draft: displayDraft(state, pageMode),
    streaming: state.streamingId !== null,
    send,
    stop,
    retry,
    reload,
    startOver,
    editField,
    attachResume,
    submit,
  };
}

export type IntakeController = ReturnType<typeof useIntake>;
