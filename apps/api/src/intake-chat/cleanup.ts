// Chats are personal data. The privacy notice promises that a chat is deleted 14 days after
// its last activity, whether or not it was sent: what was sent lives on as a submission or an
// application, under their own retention. Vercel Cron runs this daily (GET /cron/intake-cleanup).

import { and, eq, lt } from "drizzle-orm";

import { agentSessions, type Database } from "@nw/db";

import { INTAKE_AGENT } from "./store.js";

/** Keep in step with knowledge/legal/privacy.md ("How long we keep it"). */
export const INTAKE_RETENTION_DAYS = 14;

/**
 * Deletes intake chats with no activity for INTAKE_RETENTION_DAYS. updated_at moves on every
 * turn, draft edit and Send; messages and traces go with the session (on delete cascade).
 * Returns how many chats were deleted.
 */
export async function deleteExpiredIntakeSessions(db: Database, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - INTAKE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(agentSessions)
    .where(and(eq(agentSessions.agent, INTAKE_AGENT), lt(agentSessions.updatedAt, cutoff)))
    .returning({ id: agentSessions.id });
  return deleted.length;
}
