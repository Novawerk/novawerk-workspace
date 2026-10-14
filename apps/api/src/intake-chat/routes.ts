// The Intake Agent chat on novawerk.io/submit and /join (contract: @nw/contracts intake.ts).
//
//   POST  /public/intake/sessions               → 201 IntakeSession (static greeting, no model call)
//   GET   /public/intake/sessions/:id           → IntakeSession (an untouched one gets the current greeting first)
//   POST  /public/intake/sessions/:id/messages  → text/event-stream, one IntakeEvent per `data:` line
//   PATCH /public/intake/sessions/:id/draft     → IntakeSession (the visitor edits the panel)
//   POST  /public/intake/sessions/:id/resume    → text/event-stream (the visitor attached a CV: the agent reads it)
//   POST  /public/intake/sessions/:id/submit    → 201 { ok, id } (the visitor pressed Send)
//
// The agent only collects and tidies. Send is the visitor's own click, and it lands through
// the same insert + notify + wake-up path as the plain forms (src/forms.ts).
//
// Abuse guards: message size (contract), a per-session turn cap, an in-memory per-IP cap on
// new sessions, and a cross-instance turn lock in Postgres (one reply at a time per session).

import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { Agent, SessionBusyError, type AgentErrorCode, type AgentEvent, type TurnTrace } from "@nw/agent-harness";
import {
  intakeDraftIssues,
  intakeDraftPatchInput,
  intakeMessageInput,
  intakeResumeInput,
  intakeStartInput,
  intakeSubmitInput,
  memberApplicationInput,
  projectSubmissionInput,
  RESUME_ATTACHED_TEXT,
  type IntakeEvent,
  type IntakeSession,
} from "@nw/contracts";
import { agentSessions, type AgentSession } from "@nw/db";

import { agentTurnEvent, recordServerEvent } from "../analytics/record.js";
import {
  announceMemberApplication,
  announceProjectSubmission,
  insertMemberApplication,
  insertProjectSubmission,
  RESUME_MISSING,
  resumeIssues,
} from "../forms.js";
import { honeypotFilled, issuesFrom, notFound, notFoundIfInvalid, rejectInvalid, validationFailed } from "../http.js";
import type { ApiEnv, AppDeps, IntakeChatOptions, Logger } from "../types.js";
import { buildIntakeContext } from "./context.js";
import { toDisplayMessages } from "./display.js";
import { loadIntakePrompts } from "./prompts.js";
import { FixedWindowLimiter, clientIp } from "./rate-limit.js";
import { resumeText } from "./resume-text.js";
import {
  INTAKE_AGENT,
  PgAgentStore,
  acquireTurn,
  createIntakeSession,
  draftOf,
  getIntakeSession,
  isUntouched,
  mergeDraft,
  refreshUntouchedSession,
  releaseTurn,
} from "./store.js";
import { createIntakeTools, type IntakeToolApp } from "./tools.js";

export const INTAKE_DEFAULTS = {
  maxTurns: 40,
  sessionsPerHour: 20,
  maxSteps: 6,
  turnLockMs: 5 * 60_000,
} as const;

/** A 4000-character message is at most ~16 KB of UTF-8; leave room for JSON. */
const MAX_BODY_BYTES = 32 * 1024;
/** Keeps proxies from closing the stream while the model thinks. */
const PING_MS = 15_000;

const MESSAGES = {
  busy: "We're still answering your last message. Wait for it to finish, then send again.",
  submitted: "This conversation was already sent. Start a new chat if you want to send something else.",
  noTurnsLeft:
    "This chat reached its message limit. Check the panel and press Send, or start a new chat.",
  tooManySessions: "Too many new chats from your network. Please try again later.",
  turnFailed: "Something went wrong on our side. Your draft is saved. Please try again in a moment.",
  resumesOff: "CV uploads are off right now. Add a link to your CV instead.",
} as const;

/** Visitor-facing text for harness errors; details go to the log, never to the browser. */
const TURN_ERRORS: Record<AgentErrorCode, string> = {
  model_error: "The assistant couldn't answer just now. Your draft is saved. Please send your message again.",
  internal: MESSAGES.turnFailed,
  refusal: "The assistant can't help with that one. Try putting it another way.",
  max_tokens: "That reply got too long and was cut off. Ask again, maybe in smaller steps.",
  max_steps: "The assistant stopped to keep things short. Send another message to continue.",
};

const idParam = z.object({ id: z.uuid() });

type LockedSession = AgentSession & { turnLockedUntil: Date };

