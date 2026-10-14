// Test-only: an in-memory Postgres (PGlite) with the real migrations. Boot it once per test file
// (beforeAll) and call resetDb() before each test. Booting and migrating takes seconds on a CI
// runner; a truncate takes milliseconds. Give that beforeAll 60 s: without a saved data dir
// (below), a busy 2-core runner has taken 26 s for the first boot.
//
// A fresh PGlite spends most of its start-up in initdb. So the first boot saves the migrated data
// directory to packages/db/node_modules/.cache/nw-test-db/, and every later boot loads it instead. The file name is a
// hash of the migrations and the PGlite version: change either and the next boot rebuilds it.

import { PGlite } from "@electric-sql/pglite";
import { getTableName, is, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PgTable } from "drizzle-orm/pg-core";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { schema, type Database } from "./index.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const snapshotFolder = fileURLToPath(new URL("../node_modules/.cache/nw-test-db", import.meta.url));

const tables = Object.values(schema)
  .filter((t) => is(t, PgTable))
  .map((t) => `"${getTableName(t)}"`)
  .join(", ");

export async function createTestDb(): Promise<Database> {
  const file = await snapshotFile();
  const saved = await readFile(file).catch(() => undefined);
  if (saved) return drizzle(new PGlite({ loadDataDir: new Blob([saved]) }), { schema });

  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  // Write under a unique name, then rename: a test file starting in parallel never reads half a file.
  const dump = await client.dumpDataDir("none");
  await mkdir(dirname(file), { recursive: true });
  const partial = `${file}.${randomUUID()}`;
  await writeFile(partial, new Uint8Array(await dump.arrayBuffer()));
  await rename(partial, file);
  // Older copies were made from migrations that have changed since.
  for (const old of await readdir(snapshotFolder)) {
    if (old.endsWith(".tar") && old !== basename(file)) await rm(join(snapshotFolder, old), { force: true });
  }
  return db;
}

/** Empties every table in the schema and restarts their sequences. */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}

async function snapshotFile(): Promise<string> {
  const hash = createHash("sha256");
  const pgliteEntry = createRequire(import.meta.url).resolve("@electric-sql/pglite");
  hash.update(await readFile(join(dirname(pgliteEntry), "../package.json")));
  const files = (await readdir(migrationsFolder)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of ["meta/_journal.json", ...files]) hash.update(f).update(await readFile(join(migrationsFolder, f)));
  return join(snapshotFolder, `${hash.digest("hex").slice(0, 16)}.tar`);
}
