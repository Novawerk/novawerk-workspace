import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@nw/db";

import { stubClaude } from "@nw/agent-core";
import { outbox, projectSubmissions } from "@nw/db";
import { eq } from "drizzle-orm";

import { inProcessIntakeTrigger, inProcessPromoTrigger } from "../src/agents.js";
import type { IntakeRef } from "../src/types.js";
import { createTestDb, makeApp, postJson, resetDb, validApplication, validSubmission } from "./helpers.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await resetDb(db);
});

describe("starting the intake agent", () => {
  it("dispatches once per stored pitch or application, with the new row id", async () => {
    const calls: IntakeRef[] = [];
    const { app } = makeApp(db, { triggerIntake: async (ref) => void calls.push(ref) });

    const pitch = (await (await app.request("/public/submissions", postJson(validSubmission))).json()) as { id: string };
    const application = (await (await app.request("/public/applications", postJson(validApplication))).json()) as {
      id: string;
    };

    expect(calls).toEqual([
      { table: "project_submissions", id: pitch.id },
      { table: "member_applications", id: application.id },
    ]);
  });

  it("does not dispatch for a honeypot hit", async () => {
    const trigger = vi.fn(async () => {});
    const { app } = makeApp(db, { triggerIntake: trigger });
    await app.request("/public/submissions", postJson({ ...validSubmission, website: "spam" }));
    expect(trigger).not.toHaveBeenCalled();
  });

  it("a failed dispatch is logged and the visitor still gets 201", async () => {
    const { app, logger } = makeApp(db, {
      triggerIntake: async () => {
        throw new Error("GitHub is down");
      },
    });
    const res = await app.request("/public/submissions", postJson(validSubmission));
    expect(res.status).toBe(201);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("the agents in the API", () => {
  const quiet = () => ({ info: vi.fn(), error: vi.fn() });

  it("intake: answers at once, then summarises the pitch and queues an acknowledgement", async () => {
    const work: Promise<unknown>[] = [];
    const logger = quiet();
    const trigger = inProcessIntakeTrigger({
      db,
      claude: stubClaude(() => "A bouldering route visualiser for climbers."),
      logger,
      background: (p) => void work.push(p),
    });
    const { app } = makeApp(db, { triggerIntake: trigger });
    const pitch = (await (await app.request("/public/submissions", postJson(validSubmission))).json()) as { id: string };

    expect(work).toHaveLength(1);
    await Promise.all(work);
    const [row] = await db.select().from(projectSubmissions).where(eq(projectSubmissions.id, pitch.id));
    expect(row?.aiSummary).toContain("bouldering");
    expect(await db.select().from(outbox)).toHaveLength(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("promo: a failure is logged, never thrown at the request", async () => {
    const work: Promise<unknown>[] = [];
    const logger = quiet();
    const trigger = inProcessPromoTrigger({
      db,
      claude: stubClaude(() => ({})),
      logger,
      background: (p) => void work.push(p),
      knowledge: async () => ({ voice: "", templates: "" }),
    });
    await expect(trigger({ postId: "00000000-0000-4000-8000-000000000000" })).resolves.toBeUndefined();
    await Promise.all(work);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("promo"), expect.any(Error));
  });
});
