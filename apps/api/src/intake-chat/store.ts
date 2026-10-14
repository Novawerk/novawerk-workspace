// Postgres side of the Intake Agent: the harness's AgentStore over agent_sessions /
// agent_messages / agent_traces, plus the session operations the routes need (create, atomic
// draft merge, the cross-instance turn lock, Send).

import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";

import type { AgentStore, Message, StoredMessage, TurnTrace } from "@nw/agent-harness";
import { emptyIntakeDraft, type IntakeDraft, type IntakeDraftPatchInput, type IntakeMode } from "@nw/contracts";
import { agentMessages, agentSessions, agentTraces, type AgentSession, type Database } from "@nw/db";

export const INTAKE_AGENT = "intake";
/** turn_id of the static greeting written when a session starts. */
export const GREETING_TURN = "greeting";

export class PgAgentStore implements AgentStore {
  constructor(private readonly db: Database) {}

  async getSession(sessionId: string) {
    const [row] = await this.db
      .select({
        id: agentSessions.id,
        systemPrompt: agentSessions.systemPrompt,
        lastInputTokens: agentSessions.lastInputTokens,
      })
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId))
      .limit(1);
    return row;
  }

  async updateSession(sessionId: string, patch: { lastInputTokens?: number }) {
    if (patch.lastInputTokens === undefined) return;
    await this.db
      .update(agentSessions)
      .set({ lastInputTokens: patch.lastInputTokens })
      .where(eq(agentSessions.id, sessionId));
  }

  async appendMessage(sessionId: string, turnId: string, message: Message) {
    await this.db.insert(agentMessages).values({ sessionId, turnId, payload: message });
  }

  async listMessages(sessionId: string): Promise<StoredMessage[]> {
    const rows = await this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.sessionId, sessionId))
      .orderBy(asc(agentMessages.id));
    return rows.map((r) => ({
      id: String(r.id),
      turnId: r.turnId,
      message: r.payload as Message,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async saveTrace(trace: TurnTrace) {
    await this.db
      .insert(agentTraces)
      .values({ id: trace.id, sessionId: trace.sessionId, payload: trace })
      .onConflictDoNothing({ target: agentTraces.id });
  }
}

/** The draft column is jsonb; fill in missing parts so callers always get a full IntakeDraft. */
export function draftOf(row: Pick<AgentSession, "draft">): IntakeDraft {
  const d = (row.draft ?? {}) as Partial<IntakeDraft>;
  return { mode: d.mode ?? null, pitch: d.pitch ?? {}, join: d.join ?? {} };
}

export async function createIntakeSession(
  db: Database,
  input: { mode: IntakeMode | null; systemPrompt: string; greeting: string },
): Promise<AgentSession> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(agentSessions)
      .values({ agent: INTAKE_AGENT, systemPrompt: input.systemPrompt, draft: emptyIntakeDraft(input.mode) })
      .returning();
    const greeting: Message = { role: "assistant", text: input.greeting, toolCalls: [] };
    await tx.insert(agentMessages).values({ sessionId: row!.id, turnId: GREETING_TURN, payload: greeting });
    return row!;
  });
}

/** Nothing has happened in it yet: no visitor turn, no panel edit, not sent. */
export function isUntouched(row: Pick<AgentSession, "status" | "userTurns" | "draft">): boolean {
  const draft = draftOf(row);
  return (
    row.status === "open" &&
    row.userTurns === 0 &&
    Object.keys(draft.pitch).length === 0 &&
    Object.keys(draft.join).length === 0
  );
}

/**
 * Give an untouched session the current system prompt and greeting, so a reworded prompt
 * reaches visitors who opened the chat before the change but never wrote in it. The row lock
 * keeps a first message (acquireTurn) or panel edit from slipping in between check and write.
 */
export async function refreshUntouchedSession(
  db: Database,
  id: string,
  current: { systemPrompt: string; greeting: (mode: IntakeMode | null) => string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(agentSessions).where(eq(agentSessions.id, id)).for("update");
    if (!row || !isUntouched(row)) return;
    if (row.systemPrompt !== current.systemPrompt) {
      await tx.update(agentSessions).set({ systemPrompt: current.systemPrompt }).where(eq(agentSessions.id, id));
    }
    const greeting: Message = { role: "assistant", text: current.greeting(draftOf(row).mode), toolCalls: [] };
    await tx
      .update(agentMessages)
      .set({ payload: greeting })
      .where(
        and(
          eq(agentMessages.sessionId, id),
          eq(agentMessages.turnId, GREETING_TURN),
          sql`${agentMessages.payload} ->> 'text' is distinct from ${greeting.text}`,
        ),
      );
  });
}

export async function getIntakeSession(db: Database, id: string): Promise<AgentSession | undefined> {
  const [row] = await db
    .select()
    .from(agentSessions)
    .where(and(eq(agentSessions.id, id), eq(agentSessions.agent, INTAKE_AGENT)))
    .limit(1);
  return row;
}

/**
 * Merge a patch into the draft in one statement, so the agent's update_draft and the visitor's
 * panel edits never overwrite each other's fields. Field values replace, missing fields stay.
 * Returns the new draft, or undefined when the session is gone or already sent.
 */
export async function mergeDraft(db: Database, id: string, patch: IntakeDraftPatchInput): Promise<IntakeDraft | undefined> {
  const mode = patch.mode === undefined ? null : JSON.stringify(patch.mode);
  const [row] = await db
    .update(agentSessions)
    .set({
      draft: sql`jsonb_build_object(
        'mode', coalesce(${mode}::jsonb, ${agentSessions.draft} -> 'mode', 'null'::jsonb),
        'pitch', coalesce(${agentSessions.draft} -> 'pitch', '{}'::jsonb) || ${JSON.stringify(patch.pitch ?? {})}::jsonb,
        'join', coalesce(${agentSessions.draft} -> 'join', '{}'::jsonb) || ${JSON.stringify(patch.join ?? {})}::jsonb
      )`,
    })
    .where(and(eq(agentSessions.id, id), eq(agentSessions.status, "open")))
    .returning({ draft: agentSessions.draft });
  return row ? draftOf(row) : undefined;
}

/**
 * Take the session's turn lock and count the turn, atomically. Fails (undefined) when the
 * session is sent, out of turns, or another turn holds an unexpired lock. The returned row's
 * `turnLockedUntil` is the lock token for releaseTurn.
 */
export async function acquireTurn(
  db: Database,
  id: string,
  opts: { maxTurns: number; lockMs: number },
): Promise<(AgentSession & { turnLockedUntil: Date }) | undefined> {
  // Millisecond precision on purpose: the exact value comes back and identifies the holder.
  const token = new Date(Date.now() + opts.lockMs);
  const [row] = await db
    .update(agentSessions)
    .set({ turnLockedUntil: token, userTurns: sql`${agentSessions.userTurns} + 1` })
    .where(
      and(
        eq(agentSessions.id, id),
        eq(agentSessions.status, "open"),
        lt(agentSessions.userTurns, opts.maxTurns),
        or(isNull(agentSessions.turnLockedUntil), lt(agentSessions.turnLockedUntil, sql`now()`)),
      ),
    )
    .returning();
  return row ? { ...row, turnLockedUntil: token } : undefined;
}

/** Release only our own lock (an expired one may already belong to a newer turn). */
export async function releaseTurn(db: Database, id: string, token: Date): Promise<void> {
  await db
    .update(agentSessions)
    .set({ turnLockedUntil: null })
    .where(and(eq(agentSessions.id, id), eq(agentSessions.turnLockedUntil, token)));
}
