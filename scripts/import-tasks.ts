#!/usr/bin/env tsx
// Put a list of real tasks on the board at once, published as open (NW-<n> in the order given).
//
//   pnpm import:tasks tasks.json                         check the file, write nothing
//   DATABASE_URL=… pnpm import:tasks tasks.json          …and check the titles against the board
//   DATABASE_URL=… pnpm import:tasks tasks.json --apply --member haodong
//
// The file is a JSON array; each task is what POST /admin/tasks takes (@nw/contracts
// taskImportInput): title, summary, body (Markdown), criteria (done-when lines), area, size,
// skills, repo (default Novawerk/novawerk-workspace), reviewerId (a member's id, or null),
// guideTemplate. Dry-run by default. --apply writes all tasks in one transaction, or none: it
// refuses when a title is already on the board (any case) or the member isn't active. A person
// runs --apply, against the database they mean; this script never picks one for them.

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { TASK_SIZE_WERK, formatTaskId, taskImportInput } from "../packages/contracts/src/index.ts";
import { createDb } from "../packages/db/src/index.ts";
import { TaskRuleError, existingTaskTitles, importTasks } from "../packages/tasks/src/index.ts";

const USAGE = "Usage: pnpm import:tasks <file.json> [--apply --member <member id>]";

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { apply: { type: "boolean", default: false }, member: { type: "string" } },
  });
  const file = positionals[0];
  if (!file) {
    console.error(USAGE);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    console.error(`Can't read ${file}: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
  const parsed = taskImportInput.safeParse(raw);
  if (!parsed.success) {
    console.error(`${file} doesn't match the task format:`);
    for (const issue of parsed.error.issues) console.error(`  [${issue.path.join(".") || "file"}] ${issue.message}`);
    return 1;
  }
  const list = parsed.data;

  console.log(`${list.length} task(s) in ${file}:`);
  for (const [i, t] of list.entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. ${t.title}  (${t.area}, ${t.size} · ${TASK_SIZE_WERK[t.size]} Werk, ${t.criteria.length} done-when)`);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    if (values.apply) {
      console.error("\n--apply needs DATABASE_URL: set it to the database you mean to write to.");
      return 2;
    }
    console.log("\nDry run: the file is valid. Set DATABASE_URL to also check the titles against the board.");
    return 0;
  }

  const db = createDb(url);
  try {
    const clash = await existingTaskTitles(db, list);
    if (clash.length) {
      console.error(`\nAlready on the board, nothing written:\n${clash.map((t) => `  - ${t}`).join("\n")}`);
      return 1;
    }
    if (!values.apply) {
      console.log("\nDry run: no title is on the board yet. Add --apply --member <id> to publish them.");
      return 0;
    }
    if (!values.member) {
      console.error(`\n--apply needs --member <id>: the member these tasks are filed by.\n${USAGE}`);
      return 2;
    }
    const created = await importTasks(db, values.member, list);
    console.log(`\nPublished ${created.length} task(s):`);
    for (const t of created) console.log(`  ${formatTaskId(t.id)}  ${t.title}`);
    return 0;
  } catch (err) {
    if (err instanceof TaskRuleError) {
      console.error(`\nNothing written: ${err.message}`);
      return 1;
    }
    throw err;
  } finally {
    // The pool keeps the process alive until it closes (as in scripts/post.ts).
    await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
