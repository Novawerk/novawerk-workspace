// intake — summarise each new project submission / member application and queue a polite
// acknowledgement in the outbox. A member approves the email in the admin panel before it
// is sent; this agent has no Resend key and cannot send.
//
// The API runs the same code (@nw/intake) right after a form is saved (apps/api/src/agents.ts,
// NB-ADR-0010). Here: the "Run workflow" button, and a cron every 6 hours for anything missed.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { memberApplications, outbox, projectSubmissions } from "@nw/db";
import { INTAKE_TABLES, runIntake, type IntakeTarget } from "@nw/intake";

import { SAMPLE_APPLICATION, SAMPLE_SUBMISSION } from "../lib/fixtures.js";
import { claude, dryClaude, memoryDb, postgres } from "../lib/services.js";

const Input = z.union([
  z.object({ table: z.enum(INTAKE_TABLES), id: z.guid() }),
  z.object({ all: z.literal(true), limit: z.number().int().min(1).max(100).optional() }),
]);

export default defineAgent({
  id: "intake",
  description: "Summarise new project submissions and member applications, and queue a polite acknowledgement.",
  triggers: [
    { kind: "manual" },
    { kind: "cron", schedule: "17 */6 * * *", note: "safety net for rows the API missed" },
  ],
  needs: ["anthropic", "database"],
  effects: [
    "writes ai_summary on project_submissions / member_applications",
    "queues one acknowledgement per row in the outbox (pending; a member approves before anything is sent)",
  ],
  exampleInput: { table: "project_submissions", id: "<uuid>" },
  dryRunInput: { all: true },
  parseInput: (raw): IntakeTarget => (raw === undefined || raw === null ? { all: true } : Input.parse(raw)),
  services: (cfg, ctx) => ({ ...postgres(cfg.database.url), claude: claude(cfg.anthropic.apiKey, ctx) }),
  dryRunServices: async (ctx) => ({
    ...(await memoryDb(async (db) => {
      await db.insert(projectSubmissions).values(SAMPLE_SUBMISSION);
      await db.insert(memberApplications).values(SAMPLE_APPLICATION);
    })),
    claude: dryClaude(ctx, () => "(dry run) A short summary for the reviewing member would go here."),
  }),
  async run(target, { db, claude }, ctx) {
    const outcomes = await runIntake({ db, claude, log: ctx.log }, target);
    if (ctx.dryRun) {
      for (const row of await db.select().from(outbox)) {
        ctx.log(`(dry run) outbox ${row.status}: to ${row.to} — "${row.subject}"\n${row.body.replace(/^/gm, "    ")}`);
      }
    }
    const failed = outcomes.filter((o) => o.result === "failed");
    if (failed.length > 0) {
      throw new Error(`${failed.length} row(s) failed: ${failed.map((f) => `${f.table}/${f.id} (${f.reason})`).join("; ")}`);
    }
    return outcomes;
  },
});
