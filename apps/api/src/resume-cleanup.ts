// CVs are personal data. One that was uploaded but never sent with a pitch or an application is
// deleted after a day, unless an open Intake Agent chat still holds it in its draft: then it
// goes with the chat (14 days after its last activity, see intake-chat/cleanup.ts). The CV of a
// pitch or an application that was deleted goes the same way. Vercel Cron runs this daily
// (GET /cron/resume-cleanup).

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { RESUME_PREFIX } from "@nw/contracts";
import { agentSessions, memberApplications, projectSubmissions, type Database } from "@nw/db";
import type { Files } from "@nw/object-store";

import { INTAKE_AGENT } from "./intake-chat/store.js";

/** Keep in step with knowledge/legal/privacy.md ("How long we keep it"). */
export const UNSENT_RESUME_HOURS = 24;

/** Every CV a pitch, an application or an open chat still points to. */
async function resumesInUse(db: Database): Promise<Set<string>> {
  const [submissions, applications, chats] = await Promise.all([
    db
      .select({ pathname: projectSubmissions.resumePathname })
      .from(projectSubmissions)
      .where(isNotNull(projectSubmissions.resumePathname)),
    db
      .select({ pathname: memberApplications.resumePathname })
      .from(memberApplications)
      .where(isNotNull(memberApplications.resumePathname)),
    db
      .select({
        pitch: sql<string | null>`${agentSessions.draft} -> 'pitch' -> 'resume' ->> 'pathname'`,
        join: sql<string | null>`${agentSessions.draft} -> 'join' -> 'resume' ->> 'pathname'`,
      })
      .from(agentSessions)
      .where(and(eq(agentSessions.agent, INTAKE_AGENT), eq(agentSessions.status, "open"))),
  ]);
  const used = [...submissions, ...applications].map((r) => r.pathname);
  for (const chat of chats) used.push(chat.pitch, chat.join);
  return new Set(used.filter((p): p is string => Boolean(p)));
}

/**
 * Deletes CVs older than UNSENT_RESUME_HOURS that nothing points to. Returns how many.
 * Without the private store there is nothing to clean.
 */
export async function deleteUnsentResumes(db: Database, files: Files | undefined, now = new Date()): Promise<number> {
  if (!files?.ready.private) return 0;
  const cutoff = now.getTime() - UNSENT_RESUME_HOURS * 60 * 60 * 1000;
  const old = (await files.listPrivate(RESUME_PREFIX)).filter((f) => f.uploadedAt.getTime() < cutoff);
  if (old.length === 0) return 0;
  const used = await resumesInUse(db);
  const unsent = old.filter((f) => !used.has(f.pathname));
  for (const file of unsent) await files.deletePrivate(file.pathname);
  return unsent.length;
}
