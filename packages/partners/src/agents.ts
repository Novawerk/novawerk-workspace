// The logic behind the sponsor-discovery and sponsor-outreach agents.
//
// Discovery runs with no human: Claude proposes candidates, we drop ones we already have, and
// create a partner row (stage intro) + a record for each. Outreach drafts an email with Claude
// and QUEUES it in the outbox. Neither can send: only a member's approval in the admin panel
// lets @nw/email.sendApproved() send it (NB-ADR-0003, NB-ADR-0004).

import { MODELS, type Claude } from "@nw/agent-core";
import { Db, type Database, type Partner } from "@nw/db";
import { emailsAbout, queueEmail } from "@nw/email";
import type { RecordStore } from "@nw/records";
import type { OutreachIntent } from "@nw/types";

import { candidateToPartner, candidateToRecord, dedupeCandidates, type SponsorCandidate } from "./index.js";

const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+$/;

// ─── Discovery ───────────────────────────────────────────────────────────────

/** Structured output for discovery. Unknown fields come back as "" (normalised away). */
export const CANDIDATES_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Organisation name" },
          whyFit: { type: "string", description: "One line: why they fit Novawerk" },
          suggestedContact: { type: "string", description: "A PUBLIC contact email you are confident exists, or empty" },
          source: { type: "string", description: "Where this comes from (URL or note), or empty" },
        },
        required: ["name", "whyFit", "suggestedContact", "source"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

export interface ProposedCandidates {
  candidates: Array<{ name: string; whyFit: string; suggestedContact: string; source: string }>;
}

export function discoveryPrompt(criteria: string, max: number, existingIds: string[]): { system: string; user: string } {
  return {
    system:
      "You propose sponsor candidates for Novawerk, a small open non-profit community in Germany where " +
      "people build real projects together. Be concrete. Only name real organisations. Never invent a " +
      "contact email: leave suggestedContact empty unless you are confident the address is published " +
      "by the organisation itself.",
    user:
      `Propose up to ${max} organisations matching: ${criteria}\n\n` +
      `We already have these partner ids, so skip them: ${existingIds.length ? existingIds.join(", ") : "(none)"}`,
  };
}

/** Clean Claude's proposals: trim, drop empties, keep only plausible emails. */
export function normalizeProposed(proposed: ProposedCandidates, max: number): SponsorCandidate[] {
  return proposed.candidates
    .map((c) => ({
      name: c.name.trim(),
      whyFit: c.whyFit.trim(),
      suggestedContact: EMAIL.test(c.suggestedContact.trim()) ? c.suggestedContact.trim() : undefined,
      source: c.source.trim() || undefined,
    }))
    .filter((c) => c.name && c.whyFit)
    .slice(0, max);
}

export interface DiscoveryDeps {
  db: Database;
  claude: Claude;
  records: RecordStore;
  log: (message: string) => void;
}

export interface DiscoveryResult {
  proposed: number;
  created: string[];
  recordsWritten: string[];
}

export async function discoverSponsors(
  deps: DiscoveryDeps,
  opts: { criteria: string; max: number; today: string },
): Promise<DiscoveryResult> {
  const repo = new Db(deps.db);
  const existing = await repo.listPartnerIds();
  const proposed = await deps.claude.json<ProposedCandidates>({
    model: MODELS.draft,
    effort: "medium",
    schema: CANDIDATES_SCHEMA,
    ...discoveryPrompt(opts.criteria, opts.max, existing),
  });
  const candidates = normalizeProposed(proposed, opts.max);
  const fresh = dedupeCandidates(candidates, existing);
  deps.log(`Claude proposed ${candidates.length}; ${fresh.length} are new.`);

  const created: string[] = [];
  const recordsWritten: string[] = [];
  for (const candidate of fresh) {
    const row = candidateToPartner(candidate);
    await repo.insertPartner(row); // reversible, no send
    created.push(row.id);
    const { path, markdown } = candidateToRecord(candidate, opts.today);
    if ((await deps.records.read(path)) === undefined) {
      await deps.records.write(path, markdown);
      recordsWritten.push(path);
    }
    deps.log(`+ partner ${row.id}${row.primaryEmail ? ` (unverified contact ${row.primaryEmail})` : ""}`);
  }
  return { proposed: candidates.length, created, recordsWritten };
}

// ─── Outreach ────────────────────────────────────────────────────────────────

export const OUTREACH_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string", description: "One line, under 80 characters" },
    body: { type: "string", description: "Plain-text email body, signed 'Novawerk'" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
} as const;

export function outreachPrompt(
  partner: Pick<Partner, "name" | "primaryContact" | "stage">,
  intent: OutreachIntent,
  voice: string,
  context?: string,
): { system: string; user: string } {
  return {
    system:
      "You draft short, plain-text emails for Novawerk. Write in Novawerk's voice. Never invent facts " +
      "about Novawerk or the recipient, no attachments, no links you were not given. A member reviews " +
      `every draft before it is sent.\n\n<brand_voice>\n${voice.trim()}\n</brand_voice>`,
    user:
      `Draft a short ${intent} email to ${partner.name}` +
      (partner.primaryContact ? ` (contact: ${partner.primaryContact})` : "") +
      `. Their current stage with us: ${partner.stage}.` +
      (context ? `\n\nA member's note to steer the draft:\n<note>\n${context}\n</note>` : ""),
  };
}

/** Add a line to the end of the record's "## History" list (adding the heading if missing). */
export function appendHistory(markdown: string, line: string): string {
  const entry = `- ${line}`;
  const lines = markdown.split("\n");
  const heading = lines.findIndex((l) => /^## History\b/.test(l));
  if (heading === -1) return `${markdown.trimEnd()}\n\n## History\n\n${entry}\n`;
  let end = lines.findIndex((l, i) => i > heading && /^## /.test(l));
  if (end === -1) end = lines.length;
  let insertAt = end;
  while (insertAt > heading + 1 && lines[insertAt - 1]!.trim() === "") insertAt--;
  lines.splice(insertAt, 0, ...(insertAt === heading + 1 ? ["", entry] : [entry]));
  return lines.join("\n");
}

export interface OutreachDeps {
  db: Database;
  claude: Claude;
  records: RecordStore;
  log: (message: string) => void;
}

export interface OutreachInput {
  partnerId: string;
  intent: OutreachIntent;
  context?: string;
  /** Queue even if an earlier draft for this partner is still waiting. */
  force?: boolean;
}

export interface OutreachResult {
  outboxId: string;
  to: string;
  subject: string;
  recordUpdated: string | null;
}

export async function draftOutreach(
  deps: OutreachDeps,
  input: OutreachInput,
  opts: { voice: string; today: string },
): Promise<OutreachResult> {
  const partner = await new Db(deps.db).getPartner(input.partnerId);
  if (!partner) throw new Error(`No partner "${input.partnerId}". Create the partner first.`);
  if (!partner.primaryEmail || !EMAIL.test(partner.primaryEmail)) {
    throw new Error(`Partner "${partner.id}" has no usable primary_email. Add one in the admin panel first.`);
  }
  const open = (await emailsAbout(deps.db, "partners", partner.id)).filter(
    (e) => e.status === "pending" || e.status === "approved",
  );
  if (open.length > 0 && !input.force) {
    throw new Error(
      `Partner "${partner.id}" already has ${open.length} email(s) waiting in the outbox (${open.map((e) => e.id).join(", ")}). ` +
        `Approve or reject those first, or pass "force": true.`,
    );
  }

  const draft = await deps.claude.json<{ subject: string; body: string }>({
    model: MODELS.draft,
    effort: "medium",
    schema: OUTREACH_SCHEMA,
    ...outreachPrompt(partner, input.intent, opts.voice, input.context),
  });
  const subject = draft.subject.replace(/\s+/g, " ").trim();

  const outboxId = await queueEmail(deps.db, {
    to: partner.primaryEmail,
    subject,
    body: draft.body,
    draftedBy: "sponsor-outreach",
    relatedTable: "partners",
    relatedId: partner.id,
  });
  deps.log(`Queued ${input.intent} draft for ${partner.id} in the outbox (${outboxId}). Nothing is sent until a member approves.`);

  const path = `records/partners/${partner.id}.md`;
  const record = await deps.records.read(path);
  let recordUpdated: string | null = null;
  if (record !== undefined) {
    const line = `_${opts.today}_ — ${input.intent} draft queued in the outbox (\`${outboxId}\`). Waiting for a member's approval.`;
    await deps.records.write(path, appendHistory(record, line));
    recordUpdated = path;
  }
  return { outboxId, to: partner.primaryEmail, subject, recordUpdated };
}
