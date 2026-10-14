// /admin/posts/:id/chat: the post writer, a chat next to a post in the admin panel. One shared
// chat per post (every member who can see the post sees the same conversation). It reads the
// post, keeps its brief and has the promo agent rewrite it; it never approves or posts.
//
//   GET  /admin/posts/:id/chat           → AdminChatSession (created on first open)
//   POST /admin/posts/:id/chat/messages  → text/event-stream, one AdminChatEvent per `data:` line

import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono, type Context, type Next } from "hono";
import { streamSSE } from "hono/streaming";

import { Agent, renderTurnContext, SessionBusyError, type AgentErrorCode, type TurnTrace } from "@nw/agent-harness";
import { adminChatMessageInput, postLabel, type AdminChatEvent, type AdminChatSession } from "@nw/contracts";
import { agentSessions, posts, type AgentSession } from "@nw/db";

import { ADMIN_CHAT_DEFAULTS, toAdminChatEvent, toAdminChatMessages } from "../admin-chat/routes.js";
import { agentTurnEvent, recordServerEvent } from "../analytics/record.js";
import { notFound, notFoundIfInvalid, rejectInvalid } from "../http.js";
import { PgAgentStore, acquireTurn, releaseTurn } from "../intake-chat/store.js";
import { canSeeProject } from "../routes/admin/access.js";
import { uuidParam, type AdminDeps } from "../routes/admin/shared.js";
import type { AdminMember, ApiEnv } from "../types.js";
import { POST_WRITER, POST_WRITER_PROMPT } from "./prompt.js";
import { createPostTools, type PostToolApp } from "./tools.js";

const PING_MS = 15_000;
const BUSY = "The writer is still answering the last message.";
const NO_TURNS = "This chat is full.";
const FAILED = "Something went wrong on our side. Try again in a moment.";

export function postChatRoutes({ db, logger, adminChat, draftPost }: AdminDeps) {
  const options = adminChat && "provider" in adminChat ? adminChat : null;
  const unavailable = adminChat && "unavailable" in adminChat ? adminChat.unavailable : "no LLM provider configured";
  const store = new PgAgentStore(db);
  const agent =
    options &&
    new Agent<PostToolApp>({
      store,
      provider: options.provider,
      tools: createPostTools(),
      hooks: options.hooks ?? [],
      maxSteps: options.maxSteps ?? ADMIN_CHAT_DEFAULTS.maxSteps,
    });
  const maxTurns = options?.maxTurns ?? ADMIN_CHAT_DEFAULTS.maxTurns;
  // A rewrite waits for Claude inside the turn, so the lock lasts longer than the admin chat's.
  const turnLockMs = Math.max(options?.turnLockMs ?? 0, 10 * 60_000);

  /** The post, if this member may see it. */
  async function visiblePost(id: string, member: AdminMember) {
    const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!post) return undefined;
    if (member.canAdmin) return post;
    return post.projectId && (await canSeeProject(db, member, post.projectId)) ? post : undefined;
  }

  /** The post's chat, created on first use. */
  async function sessionOf(postId: string, memberId: string): Promise<AgentSession> {
    const [found] = await db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.agent, POST_WRITER), eq(agentSessions.postId, postId)))
      .orderBy(desc(agentSessions.createdAt))
      .limit(1);
    if (found) return found;
    const [created] = await db
      .insert(agentSessions)
      .values({ agent: POST_WRITER, systemPrompt: POST_WRITER_PROMPT, draft: {}, postId, memberId })
      .returning();
    return created!;
  }

  // Mounted next to the posts routes under /posts, so the check is scoped to the chat paths.
  const switchedOff = async (c: Context<ApiEnv>, next: Next) => {
    if (!agent) return c.json({ error: `The writer is switched off on this server (${unavailable}).` }, 503);
    await next();
  };

  return new Hono<ApiEnv>()
    .use("/:id/chat", switchedOff)
    .use("/:id/chat/*", switchedOff)

    .get("/:id/chat", zValidator("param", uuidParam, notFoundIfInvalid), async (c) => {
      const member = c.get("member");
      const post = await visiblePost(c.req.valid("param").id, member);
      if (!post) return c.json(notFound, 404);
      const session = await sessionOf(post.id, member.id);
      return c.json({ id: session.id, messages: toAdminChatMessages(await store.listMessages(session.id)) } satisfies AdminChatSession, 200);
    })

    .post(
      "/:id/chat/messages",
      zValidator("param", uuidParam, notFoundIfInvalid),
      zValidator("json", adminChatMessageInput, rejectInvalid),
      async (c) => {
        const member = c.get("member");
        const post = await visiblePost(c.req.valid("param").id, member);
        if (!post) return c.json(notFound, 404);
        const { text } = c.req.valid("json");
        const session = await sessionOf(post.id, member.id);
        if (session.userTurns >= maxTurns) return c.json({ error: NO_TURNS }, 429);
        const locked = await acquireTurn(db, session.id, { maxTurns, lockMs: turnLockMs });
        if (!locked) return c.json({ error: BUSY }, 409);
        const token = locked.turnLockedUntil;
        const context = renderTurnContext({
          sections: [
            { tag: "signed_in", body: `${member.displayName} (member id ${member.id})` },
            { tag: "open_post", body: `The post is "${postLabel(post.kind, post.seq, post.label)}" (id ${post.id}). Read it with read_post.` },
          ],
        });

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
            trace = await agent!.runTurn({
              sessionId: session.id,
              userText: text,
              context,
              app: { db, postId: post.id, ...(draftPost ? { draftPost } : {}) },
              emit: (event) => {
                if (event.type === "error") errorCode ??= event.code;
                if (event.type === "turn_end") turnEnd = { type: "turn_end", turnId: event.turnId };
                else {
                  const mapped = toAdminChatEvent(event, session.id, logger);
                  if (mapped) send(mapped);
                }
              },
              signal: abort.signal,
            });
          } catch (err) {
            logger.error(`[api] post chat turn failed (session ${session.id}):`, err);
            errorCode ??= "internal";
            send({ type: "error", message: err instanceof SessionBusyError ? BUSY : FAILED });
          } finally {
            clearInterval(ping);
            await releaseTurn(db, session.id, token).catch((err) =>
              logger.error(`[api] could not release post chat lock (session ${session.id}):`, err),
            );
            if (turnEnd) send(turnEnd);
            const usage = agentTurnEvent(POST_WRITER, { turn: locked.userTurns, trace, error: errorCode });
            await Promise.all([chain, recordServerEvent(db, usage, logger)]);
          }
        });
      },
    );
}
