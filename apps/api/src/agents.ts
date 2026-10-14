// Runs the intake and promo agents' work right here, after the response is sent, instead of
// waking their GitHub Actions workflows (NB-ADR-0010): a form's summary or a requested draft
// lands in seconds. The same package code runs in both places; the workflows keep their crons
// as the safety net for anything this misses (agents/intake, agents/promo).
//   intake  after a form lands ({table, id})
//   promo   after a project's status or launch date changes, or a member asks for a draft
// Best effort: a failure is logged and never fails the request.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { waitUntil } from "@vercel/functions";

import { createClaude, type Claude } from "@nw/agent-core";
import type { Database } from "@nw/db";
import { runIntake } from "@nw/intake";
import { knowledgeDir, readFact } from "@nw/kb";
import { runPromo, type PromoKnowledge } from "@nw/promo";

import type { IntakeRef, IntakeTrigger, Logger, PromoRef, PromoTrigger } from "./types.js";

export interface AgentRunnerOptions {
  db: Database;
  /** Claude, or the Anthropic API key to make one with. */
  claude: Claude | { apiKey: string };
  /** Progress and token usage go to info; failures to error. */
  logger: Pick<Console, "info" | "error">;
  /** Keeps the function alive until `work` settles. Defaults to Vercel's waitUntil. */
  background?: (work: Promise<unknown>) => void;
}

const claudeFrom = ({ claude, logger }: AgentRunnerOptions): Claude =>
  "apiKey" in claude
    ? createClaude(claude.apiKey, {
        onUsage: (u) => logger.info(`[agents] claude ${u.model}: ${u.inputTokens} in (${u.cacheReadTokens} cached) / ${u.outputTokens} out tokens`),
      })
    : claude;

/** Starts `job` without waiting for it; its failure is logged. */
function inBackground(opts: AgentRunnerOptions, label: string, job: () => Promise<unknown>): Promise<void> {
  const work = job().catch((err) => opts.logger.error(`[agents] ${label} failed:`, err));
  (opts.background ?? waitUntil)(work);
  return Promise.resolve();
}

export function inProcessIntakeTrigger(opts: AgentRunnerOptions): IntakeTrigger {
  const claude = claudeFrom(opts);
  const log = (message: string) => opts.logger.info(`[intake] ${message}`);
  return (ref) =>
    inBackground(opts, `intake ${ref.table}/${ref.id}`, async () => {
      const [outcome] = await runIntake({ db: opts.db, claude, log }, ref);
      if (outcome?.result === "failed") throw new Error(outcome.reason ?? "intake failed");
    });
}

type PromoRunnerOptions = AgentRunnerOptions & { knowledge?: () => Promise<PromoKnowledge> };

/** Runs promo for one post or project and waits; throws when a post fails. */
export function inProcessPromoRunner(opts: PromoRunnerOptions): (ref: PromoRef) => Promise<void> {
  const claude = claudeFrom(opts);
  const log = (message: string) => opts.logger.info(`[promo] ${message}`);
  const knowledge = opts.knowledge ?? promoKnowledge;
  return async (ref) => {
    const { outcomes } = await runPromo({ db: opts.db, claude, knowledge: await knowledge(), log }, ref);
    const failed = outcomes.filter((o) => o.result === "failed");
    if (failed.length) throw new Error(failed.map((f) => `${f.label} ${f.postId} (${f.reason})`).join("; "));
  };
}

export function inProcessPromoTrigger(opts: PromoRunnerOptions): PromoTrigger {
  const run = inProcessPromoRunner(opts);
  return (ref) => inBackground(opts, `promo ${JSON.stringify(ref)}`, () => run(ref));
}

/**
 * The two knowledge/ files promo drafts from. The bundle carries copies in dist/knowledge
 * (tsup.config.ts); unbundled (dev, tests) they're read from the repo.
 */
async function promoKnowledge(): Promise<PromoKnowledge> {
  const bundled = fileURLToPath(new URL("./knowledge/", import.meta.url));
  const dir = existsSync(bundled) ? bundled : knowledgeDir();
  return {
    voice: (await readFact("brand/voice.md", { dir })).body,
    templates: (await readFact("community/promotion/post-templates.md", { dir })).body,
  };
}

export async function triggerIntakeSafely(trigger: IntakeTrigger | undefined, ref: IntakeRef, logger: Logger) {
  if (!trigger) return;
  try {
    await trigger(ref);
  } catch (err) {
    logger.error(`[api] could not start the intake agent for ${ref.table}/${ref.id}:`, err);
  }
}

/** True when the promo agent was started. */
export async function triggerPromoSafely(trigger: PromoTrigger | undefined, ref: PromoRef, logger: Logger): Promise<boolean> {
  if (!trigger) return false;
  try {
    await trigger(ref);
    return true;
  } catch (err) {
    logger.error(`[api] could not start the promo agent for ${JSON.stringify(ref)}:`, err);
    return false;
  }
}
