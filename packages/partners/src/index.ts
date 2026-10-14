// @nw/partners — turn sponsor candidates into partner records and rows.
//
// Discovery is autonomous (a cron agent proposes candidates with Claude). SENDING is not — every
// outreach email waits in the outbox until a member approves it (NB-ADR-0003, NB-ADR-0004).
// So a discovered candidate's contact is treated as UNVERIFIED until the approver confirms it.

import type { NewPartner } from "@nw/db";

/** A sponsor candidate as proposed by discovery — not yet a partner we've contacted. */
export interface SponsorCandidate {
  /** kebab id; derived from the name if absent. */
  id?: string;
  name: string;
  /** One line: why they fit (e.g. "funds grassroots community education"). */
  whyFit: string;
  /** Public contact, if found. UNVERIFIED — confirmed by a human before any send. */
  suggestedContact?: string;
  /** Where discovery found them (a URL or note). */
  source?: string;
}

/** A kebab-case slug suitable for a partner id and a record filename. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Ensure a candidate has a stable id derived from its name. */
export function normalizeCandidate(candidate: SponsorCandidate): Required<Pick<SponsorCandidate, "id">> & SponsorCandidate {
  return { ...candidate, id: candidate.id ?? slugify(candidate.name) };
}

/**
 * Drop candidates we already have (by id) and any intra-batch duplicates, keeping the first.
 * `existingIds` comes from `Db.listPartnerIds()`.
 */
export function dedupeCandidates(candidates: SponsorCandidate[], existingIds: string[]): SponsorCandidate[] {
  const seen = new Set(existingIds);
  const out: SponsorCandidate[] = [];
  for (const raw of candidates) {
    const candidate = normalizeCandidate(raw);
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push(candidate);
  }
  return out;
}

/** Map a candidate to a partner row at stage `intro` (not yet contacted). */
export function candidateToPartner(candidate: SponsorCandidate): NewPartner {
  const c = normalizeCandidate(candidate);
  return {
    id: c.id,
    name: c.name,
    stage: "intro",
    primaryEmail: c.suggestedContact,
  };
}

/** Build the narrative partner record for a new candidate. `dateIso` is the YYYY-MM-DD it was found. */
export function candidateToRecord(candidate: SponsorCandidate, dateIso: string): { path: string; markdown: string } {
  const c = normalizeCandidate(candidate);
  const contact = c.suggestedContact ?? "_unknown — find and verify before any send_";
  const source = c.source ?? "_discovery_";
  const markdown = `---
title: ${c.name}
category: partners
status: draft
confidential: true
source: []
related: []
updated: ${dateIso}
---

# ${c.name} — sponsor candidate

> Found by \`sponsor-discovery\` on ${dateIso}. Contact is **unverified** — a human confirms it at
> the approval step before any email goes out (NB-ADR-0003).

- **partnerId:** \`${c.id}\`
- **Stage:** intro (not yet contacted).
- **Why they fit:** ${c.whyFit}
- **Suggested contact:** ${contact}
- **Source:** ${source}

## History

- _${dateIso}_ — candidate discovered. No outreach sent.
`;
  return { path: `records/partners/${c.id}.md`, markdown };
}

export {
  appendHistory,
  CANDIDATES_SCHEMA,
  discoverSponsors,
  discoveryPrompt,
  draftOutreach,
  normalizeProposed,
  OUTREACH_SCHEMA,
  outreachPrompt,
  type DiscoveryDeps,
  type DiscoveryResult,
  type OutreachDeps,
  type OutreachInput,
  type OutreachResult,
  type ProposedCandidates,
} from "./agents.js";
