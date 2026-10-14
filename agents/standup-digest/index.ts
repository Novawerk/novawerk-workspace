// standup-digest — every 2 days, turn the NB board into a short Done / Next / Blocked digest
// in Novawerk's voice and append it to this ISO week's record. The workflow commits it.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { writeStandupDigest } from "@nw/ceremonies";
import { fakeJira, jiraCli } from "@nw/jira";

import { SAMPLE_ISSUES } from "../lib/fixtures.js";
import { claude, dryClaude, dryRecords, fact, repoRecords } from "../lib/services.js";

const Input = z.object({ doneWindowDays: z.number().int().min(1).max(14).default(2) }).default({ doneWindowDays: 2 });

export default defineAgent({
  id: "standup-digest",
  description: "Write an async standup digest (Done / Next / Blocked) from the NB board into records/.",
  triggers: [{ kind: "cron", schedule: "0 6 */2 * *", note: "every 2 days, ~08:00 Berlin" }, { kind: "manual" }],
  needs: ["anthropic", "jira"],
  effects: ["reads the NB board", "appends to records/operations/standups/<YYYY-Www>-standup-digest.md"],
  writesRecords: true,
  exampleInput: { doneWindowDays: 2 },
  parseInput: (raw) => Input.parse(raw ?? undefined),
  services: (cfg, ctx) => ({ jira: jiraCli, claude: claude(cfg.anthropic.apiKey, ctx), records: repoRecords(ctx) }),
  dryRunServices: (ctx) => ({
    jira: fakeJira(SAMPLE_ISSUES),
    claude: dryClaude(ctx, () => "### Done\n- NB-104 …\n\n### Next\n- NB-101 …\n\n### Blocked\n- NB-102 …"),
    records: dryRecords(ctx),
  }),
  async run(input, { jira, claude, records }, ctx) {
    const voice = await fact(ctx, "brand/voice.md");
    return writeStandupDigest({ jira, claude, records, voice, log: ctx.log }, { now: ctx.now, doneWindowDays: input.doneWindowDays });
  },
});
