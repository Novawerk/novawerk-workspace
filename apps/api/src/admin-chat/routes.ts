// /admin/chat: the admin assistant. Mounted under /admin, so every request already carries a
// signed-in admin (requireSession). A chat belongs to the member who started it; nobody else
// can read or continue it.
//
//   POST /admin/chat/sessions               → 201 AdminChatSession
//   GET  /admin/chat/sessions/:id           → AdminChatSession
//   POST /admin/chat/sessions/:id/messages  → text/event-stream, one AdminChatEvent per `data:` line
//
// The assistant reads; its only write is draft_email, which queues a pending outbox row. The
// gate in @nw/email stays the only way out.

import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { Agent, renderTurnContext, SessionBusyError, type AgentErrorCode, type AgentEvent, type StoredMessage, type TurnTrace } from "@nw/agent-harness";
import {
  adminChatMessageInput,
  type AdminChatEvent,
  type AdminChatMessage,
  type AdminChatMessageInput,
  type AdminChatPart,
  type AdminChatSession,
} from "@nw/contracts";
import { agentSessions, memberApplications, projectSubmissions, type AgentSession, type Database } from "@nw/db";

import { notFound, notFoundIfInvalid, rejectInvalid } from "../http.js";
import { agentTurnEvent, recordServerEvent } from "../analytics/record.js";
import { PgAgentStore, acquireTurn, releaseTurn } from "../intake-chat/store.js";
import type { AdminChatOptions, AdminMember, ApiEnv, Logger } from "../types.js";
import type { AdminDeps } from "../routes/admin/shared.js";
import { uuidParam } from "../routes/admin/shared.js";
import { ADMIN_ASSISTANT, ADMIN_SYSTEM_PROMPT } from "./prompt.js";
import { createAdminTools, type AdminToolApp } from "./tools.js";

export const ADMIN_CHAT_DEFAULTS = { maxSteps: 8, maxTurns: 200, turnLockMs: 5 * 60_000 } as const;

/** Keeps proxies from closing the stream while the model thinks. */
const PING_MS = 15_000;
/** Tool output shown in the panel; the model sees all of it. */
const MAX_SHOWN_OUTPUT = 4_000;

const ERRORS: Record<AgentErrorCode, string> = {
  model_error: "The assistant couldn't answer just now. Try again in a moment.",
  internal: "Something went wrong on our side. Try again in a moment.",
  refusal: "The assistant can't help with that one.",
  max_tokens: "That answer got too long and was cut off. Ask for less at once.",
  max_steps: "The assistant stopped to keep things short. Send another message to continue.",
};
const BUSY = "The assistant is still answering your last message.";
const NO_TURNS = "This chat is full. Start a new one.";

const shorten = (text: string) =>
  text.length > MAX_SHOWN_OUTPUT ? `${text.slice(0, MAX_SHOWN_OUTPUT)}… (${text.length - MAX_SHOWN_OUTPUT} more characters)` : text;

/** Stored history → what the panel shows: one bubble per turn, text and tool parts in order. */
export function toAdminChatMessages(stored: StoredMessage[]): AdminChatMessage[] {
  const out: AdminChatMessage[] = [];
  const tools = new Map<string, Extract<AdminChatPart, { type: "tool" }>>();
  let bubble: Extract<AdminChatMessage, { role: "assistant" }> | null = null;
  let bubbleTurn = "";
  for (const s of stored) {
    const m = s.message;
    if (m.role === "user") {
      bubble = null;
      out.push({ id: s.id, role: "user", text: m.text, createdAt: s.createdAt });
      continue;
    }
    if (m.role === "tool") {
      const part = tools.get(m.toolCallId);
      if (part) {
        part.status = m.isError ? "error" : "done";
        part.output = shorten(m.content);
      }
      continue;
    }
    if (!bubble || bubbleTurn !== s.turnId) {
      bubble = { id: s.id, role: "assistant", parts: [], createdAt: s.createdAt };
      bubbleTurn = s.turnId;
      out.push(bubble);
    }
    if (m.text) bubble.parts.push({ type: "text", text: m.text });
    for (const call of m.toolCalls) {
      const part: Extract<AdminChatPart, { type: "tool" }> = {
        type: "tool",
        id: call.id,
        name: call.name,
        input: call.args ?? null,
        status: "running",
      };
      tools.set(call.id, part);
      bubble.parts.push(part);
    }
  }
  return out;
}

/** The per-turn context: who is asking and, if the panel is open on one, which record. */
async function turnContext(db: Database, member: AdminMember, subject: AdminChatMessageInput["subject"]) {
  const sections = [{ tag: "signed_in", body: `${member.displayName} (member id ${member.id})` }];
  if (subject?.kind === "submission") {
    const [row] = await db
      .select({ projectName: projectSubmissions.projectName, name: projectSubmissions.name, status: projectSubmissions.status })
      .from(projectSubmissions)
      .where(eq(projectSubmissions.id, subject.id))
      .limit(1);
    if (row) {
      sections.push({
        tag: "open_record",
        body: `The member is looking at the pitch "${row.projectName}" by ${row.name} (status ${row.status}, id ${subject.id}). "This pitch" means this one; read it with get_submission.`,
      });
    }
  } else if (subject?.kind === "application") {
    const [row] = await db
      .select({ name: memberApplications.name, status: memberApplications.status })
      .from(memberApplications)
      .where(eq(memberApplications.id, subject.id))
      .limit(1);
    if (row) {
      sections.push({
        tag: "open_record",
        body: `The member is looking at the membership application from ${row.name} (status ${row.status}, id ${subject.id}). "This application" means this one; read it with get_application.`,
      });
    }
  }
  return renderTurnContext({ sections });
}

