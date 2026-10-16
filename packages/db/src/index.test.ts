// Runs the real migrations against an in-memory Postgres (PGlite) and exercises the Db
// query surface end to end. No Postgres server needed.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { eq } from "drizzle-orm";

import {
  Db,
  agentMessages,
  agentSessions,
  agentTraces,
  financeLedger,
  members,
  partners,
  projectSubmissions,
  type Database,
} from "./index.js";
import { createTestDb, resetDb } from "./testing.js";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values({ id: "ada", handle: "ada", displayName: "Ada", email: "ada@example.com" });
});

describe("Db.getMember", () => {
  it("returns camelCase fields with defaults applied", async () => {
    const member = await new Db(db).getMember("ada");
    expect(member).toMatchObject({ id: "ada", handle: "ada", displayName: "Ada", active: true });
  });

  it("returns undefined when no row matches", async () => {
    expect(await new Db(db).getMember("missing")).toBeUndefined();
  });
});

describe("Db partners", () => {
  it("inserts at stage intro and is idempotent on id", async () => {
    const repo = new Db(db);
    await repo.insertPartner({ id: "acme", name: "Acme", owner: "ada" });
    await repo.insertPartner({ id: "acme", name: "Acme again" });

    const partner = await repo.getPartner("acme");
    expect(partner).toMatchObject({ id: "acme", name: "Acme", stage: "intro", owner: "ada" });
    expect(await repo.listPartnerIds()).toEqual(["acme"]);
  });

  it("touchPartner sets last_touch_at", async () => {
    const repo = new Db(db);
    await repo.insertPartner({ id: "acme", name: "Acme" });
    const at = new Date("2026-06-04T00:00:00.000Z");
    await repo.touchPartner("acme", at);
    expect((await repo.getPartner("acme"))?.lastTouchAt?.toISOString()).toBe(at.toISOString());
  });
});

describe("Db.listFinance", () => {
  beforeEach(async () => {
    await db.insert(partners).values({ id: "acme", name: "Acme" });
    await db.insert(financeLedger).values([
      { entryDate: "2026-01-10", direction: "out", amountCents: 4_200, category: "hosting" },
      { entryDate: "2026-03-01", direction: "in", amountCents: 100_000, partnerId: "acme" },
    ]);
  });

  it("returns newest first, amounts as integer cents", async () => {
    const rows = await new Db(db).listFinance();
    expect(rows.map((r) => r.entryDate)).toEqual(["2026-03-01", "2026-01-10"]);
    expect(rows[0]?.amountCents).toBe(100_000);
  });

  it("filters by since", async () => {
    const rows = await new Db(db).listFinance({ since: "2026-02-01" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.partnerId).toBe("acme");
  });
});

describe("Db.insertDocument", () => {
  it("returns the new id and enforces unique r2 keys", async () => {
    const repo = new Db(db);
    const id = await repo.insertDocument({ kind: "receipt", title: "Hosting", r2Key: "ada/r1.pdf", owner: "ada" });
    expect(typeof id).toBe("number");
    await expect(
      repo.insertDocument({ kind: "receipt", title: "Dup", r2Key: "ada/r1.pdf" }),
    ).rejects.toThrow();
  });
});

describe("agent sessions (Intake Agent)", () => {
  it("defaults to open, keeps messages in order, cascades deletes and unlinks deleted submissions", async () => {
    const [submission] = await db
      .insert(projectSubmissions)
      .values({
        name: "Ada",
        email: "ada@example.com",
        projectName: "Crags",
        product: "p",
        userJourney: "u",
        referencesAndInnovation: "r",
        team: "t",
        timeline: "t",
        consentAt: new Date(),
      })
      .returning({ id: projectSubmissions.id });
    const [session] = await db
      .insert(agentSessions)
      .values({ agent: "intake", systemPrompt: "sys", draft: { mode: null }, submissionId: submission!.id })
      .returning();
    expect(session).toMatchObject({ status: "open", userTurns: 0, lastInputTokens: 0, turnLockedUntil: null });

    await db.insert(agentMessages).values([
      { sessionId: session!.id, turnId: "t1", payload: { role: "user", text: "hi" } },
      { sessionId: session!.id, turnId: "t1", payload: { role: "assistant", text: "hello", toolCalls: [] } },
    ]);
    await db.insert(agentTraces).values({ id: "t1", sessionId: session!.id, payload: { steps: [] } });
    const rows = await db.select().from(agentMessages).where(eq(agentMessages.sessionId, session!.id)).orderBy(agentMessages.id);
    expect(rows.map((r) => (r.payload as { role: string }).role)).toEqual(["user", "assistant"]);

    await db.delete(projectSubmissions);
    const [unlinked] = await db.select().from(agentSessions);
    expect(unlinked?.submissionId).toBeNull();

    await db.delete(agentSessions);
    expect(await db.select().from(agentMessages)).toEqual([]);
    expect(await db.select().from(agentTraces)).toEqual([]);
  });
});
