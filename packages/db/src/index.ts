// @nw/db — the Postgres schema and typed access for every Novawerk app and agent.
// Tables live in ./schema.ts; this file adds the connection factory and the small query
// surface the agents use. Apps are free to query with Drizzle directly.

import { desc, eq, gte } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";

import * as schema from "./schema.js";
import { documents, financeLedger, members, partners } from "./schema.js";
import type { FinanceEntry, Member, NewDocument, NewPartner, Partner } from "./schema.js";

export * from "./schema.js";
export { schema };

/** Runs Novawerk: the whole admin panel (NB-ADR-0014). Personal access tokens never carry it. */
export const isMaintainer = (m: Pick<Member, "role">): boolean => m.role === "maintainer";

/** Any Drizzle Postgres database built with our schema (node-postgres in prod, PGlite in tests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Connect to Postgres. The pool is lazy — it opens connections on first query, so calling
 * this is cheap and side-effect-free. Use the pooled Neon connection string in serverless.
 */
export function createDb(databaseUrl: string): NodePgDatabase<typeof schema> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

/** The query surface the agents depend on. Kept small on purpose. */
export class Db {
  constructor(private readonly db: Database) {}

  // --- members ---
  async getMember(id: string): Promise<Member | undefined> {
    const [row] = await this.db.select().from(members).where(eq(members.id, id)).limit(1);
    return row;
  }

  // --- partners (CRM) ---
  async getPartner(id: string): Promise<Partner | undefined> {
    const [row] = await this.db.select().from(partners).where(eq(partners.id, id)).limit(1);
    return row;
  }

  async touchPartner(id: string, at: Date): Promise<void> {
    await this.db.update(partners).set({ lastTouchAt: at }).where(eq(partners.id, id));
  }

  /** All partner ids — used by sponsor-discovery to skip ones we already have. */
  async listPartnerIds(): Promise<string[]> {
    const rows = await this.db.select({ id: partners.id }).from(partners);
    return rows.map((r) => r.id);
  }

  /** Insert a partner (default stage `intro`). Idempotent on id. */
  async insertPartner(partner: NewPartner): Promise<void> {
    await this.db.insert(partners).values(partner).onConflictDoNothing({ target: partners.id });
  }

  // --- finance ---
  /** Ledger entries, newest first. `since` is an ISO date (YYYY-MM-DD). */
  async listFinance(opts: { since?: string } = {}): Promise<FinanceEntry[]> {
    const query = this.db.select().from(financeLedger);
    const filtered = opts.since ? query.where(gte(financeLedger.entryDate, opts.since)) : query;
    return filtered.orderBy(desc(financeLedger.entryDate));
  }

  // --- documents (R2 index) ---
  async insertDocument(doc: NewDocument): Promise<number> {
    const [row] = await this.db.insert(documents).values(doc).returning({ id: documents.id });
    return row!.id;
  }
}