export function toAdminChatEvent(event: AgentEvent, sessionId: string, logger: Logger): AdminChatEvent | null {
  switch (event.type) {
    case "turn_start":
      return { type: "turn_start", turnId: event.turnId };
    case "text_delta":
      return { type: "text_delta", text: event.text };
    case "tool_call":
      return { type: "tool_call", id: event.id, name: event.name, input: event.args ?? null };
    case "tool_result":
      return { type: "tool_result", id: event.id, name: event.name, isError: event.isError, output: shorten(event.result) };
    case "error":
      if (event.code === "model_error" || event.code === "internal") {
        logger.error(`[api] admin chat turn error (session ${sessionId}, ${event.code}): ${event.message}`);
      }
      return { type: "error", message: ERRORS[event.code] };
    default:
      return null;
  }
}

export function adminChatRoutes({ db, logger, adminChat }: AdminDeps) {
  const options: AdminChatOptions | null = adminChat && "provider" in adminChat ? adminChat : null;
  const unavailable = adminChat && "unavailable" in adminChat ? adminChat.unavailable : "no LLM provider configured";
  const store = new PgAgentStore(db);
  const chat = options && {
    maxTurns: options.maxTurns ?? ADMIN_CHAT_DEFAULTS.maxTurns,
    turnLockMs: options.turnLockMs ?? ADMIN_CHAT_DEFAULTS.turnLockMs,
    agent: new Agent<AdminToolApp>({
      store,
      provider: options.provider,
      tools: createAdminTools(),
      hooks: options.hooks ?? [],
      maxSteps: options.maxSteps ?? ADMIN_CHAT_DEFAULTS.maxSteps,
    }),
  };
  const live = () => chat!;

  /** The member's own admin-assistant session, or undefined. */
  async function ownSession(id: string, memberId: string): Promise<AgentSession | undefined> {
    const [row] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.id, id), eq(agentSessions.agent, ADMIN_ASSISTANT), eq(agentSessions.memberId, memberId)))
      .limit(1);
    return row;
  }

  const toSession = async (row: AgentSession): Promise<AdminChatSession> => ({
    id: row.id,
    messages: toAdminChatMessages(await store.listMessages(row.id)),
  });

  return new Hono<ApiEnv>()
    .use("*", async (c, next) => {
      if (!chat) return c.json({ error: `The assistant is switched off on this server (${unavailable}).` }, 503);
      await next();
    })

    .post("/sessions", async (c) => {
      const [row] = await db
        .insert(agentSessions)
        .values({ agent: ADMIN_ASSISTANT, systemPrompt: ADMIN_SYSTEM_PROMPT, draft: {}, memberId: c.get("member").id })
        .returning();
      return c.json({ id: row!.id, messages: [] } satisfies AdminChatSession, 201);
    })

    .get("/sessions/:id", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
      const row = await ownSession(c.req.valid("param").id, c.get("member").id);
      return row ? c.json(await toSession(row), 200) : c.json(notFound, 404);
    })

    .post(
      "/sessions/:id/messages",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", adminChatMessageInput, rejectInvalid),
      async (c) => {
        const { agent, maxTurns, turnLockMs } = live();
        const { id } = c.req.valid("param");
        const { text, subject } = c.req.valid("json");
        const member = c.get("member");

        const row = await ownSession(id, member.id);
        if (!row) return c.json(notFound, 404);
        if (row.userTurns >= maxTurns) return c.json({ error: NO_TURNS }, 429);
        const locked = await acquireTurn(db, id, { maxTurns, lockMs: turnLockMs });
        if (!locked) return c.json({ error: BUSY }, 409);
        const token = locked.turnLockedUntil;
        const context = await turnContext(db, member, subject);

        return streamSSE(c, async (stream) => {
          const abort = new AbortController();
          stream.onAbort(() => abort.abort());
          c.req.raw.signal?.addEventListener("abort", () => abort.abort(), { once: true });

          let chain: Promise<unknown> = Promise.resolve();
          const send = (event: AdminChatEvent) => {
            chain = chain.then(() => stream.writeSSE({ data: JSON.stringify(event) })).catch(() => {});
          };
          const ping = setInterval(() => {
            chain = chain.then(() => stream.write(": ping\n\n")).catch(() => {});
          }, PING_MS);

          let turnEnd: AdminChatEvent | null = null;
          let trace: TurnTrace | null = null;
          let errorCode: AgentErrorCode | null = null;
          try {
            trace = await agent.runTurn({
              sessionId: id,
              userText: text,
              context,
              app: { db, member },
              emit: (event) => {
                if (event.type === "error") errorCode ??= event.code;
                if (event.type === "turn_end") turnEnd = { type: "turn_end", turnId: event.turnId };
                else {
                  const mapped = toAdminChatEvent(event, id, logger);
                  if (mapped) send(mapped);
                }
              },
              signal: abort.signal,
            });
          } catch (err) {
            logger.error(`[api] admin chat turn failed (session ${id}):`, err);
            errorCode ??= "internal";
            send({ type: "error", message: err instanceof SessionBusyError ? BUSY : ERRORS.internal });
          } finally {
            clearInterval(ping);
            await releaseTurn(db, id, token).catch((err) =>
              logger.error(`[api] could not release admin chat lock (session ${id}):`, err),
            );
            if (turnEnd) send(turnEnd);
            const usage = agentTurnEvent(ADMIN_ASSISTANT, { turn: locked.userTurns, trace, error: errorCode });
            await Promise.all([chain, recordServerEvent(db, usage, logger)]);
          }
        });
      },
    );
}
