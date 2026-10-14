// all-hands-prep — every Monday morning; in all-hands weeks (fortnightly) draft the agenda
// and pre-read from the NB board, this week's standup digest and our meeting design, and
// write it to records/operations/all-hands/. The workflow commits it.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { writeAllHandsAgenda } from "@nw/ceremonies";
import { fakeJira, jiraCli } from "@nw/jira";

import { SAMPLE_ISSUES } from "../lib/fixtures.js";
import { claude, dryClaude, dryRecords, fact, repoRecords } from "../lib/services.js";

/**
 * The Monday of any past all-hands week. All-hands weeks are this one and every second week
 * after it. Move it if the rhythm shifts (or pass "anchor" as input).
 */
export const ALL_HANDS_ANCHOR = "2026-10-05";

const Input = z
  .object({
    force: z.boolean().default(false),
    anchor: z.iso.date().default(ALL_HANDS_ANCHOR),
  })
  .default({ force: false, anchor: ALL_HANDS_ANCHOR });

export default defineAgent({
  id: "all-hands-prep",
  description: "Draft the fortnightly all-hands agenda and pre-read into records/.",
  triggers: [
    { kind: "cron", schedule: "0 6 * * 1", note: "Mondays ~08:00 Berlin; runs only in all-hands weeks" },
    { kind: "manual" },
  ],
  needs: ["anthropic", "jira"],
  effects: ["reads the NB board", "writes records/operations/all-hands/<date>-all-hands.md (never overwrites)"],
  writesRecords: true,
  exampleInput: { force: true },
  parseInput: (raw) => Input.parse(raw ?? undefined),
  services: (cfg, ctx) => ({ jira: jiraCli, claude: claude(cfg.anthropic.apiKey, ctx), records: repoRecords(ctx) }),
  dryRunServices: (ctx) => ({
    jira: fakeJira(SAMPLE_ISSUES),
    claude: dryClaude(ctx, () => "## Blockers\n\n- NB-102 — owner: … — call to action: …"),
    records: dryRecords(ctx),
  }),
  async run(input, { jira, claude, records }, ctx) {
    const [voice, meetingDesign] = await Promise.all([
      fact(ctx, "brand/voice.md"),
      fact(ctx, "operations/meetings-and-ceremonies.md"),
    ]);
    const result = await writeAllHandsAgenda(
      { jira, claude, records, voice, meetingDesign, log: ctx.log },
      { now: ctx.now, anchor: input.anchor, force: input.force },
    );
    if (result.status === "skipped") ctx.log(result.reason);
    return result;
  },
});
