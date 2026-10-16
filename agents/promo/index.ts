// promo — plan each project's posts from its lifecycle (kickoff, progress every two weeks,
// behind the scenes, launch, T+10, T+30, T+90) and draft them in Chinese and English with
// Claude. Drafts wait in the admin panel: a member edits, approves, posts by hand. This agent
// publishes nothing.
//
// The API runs the same code (@nw/promo) after a status change or when a member asks for a draft
// (apps/api/src/agents.ts, NB-ADR-0010). Here: the "Run workflow" button, and a daily cron for
// the posts that come due with time.

import { z } from "zod";

import { defineAgent } from "@nw/agent-core";
import { members, posts, projectMembers, projectStatusChanges, projects } from "@nw/db";
import { runPromo, type PromoTarget } from "@nw/promo";

import { claude, dryClaude, fact, memoryDb, postgres } from "../lib/services.js";

const Input = z.union([
  z.object({ postId: z.guid() }),
  z.object({ projectId: z.guid() }),
  z.object({ all: z.literal(true), limit: z.number().int().min(1).max(50).optional() }),
]);

const DRY_DRAFT = {
  title: "(dry run)",
  body: "(dry run) Claude's draft in our voice would go here.",
  card: { eyebrow: "", headline: "Kiez Pantry", lede: "", points: [], quote: { text: "", by: "" }, stats: [], footer: "" },
};

export default defineAgent({
  id: "promo",
  description: "Plan each project's posts from its lifecycle and draft them in Chinese and English for a member to review.",
  triggers: [
    { kind: "manual" },
    { kind: "cron", schedule: "40 5 * * *", note: "posts that come due with time (progress, T+10, T+30, T+90)" },
  ],
  needs: ["anthropic", "database"],
  effects: [
    "creates the posts each project has reached (planned)",
    "writes Claude's bilingual draft on each new or requested post (drafted; a member reviews and posts by hand)",
  ],
  exampleInput: { postId: "<uuid>" },
  dryRunInput: { all: true },
  parseInput: (raw): PromoTarget => (raw === undefined || raw === null ? { all: true } : Input.parse(raw)),
  services: (cfg, ctx) => ({ ...postgres(cfg.database.url), claude: claude(cfg.anthropic.apiKey, ctx) }),
  dryRunServices: async (ctx) => ({
    ...(await memoryDb(async (db) => {
      await db.insert(members).values({ id: "ada", handle: "ada", displayName: "Ada", email: "ada@novawerk.io" });
      const [project] = await db
        .insert(projects)
        .values({ slug: "kiez-pantry", title: "Kiez Pantry", description: "Surplus food from small shops.", status: "building" })
        .returning();
      await db.insert(projectMembers).values({ projectId: project!.id, memberId: "ada", role: "Initiator" });
      await db.insert(projectStatusChanges).values({ projectId: project!.id, fromStatus: "planning", toStatus: "building", changedAt: ctx.now });
    })),
    claude: dryClaude(ctx, () => ({ zh: DRY_DRAFT, en: DRY_DRAFT })),
  }),
  async run(target, { db, claude }, ctx) {
    const knowledge = {
      voice: await fact(ctx, "brand/voice.md"),
      templates: await fact(ctx, "community/promotion/post-templates.md"),
    };
    const today = ctx.now.toISOString().slice(0, 10);
    const result = await runPromo({ db, claude, knowledge, log: ctx.log, today }, target);
    if (ctx.dryRun) {
      for (const row of await db.select().from(posts)) ctx.log(`(dry run) post ${row.kind} ${row.seq}: ${row.status}, due ${row.dueOn}`);
    }
    const failed = result.outcomes.filter((o) => o.result === "failed");
    if (failed.length > 0) {
      throw new Error(`${failed.length} post(s) failed: ${failed.map((f) => `${f.label} ${f.postId} (${f.reason})`).join("; ")}`);
    }
    return result.outcomes;
  },
});
