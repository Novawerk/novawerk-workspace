#!/usr/bin/env tsx
// Local walk-through of the sponsor pipeline and the outbox gate — no API key, no Postgres
// server, no network. Claude is stubbed; Postgres is PGlite in memory with the real migrations.
//
//   pnpm demo:pipeline
//
// discovery → dedupe → partner rows + records → outreach draft QUEUED → the gate.

import { stubClaude } from "../packages/agent-core/src/index.ts";
import { members, outbox } from "../packages/db/src/index.ts";
import { approveEmail, OutboxError, rejectEmail, sendApproved } from "../packages/email/src/index.ts";
import { discoverSponsors, draftOutreach } from "../packages/partners/src/index.ts";
import { memoryRecordStore } from "../packages/records/src/index.ts";
import { memoryDb } from "../agents/lib/services.ts";

const line = (s = "") => console.log(s);
const rule = (t: string) => line(`\n──────── ${t} ────────`);
const log = (m: string) => line(`  ${m}`);

async function tryToSend(db: Parameters<typeof sendApproved>[0], id: string): Promise<void> {
  try {
    // The key is fake: if the gate ever let this through, Resend would reject it — nothing sends.
    await sendApproved(db, id, { resendApiKey: "re_demo_not_a_real_key", from: "Novawerk <info@novawerk.io>" });
    line("  !! the gate let it through — this should never happen in the demo");
  } catch (err) {
    line(`  ✋ refused (${(err as OutboxError).code}): ${(err as Error).message}`);
  }
}

async function main() {
  const { db, close } = await memoryDb(async (d) => {
    await d.insert(members).values({ id: "ada", handle: "ada", displayName: "Ada (demo member)", email: "ada@example.org" });
  });
  const records = memoryRecordStore();
  try {
    rule("1. sponsor-discovery (Claude stubbed), no human");
    await discoverSponsors(
      {
        db,
        records,
        log,
        claude: stubClaude(() => ({
          candidates: [
            { name: "Bright Sparks Trust", whyFit: "backs hands-on STEM workshops", suggestedContact: "hello@brightsparks.example", source: "https://brightsparks.example" },
            { name: "Open Commons Fund", whyFit: "supports open educational resources", suggestedContact: "", source: "" },
            { name: "Bright Sparks Trust", whyFit: "duplicate within the same batch", suggestedContact: "", source: "" },
          ],
        })),
      },
      { criteria: "funders of community education", max: 8, today: "2026-10-03" },
    );
    line(`  records written: ${[...records.files.keys()].join(", ")}`);

    rule("2. sponsor-outreach drafts and QUEUES (never sends)");
    const draft = await draftOutreach(
      {
        db,
        records,
        log,
        claude: stubClaude(() => ({
          subject: "Novawerk × Bright Sparks Trust",
          body: "Hi,\n\nWe're Novawerk. We build real things together, every week.\n\nCould we show you one workshop?\n\nNovawerk",
        })),
      },
      { partnerId: "bright-sparks-trust", intent: "intro" },
      { voice: "Short sentences. We. Present tense.", today: "2026-10-03" },
    );
    const [row] = await db.select().from(outbox);
    line(`  outbox ${row!.id}: status=${row!.status}, to=${row!.to} (UNVERIFIED until a member checks it)`);

    rule("3. The gate — try to send while pending");
    await tryToSend(db, draft.outboxId);

    rule("4. A member rejects it — still nothing can send");
    await rejectEmail(db, draft.outboxId, "ada");
    await tryToSend(db, draft.outboxId);

    rule("5. What approval looks like");
    const second = await draftOutreach(
      { db, records, log, claude: stubClaude(() => ({ subject: "Novawerk × Bright Sparks Trust", body: "Hi again,\n\nNovawerk" })) },
      { partnerId: "bright-sparks-trust", intent: "intro" },
      { voice: "", today: "2026-10-03" },
    );
    const approved = await approveEmail(db, second.outboxId, "ada");
    line(`  approved by ${approved.approvedBy} at ${approved.approvedAt?.toISOString()}`);
    line("  In production the admin panel now calls sendApproved(): it claims the row, sends once via");
    line("  Resend, and marks it sent. A second call is refused. (The demo stops here — no network.)");
    line("\n  → discovery and drafting ran with zero humans; every send waits for one approval. (NB-ADR-0003/0004)");
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
