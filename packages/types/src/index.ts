// @nw/types — shared types across the back office.
// Kept dependency-free on purpose: every other package imports from here.

/** A canonical fact read from the knowledge base (consumed, never duplicated). */
export interface KBFact {
  /** KB-relative path, e.g. "brand/voice.md". */
  path: string;
  title: string;
  /** "stable" facts rarely change; "evolving" ones carry a freshness date. */
  status: "stable" | "evolving";
  updated: string; // ISO date
  body: string;
}

/** Frontmatter shared by every markdown record under records/. */
export interface RecordFrontmatter {
  title: string;
  category: "operations" | "people" | "finance" | "legal" | "partners";
  status: "draft" | "evolving" | "stable";
  confidential: boolean;
  source: string[];
  related: string[]; // Jira keys (NB-12) or other record ids (NB-ADR-0003)
  updated: string; // ISO date
}

export interface MarkdownRecord {
  frontmatter: RecordFrontmatter;
  /** Markdown body below the frontmatter block. */
  body: string;
}

// Database row types (members, partners, finance, documents, …) live in @nw/db,
// inferred from the Drizzle schema. Keep this package for non-table shapes only.

// --- Agents & orchestration ---

export type OutreachIntent = "intro" | "follow-up" | "grant-ask" | "renewal";

export interface OutreachInput {
  partnerId: string;
  intent: OutreachIntent;
  context?: string;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export type AgentRunStatus = "queued" | "running" | "success" | "failed" | "cancelled";

/** A normalized view of an agent run, for the dashboard. */
export interface AgentRun {
  id: string;
  agent: string;
  status: AgentRunStatus;
  startedAt: string; // ISO timestamp
  finishedAt?: string;
}
