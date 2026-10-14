// jira-automation — weekday NB board hygiene. Leaves a gentle owner nudge on open issues that
// have no owner and have been quiet for a week. Comments only: never assigns, moves or closes.
// The nudge itself updates the issue, so each one is nudged at most once a week.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { fakeJira, jiraCli, nudgeOwnerless } from "@nw/jira";

import { SAMPLE_ISSUES } from "../lib/fixtures.js";

const Input = z
  .object({
    quietDays: z.number().int().min(1).max(60).default(7),
    max: z.number().int().min(0).max(50).default(10),
  })
  .default({ quietDays: 7, max: 10 });

export default defineAgent({
  id: "jira-automation",
  description: "Nudge open NB issues that have no owner (comments only).",
  triggers: [{ kind: "cron", schedule: "0 7 * * 1-5", note: "weekdays ~09:00 Berlin" }, { kind: "manual" }],
  needs: ["jira"],
  effects: ["comments on ownerless NB issues (max 10 per run)"],
  exampleInput: { quietDays: 7, max: 10 },
  parseInput: (raw) => Input.parse(raw ?? undefined),
  services: () => ({ jira: jiraCli }),
  dryRunServices: (ctx) => ({
    jira: fakeJira(SAMPLE_ISSUES, (key, body) => ctx.log(`(dry run) would comment on ${key}: ${body}`)),
  }),
  run: (input, { jira }, ctx) => nudgeOwnerless(jira, { ...input, log: ctx.log }),
});
