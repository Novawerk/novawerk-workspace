// Shared wiring for agents: real services from config, and fakes for --dry-run.
// Agents compose these; the logic itself lives in packages/*.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";

import { createClaude, stubClaude, type AgentContext, type Claude, type ClaudeCall } from "@nw/agent-core";
import { createDb, schema, type Database } from "@nw/db";
import { knowledgeDir, readFact } from "@nw/kb";
import { fileRecordStore, memoryRecordStore, type RecordStore } from "@nw/records";

const MIGRATIONS = fileURLToPath(new URL("../../packages/db/migrations", import.meta.url));

/** Claude with per-call token usage in the log (our cost visibility). */
export function claude(apiKey: string, ctx: AgentContext): Claude {
  return createClaude(apiKey, {
    onUsage: (u) =>
      ctx.log(`claude ${u.model}: ${u.inputTokens} in (${u.cacheReadTokens} cached) / ${u.outputTokens} out tokens`),
  });
}

/** A fake Claude that logs what it would have been asked and answers from `reply`. */
export function dryClaude(ctx: AgentContext, reply: (call: ClaudeCall) => unknown): Claude {
  return stubClaude((call) => {
    ctx.log(`(dry run) Claude ${call.model} would be asked: ${call.user.replace(/\s+/g, " ").slice(0, 100)}…`);
    return reply(call);
  });
}

/** The real Postgres. close() ends the pool so the process can exit. */
export function postgres(url: string): { db: Database; close: () => Promise<void> } {
  const db = createDb(url);
  // drizzle keeps the pg Pool on `$client`; createDb's declared type doesn't expose it.
  const pool = (db as unknown as { $client: { end(): Promise<void> } }).$client;
  return { db, close: () => pool.end() };
}

/** An in-memory Postgres with the real migrations applied — for dry runs. */
export async function memoryDb(
  seed?: (db: Database) => Promise<void>,
): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  if (seed) await seed(db);
  return { db, close: () => client.close() };
}

/** records/ on disk; the workflow commits what lands here. */
export function repoRecords(ctx: AgentContext): RecordStore {
  return fileRecordStore(ctx.repoRoot);
}

/** records/ in memory; prints what would have been written. */
export function dryRecords(ctx: AgentContext, seed: Record<string, string> = {}): RecordStore {
  return memoryRecordStore(seed, (path, markdown) => {
    ctx.log(`(dry run) would write ${path}:\n${markdown.split("\n").map((l) => `    ${l}`).join("\n")}`);
  });
}

/** A fact body from knowledge/ in this checkout. */
export async function fact(ctx: AgentContext, path: string): Promise<string> {
  return (await readFact(path, { dir: knowledgeDir(ctx.repoRoot) })).body;
}