const readJson = (c: Context): Promise<unknown> => c.req.json().catch(() => ({}));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function intakeChatRoutes({ db, logger, notify, triggerIntake, intakeChat, files }: AppDeps & { logger: Logger }) {
  const announce = { notify, logger, triggerIntake };
  const store = new PgAgentStore(db);

  const options: IntakeChatOptions | null = intakeChat && "provider" in intakeChat ? intakeChat : null;
  const unavailable = intakeChat && "unavailable" in intakeChat ? intakeChat.unavailable : "no LLM provider configured";
  if (intakeChat && !options) logger.warn(`[api] Intake Agent chat is off: ${unavailable}`);

  const chat = options && {
    maxTurns: options.maxTurns ?? INTAKE_DEFAULTS.maxTurns,
    turnLockMs: options.turnLockMs ?? INTAKE_DEFAULTS.turnLockMs,
    limiter: new FixedWindowLimiter(options.sessionsPerHour ?? INTAKE_DEFAULTS.sessionsPerHour, 60 * 60_000),
    agent: new Agent<IntakeToolApp>({
      store,
      provider: options.provider,
      tools: createIntakeTools(),
      hooks: options.hooks ?? [],
      maxSteps: options.maxSteps ?? INTAKE_DEFAULTS.maxSteps,
    }),
  };
  // Every handler below runs only when `chat` is set (the first middleware answers 503 otherwise).
  const live = () => chat!;

  const turnsLeft = (row: AgentSession) => Math.max(0, live().maxTurns - row.userTurns);

  async function toIntakeSession(row: AgentSession): Promise<IntakeSession> {
    return {
      id: row.id,
      draft: draftOf(row),
      status: row.status,
      messages: toDisplayMessages(await store.listMessages(row.id)),
      turnsLeft: turnsLeft(row),
    };
  }

  /** Why this session can't take a new message, if it can't (busy is checked by the lock). */
  function blocked(row: AgentSession) {
    if (row.status === "submitted") return { status: 410 as const, error: MESSAGES.submitted };
    if (turnsLeft(row) === 0) return { status: 429 as const, error: MESSAGES.noTurnsLeft };
    return null;
  }

  /** Lock the session for one turn (and count it), or answer why it can't take one. */
  async function lockTurn(c: Context<ApiEnv>, id: string): Promise<LockedSession | Response> {
    const { maxTurns, turnLockMs } = live();
    const row = await getIntakeSession(db, id);
    if (!row) return c.json(notFound, 404);
    const no = blocked(row);
    if (no) return c.json({ error: no.error }, no.status);
    const locked = await acquireTurn(db, id, { maxTurns, lockMs: turnLockMs });
    if (locked) return locked;
    const now = await getIntakeSession(db, id);
    const why = now && blocked(now);
    return why ? c.json({ error: why.error }, why.status) : c.json({ error: MESSAGES.busy }, 409);
  }

  /** The CV's text for the agent, or null when it has none we can read (or reading fails). */
  async function readResume(pathname: string, contentType: string): Promise<string | null> {
    try {
      const file = await files!.openPrivate(pathname);
      if (!file) return null;
      const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
      return await resumeText(bytes, contentType);
    } catch (err) {
      logger.warn(`[api] could not read the CV ${pathname}:`, err);
      return null;
    }
  }

  /**
   * Run one agent turn on a locked session and stream its events (one IntakeEvent per `data:`
   * line). `first` goes out before the turn starts. The lock is released at the end.
   */
  function streamTurn(
    c: Context<ApiEnv>,
    locked: LockedSession,
    turn: { text: string; context: string; first?: IntakeEvent[] },
  ) {
    const { agent } = live();
    const id = locked.id;
    const token = locked.turnLockedUntil;

    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      c.req.raw.signal?.addEventListener("abort", () => abort.abort(), { once: true });

      // Writes go out in order; once the client is gone they fail quietly.
      let chain: Promise<unknown> = Promise.resolve();
      const send = (event: IntakeEvent) => {
        chain = chain.then(() => stream.writeSSE({ data: JSON.stringify(event) })).catch(() => {});
      };
      const ping = setInterval(() => {
        chain = chain.then(() => stream.write(": ping\n\n")).catch(() => {});
      }, PING_MS);
      for (const event of turn.first ?? []) send(event);

      let turnEnd: IntakeEvent | null = null;
      let trace: TurnTrace | null = null;
      let errorCode: AgentErrorCode | null = null;
      try {
        trace = await agent.runTurn({
          sessionId: id,
          userText: turn.text,
          context: turn.context,
          app: { db, onDraft: (draft) => send({ type: "draft", draft }) },
          emit: (event) => {
            if (event.type === "error") errorCode ??= event.code;
            if (event.type === "turn_end") turnEnd = { type: "turn_end", turnId: event.turnId };
            else {
              const mapped = toIntakeEvent(event, id, logger);
              if (mapped) send(mapped);
            }
          },
          signal: abort.signal,
        });
      } catch (err) {
        logger.error(`[api] intake turn failed (session ${id}):`, err);
        errorCode ??= "internal";
        send({ type: "error", message: err instanceof SessionBusyError ? MESSAGES.busy : MESSAGES.turnFailed });
      } finally {
        clearInterval(ping);
        // Release before turn_end goes out: a visitor who answers at once must not get a 409.
        await releaseTurn(db, id, token).catch((err) => logger.error(`[api] could not release turn lock (session ${id}):`, err));
        if (turnEnd) send(turnEnd);
        const usage = agentTurnEvent(INTAKE_AGENT, {
          mode: draftOf(locked).mode,
          turn: locked.userTurns,
          trace,
          error: errorCode,
        });
        await Promise.all([chain, recordServerEvent(db, usage, logger)]);
      }
    });
  }

  return new Hono<ApiEnv>()
    .use("*", async (c, next) => {
      if (!chat) {
        return c.json({ error: `The intake assistant is switched off on this server (${unavailable}). Please use the form instead.` }, 503);
      }
      await next();
    })
    .use(
      "*",
      bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: (c) => c.json({ error: "Request body too large" }, 413),
      }),
    )

    .post("/sessions", async (c) => {
      const body = await readJson(c);
      // Honeypot: a bot filled the hidden field. Nothing is created.
      if (honeypotFilled(body)) return c.body(null, 204);
      const parsed = intakeStartInput.safeParse(body);
      if (!parsed.success) return c.json(validationFailed(issuesFrom(parsed.error)), 400);
      if (!live().limiter.take(clientIp(c))) return c.json({ error: MESSAGES.tooManySessions }, 429);

      const prompts = loadIntakePrompts();
      const mode = parsed.data.mode ?? null;
      const row = await createIntakeSession(db, {
        mode,
        systemPrompt: prompts.system,
        greeting: prompts.greetings[mode ?? "unknown"],
      });
      await recordServerEvent(db, { name: "intake_session_created", props: { mode } }, logger);
      return c.json(await toIntakeSession(row), 201);
    })

    .get("/sessions/:id", zValidator("param", idParam, notFoundIfInvalid), async (c) => {
      const row = await getIntakeSession(db, c.req.valid("param").id);
      if (!row) return c.json(notFound, 404);
      if (isUntouched(row)) {
        const prompts = loadIntakePrompts();
        await refreshUntouchedSession(db, row.id, {
          systemPrompt: prompts.system,
          greeting: (mode) => prompts.greetings[mode ?? "unknown"],
        });
      }
      return c.json(await toIntakeSession(row), 200);
    })

    .post(
      "/sessions/:id/messages",
      zValidator("param", idParam, notFoundIfInvalid),
      zValidator("json", intakeMessageInput, rejectInvalid),
      async (c) => {
        const locked = await lockTurn(c, c.req.valid("param").id);
        if (locked instanceof Response) return locked;
        // Rendered after taking the lock, so it carries the visitor's latest panel edits.
        const context = buildIntakeContext({
          draft: draftOf(locked),
          turnsLeft: turnsLeft(locked),
          reminder: loadIntakePrompts().turnReminder,
        });
        return streamTurn(c, locked, { text: c.req.valid("json").text, context });
      },
    )

    // The visitor attached a CV in the chat (the file is already in the private store). It goes
    // into the draft, and the agent reads its text in a turn of its own and fills in the rest.
    .post(
      "/sessions/:id/resume",
      zValidator("param", idParam, notFoundIfInvalid),
      zValidator("json", intakeResumeInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const { resume, mode: pageMode } = c.req.valid("json");
        // 400, not 503: to the chat client a 503 means "the assistant is off, show the form".
        if (!files?.ready.private) return c.json(validationFailed({ resume: [MESSAGES.resumesOff] }), 400);
        const file = await files.statPrivate(resume.pathname);
        if (!file) return c.json(validationFailed({ resume: [RESUME_MISSING] }), 400);

        const locked = await lockTurn(c, id);
        if (locked instanceof Response) return locked;
        const mode = draftOf(locked).mode ?? pageMode;
        const draft = mode ? await mergeDraft(db, id, { mode, [mode]: { resume } }) : undefined;
        if (!draft) {
          await releaseTurn(db, id, locked.turnLockedUntil);
          return c.json(validationFailed({ mode: ["Pick: pitch a project, or join as a Member"] }), 400);
        }

        const context = buildIntakeContext({
          draft,
          turnsLeft: turnsLeft(locked),
          reminder: loadIntakePrompts().turnReminder,
          cvText: await readResume(resume.pathname, file.contentType),
        });
        return streamTurn(c, locked, { text: RESUME_ATTACHED_TEXT, context, first: [{ type: "draft", draft }] });
      },
    )

    .patch(
      "/sessions/:id/draft",
      zValidator("param", idParam, notFoundIfInvalid),
      zValidator("json", intakeDraftPatchInput, rejectInvalid),
      async (c) => {
        const { id } = c.req.valid("param");
        const row = await getIntakeSession(db, id);
        if (!row) return c.json(notFound, 404);
        if (row.status === "submitted") return c.json({ error: MESSAGES.submitted }, 410);
        const draft = await mergeDraft(db, id, c.req.valid("json"));
        if (!draft) return c.json({ error: MESSAGES.submitted }, 410);
        return c.json(await toIntakeSession({ ...row, draft }), 200);
      },
    )

    .post("/sessions/:id/submit", zValidator("param", idParam, notFoundIfInvalid), async (c) => {
      const { id } = c.req.valid("param");
      const body = await readJson(c);
      const row = await getIntakeSession(db, id);
      if (!row) return c.json(notFound, 404);
      if (row.status === "submitted") return c.json({ error: MESSAGES.submitted }, 410);

      // Same rules as the plain forms: the draft must pass the form schema; consent is the
      // visitor's own tick in this request.
      const draft = draftOf(row);
      const clicks = isRecord(body) ? body : {};
      const issues: Record<string, string[]> = {};
      for (const [field, message] of Object.entries(intakeDraftIssues(draft))) issues[field] = [message];
      const consent = intakeSubmitInput.shape.consent.safeParse(clicks.consent);
      if (!consent.success) issues.consent = issuesFrom(consent.error)._form ?? ["Please accept the privacy note"];
      if (Object.keys(issues).length) return c.json(validationFailed(issues), 400);

      /** Claims the session (open → submitted) and stores the row in one transaction. */
      const claim = (insert: (tx: typeof db) => Promise<string>, link: "submissionId" | "applicationId") =>
        db.transaction(async (tx) => {
          const [claimed] = await tx
            .update(agentSessions)
            .set({ status: "submitted" })
            .where(and(eq(agentSessions.id, id), eq(agentSessions.status, "open")))
            .returning({ id: agentSessions.id });
          if (!claimed) return null;
          const newId = await insert(tx);
          await tx.update(agentSessions).set({ [link]: newId }).where(eq(agentSessions.id, id));
          return newId;
        });

      if (draft.mode === "pitch") {
        const parsed = projectSubmissionInput.safeParse({ ...draft.pitch, consent: true });
        if (!parsed.success) return c.json(validationFailed(issuesFrom(parsed.error)), 400);
        const cv = await resumeIssues(files, parsed.data.resume, logger);
        if (cv) return c.json(validationFailed(cv), 400);
        const newId = await claim((tx) => insertProjectSubmission(tx, parsed.data), "submissionId");
        if (!newId) return c.json({ error: MESSAGES.submitted }, 410);
        await recordServerEvent(db, { name: "form_received", props: { form: "pitch", via: "chat", turns: row.userTurns } }, logger);
        await announceProjectSubmission(announce, parsed.data, newId);
        return c.json({ ok: true as const, id: newId }, 201);
      }

      const parsed = memberApplicationInput.safeParse({ ...draft.join, consent: true });
      if (!parsed.success) return c.json(validationFailed(issuesFrom(parsed.error)), 400);
      const cv = await resumeIssues(files, parsed.data.resume, logger);
      if (cv) return c.json(validationFailed(cv), 400);
      const newId = await claim((tx) => insertMemberApplication(tx, parsed.data), "applicationId");
      if (!newId) return c.json({ error: MESSAGES.submitted }, 410);
      await recordServerEvent(db, { name: "form_received", props: { form: "join", via: "chat", turns: row.userTurns } }, logger);
      await announceMemberApplication(announce, parsed.data, newId);
      return c.json({ ok: true as const, id: newId }, 201);
    });
}

function toIntakeEvent(event: AgentEvent, sessionId: string, logger: Logger): IntakeEvent | null {
  switch (event.type) {
    case "turn_start":
      return { type: "turn_start", turnId: event.turnId };
    case "text_delta":
      return { type: "text_delta", text: event.text };
    case "tool_call":
      return { type: "tool_call", id: event.id, name: event.name };
    case "tool_result":
      return { type: "tool_result", id: event.id, name: event.name, isError: event.isError };
    case "error":
      if (event.code === "model_error" || event.code === "internal") {
        logger.error(`[api] intake turn error (session ${sessionId}, ${event.code}): ${event.message}`);
      }
      return { type: "error", message: TURN_ERRORS[event.code] };
    default:
      // step_start, reasoning_delta, usage stay server-side (traces); turn_end is sent by the caller.
      return null;
  }
}
