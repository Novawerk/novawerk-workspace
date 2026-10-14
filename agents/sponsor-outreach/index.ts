// sponsor-outreach — draft an email to one partner with Claude and QUEUE it in the outbox.
// It used to suspend a Windmill flow; now the draft simply waits as a pending outbox row until
// a member approves it in the admin panel. This agent cannot send (no Resend key).

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { berlinDate } from "@nw/ceremonies";
import { outbox, partners } from "@nw/db";
import { draftOutreach } from "@nw/partners";

import { SAMPLE_PARTNER_RECORD } from "../lib/fixtures.js";
import { claude, dryClaude, dryRecords, fact, memoryDb, postgres, repoRecords } from "../lib/services.js";

const Input = z.object({
  partnerId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "a partner id (kebab slug)"),
  intent: z.enum(["intro", "follow-up", "grant-ask", "renewal"]),
  context: z.string().max(2000).optional(),
  force: z.boolean().optional(),
});

export default defineAgent({
  id: "sponsor-outreach",
  description: "Draft an email to a partner with Claude and queue it in the outbox for a member's approval.",
  triggers: [{ kind: "manual" }, { kind: "dispatch", event: "sponsor-outreach" }],
  needs: ["anthropic", "database"],
  effects: [
    "queues one email in the outbox (pending; a member approves before anything is sent)",
    "adds a History line to records/partners/<id>.md if it exists",
  ],
  writesRecords: true,
  exampleInput: { partnerId: "acme-foundation", intent: "intro", context: "Mention our open day." },
  parseInput: (raw) => Input.parse(raw),
  services: (cfg, ctx) => ({
    ...postgres(cfg.database.url),
    claude: claude(cfg.anthropic.apiKey, ctx),
    records: repoRecords(ctx),
  }),
  dryRunServices: async (ctx) => ({
    ...(await memoryDb(async (db) => {
      await db.insert(partners).values({ id: "acme-foundation", name: "Acme Foundation", primaryContact: "Jane Doe", primaryEmail: "jane@example.org" });
    })),
    claude: dryClaude(ctx, () => ({
      subject: "Novawerk × Acme Foundation",
      body: "Hi Jane,\n\n(dry run) Claude's draft in Novawerk's voice would go here.\n\nNovawerk",
    })),
    records: dryRecords(ctx, { "records/partners/acme-foundation.md": SAMPLE_PARTNER_RECORD }),
  }),
  async run(input, { db, claude, records }, ctx) {
    const voice = await fact(ctx, "brand/voice.md");
    const result = await draftOutreach({ db, claude, records, log: ctx.log }, input, { voice, today: berlinDate(ctx.now) });
    if (ctx.dryRun) {
      const [row] = await db.select().from(outbox);
      ctx.log(`(dry run) outbox ${row?.status}: to ${row?.to} — "${row?.subject}"`);
    }
    return result;
  },
});
