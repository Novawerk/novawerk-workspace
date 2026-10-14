// The Intake Agent conversation behind a pitch or application, for the admin panel. Read-only and
// text-only: what the visitor typed and what the assistant said. Tool calls, tool results and the
// per-turn context block stay out (the context lives on `UserMessage.context`, never in `text`).

import { and, asc, desc, eq } from "drizzle-orm";

import type { Message } from "@nw/agent-harness";
import type { IntakeTranscript, IntakeTranscriptMessage } from "@nw/contracts";
import { agentMessages, agentSessions, type Database } from "@nw/db";

import { INTAKE_AGENT } from "../intake-chat/store.js";

export async function intakeTranscript(
  db: Database,
  by: { submissionId: string } | { applicationId: string },
): Promise<IntakeTranscript | null> {
  const link =
    "submissionId" in by
      ? eq(agentSessions.submissionId, by.submissionId)
      : eq(agentSessions.applicationId, by.applicationId);
  const [session] = await db
    .select({ id: agentSessions.id, createdAt: agentSessions.createdAt })
    .from(agentSessions)
    .where(and(link, eq(agentSessions.agent, INTAKE_AGENT)))
    .orderBy(desc(agentSessions.createdAt))
    .limit(1);
  if (!session) return null;

  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.sessionId, session.id))
    .orderBy(asc(agentMessages.id));

  const messages: IntakeTranscriptMessage[] = [];
  let lastAssistantTurn: string | null = null;
  for (const row of rows) {
    const m = row.payload as Message;
    if (m.role === "user") {
      lastAssistantTurn = null;
      messages.push({ id: String(row.id), role: "user", text: m.text, createdAt: row.createdAt.toISOString() });
      continue;
    }
    if (m.role !== "assistant" || !m.text.trim()) continue;
    // One turn can take several model steps; show them as one reply, like the live chat does.
    const previous = messages.at(-1);
    if (previous?.role === "assistant" && lastAssistantTurn === row.turnId) {
      previous.text = `${previous.text}\n\n${m.text}`;
    } else {
      messages.push({ id: String(row.id), role: "assistant", text: m.text, createdAt: row.createdAt.toISOString() });
    }
    lastAssistantTurn = row.turnId;
  }
  return { sessionId: session.id, startedAt: session.createdAt.toISOString(), messages };
}
