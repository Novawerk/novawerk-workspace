// The daily chat cleanup: what it deletes, what it keeps, and who may call it.

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { agentMessages, agentSessions, agentTraces, projectSubmissions, type Database } from "@nw/db";

import { INTAKE_RETENTION_DAYS, deleteExpiredIntakeSessions } from "../src/intake-chat/cleanup.js";
import { createTestDb, makeApp, resetDb, validSubmission } from "./helpers.js";

const CRON_SECRET = "cron-secret-0123456789";
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-20T03:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});

async function chat(lastActivity: Date, extra: Partial<typeof agentSessions.$inferInsert> = {}) {
  const [row] = await db
    .insert(agentSessions)
    .values({ agent: "intake", systemPrompt: "sys", draft: { mode: "pitch" }, updatedAt: lastActivity, ...extra })
    .returning({ id: agentSessions.id });
  await db.insert(agentMessages).values({ sessionId: row!.id, turnId: "t1", payload: { role: "user", text: "hi" } });
  await db.insert(agentTraces).values({ id: `trace-${row!.id}`, sessionId: row!.id, payload: { steps: [] } });
  return row!.id;
}

describe("deleteExpiredIntakeSessions", () => {
  it("deletes chats idle for more than 14 days, sent or not, with their messages and traces", async () => {
    const [submission] = await db
      .insert(projectSubmissions)
      .values({ ...validSubmission, consentAt: daysAgo(30) })
      .returning({ id: projectSubmissions.id });
    const oldOpen = await chat(daysAgo(INTAKE_RETENTION_DAYS + 1));
    const oldSent = await chat(daysAgo(20), { status: "submitted", submissionId: submission!.id });
    const recent = await chat(daysAgo(INTAKE_RETENTION_DAYS - 1));
    const otherAgent = await chat(daysAgo(60), { agent: "something-else" });

    expect(await deleteExpiredIntakeSessions(db, now)).toBe(2);

    const left = (await db.select({ id: agentSessions.id }).from(agentSessions)).map((r) => r.id).sort();
    expect(left).toEqual([recent, otherAgent].sort());
    for (const id of [oldOpen, oldSent]) {
      expect(await db.select().from(agentMessages).where(eq(agentMessages.sessionId, id))).toEqual([]);
      expect(await db.select().from(agentTraces).where(eq(agentTraces.sessionId, id))).toEqual([]);
    }
    // What was sent stays, under its own retention.
    expect(await db.select().from(projectSubmissions)).toHaveLength(1);
  });
});

describe("GET /cron/intake-cleanup", () => {
  it("doesn't exist without CRON_SECRET", async () => {
    const { app } = makeApp(db);
    expect((await app.request("/cron/intake-cleanup")).status).toBe(404);
  });

  it("needs Vercel's bearer token", async () => {
    const { app } = makeApp(db, { env: { cronSecret: CRON_SECRET } });
    expect((await app.request("/cron/intake-cleanup")).status).toBe(401);
    const wrong = await app.request("/cron/intake-cleanup", { headers: { Authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
  });

  it("deletes expired chats and says how many", async () => {
    await chat(new Date(Date.now() - (INTAKE_RETENTION_DAYS + 2) * DAY));
    const kept = await chat(new Date());
    const { app } = makeApp(db, { env: { cronSecret: CRON_SECRET } });
    const res = await app.request("/cron/intake-cleanup", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    expect((await db.select({ id: agentSessions.id }).from(agentSessions)).map((r) => r.id)).toEqual([kept]);
  });
});
