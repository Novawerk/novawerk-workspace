// sponsor-discovery — propose sponsor candidates with Claude, drop ones we already have, and
// create a partner row (stage intro) + a record for each. No human needed: nothing here
// emails anyone (NB-ADR-0003). Contacts stay unverified until a member approves an outreach.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { berlinDate } from "@nw/ceremonies";
import { Db } from "@nw/db";
import { discoverSponsors } from "@nw/partners";

import { claude, dryClaude, dryRecords, memoryDb, postgres, repoRecords } from "../lib/services.js";

const Input = z
  .object({
    criteria: z.string().min(3).default("organisations that fund grassroots community education"),
    max: z.number().int().min(1).max(20).default(8),
  })
  .default({ criteria: "organisations that fund grassroots community education", max: 8 });

export default defineAgent({
  id: "sponsor-discovery",
  description: "Find sponsor candidates and add them as intro-stage partners with a record. Sends nothing.",
  triggers: [{ kind: "cron", schedule: "0 6 * * 2", note: "Tuesdays" }, { kind: "manual" }],
  needs: ["anthropic", "database"],
  effects: ["inserts partners rows (stage intro)", "writes records/partners/<id>.md for new candidates"],
  writesRecords: true,
  exampleInput: { criteria: "organisations that fund grassroots community education", max: 8 },
  parseInput: (raw) => Input.parse(raw ?? undefined),
  services: (cfg, ctx) => ({
    ...postgres(cfg.database.url),
    claude: claude(cfg.anthropic.apiKey, ctx),
    records: repoRecords(ctx),
  }),
  dryRunServices: async (ctx) => ({
    ...(await memoryDb((db) => new Db(db).insertPartner({ id: "acme-foundation", name: "Acme Foundation" }))),
    claude: dryClaude(ctx, () => ({
      candidates: [
        { name: "Acme Foundation", whyFit: "already a partner — dropped by dedupe", suggestedContact: "", source: "" },
        { name: "Example Makers Trust", whyFit: "funds hands-on community workshops", suggestedContact: "hello@example.org", source: "https://example.org" },
      ],
    })),
    records: dryRecords(ctx),
  }),
  run: (input, { db, claude, records }, ctx) =>
    discoverSponsors({ db, claude, records, log: ctx.log }, { ...input, today: berlinDate(ctx.now) }),
});
