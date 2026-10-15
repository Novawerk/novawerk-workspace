// scripts/import-tasks.ts: a list of tasks published at once, all or nothing.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { taskImportInput } from "@nw/contracts";
import { members, taskEvents, tasks, type Database } from "@nw/db";
import { createTestDb, resetDb } from "@nw/db/testing";

import { TaskRuleError, existingTaskTitles, importTasks } from "./index.js";

let db: Database;
beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
beforeEach(async () => {
  await resetDb(db);
  await db.insert(members).values([
    { id: "haodong", displayName: "Haodong", email: "h@novawerk.io" },
    { id: "gone", displayName: "Gone", email: "g@novawerk.io", active: false },
  ]);
});

const list = taskImportInput.parse([
  { title: "Add security.txt", summary: "Where to report", area: "web", size: "S", criteria: ["Served at /.well-known/security.txt"] },
  { title: "Paginate the admin lists", area: "api", size: "M", skills: ["hono", "drizzle"], reviewerId: "haodong" },
]);

describe("taskImportInput", () => {
  it("fills defaults and refuses the same title twice", () => {
    expect(list[1]).toMatchObject({ repo: "Novawerk/novawerk-workspace", summary: "", criteria: [], reviewerId: "haodong" });
    const twice = taskImportInput.safeParse([
      { title: "One", area: "web", size: "S" },
      { title: " one ", area: "api", size: "M" },
    ]);
    expect(twice.success).toBe(false);
    expect(taskImportInput.safeParse([]).success).toBe(false);
    expect(taskImportInput.safeParse([{ title: "x", area: "nowhere", size: "S" }]).success).toBe(false);
  });
});

describe("importTasks", () => {
  it("publishes every task as open, in order, with its events", async () => {
    const created = await importTasks(db, "haodong", list);
    expect(created.map((t) => [t.id, t.title, t.status])).toEqual([
      [1, "Add security.txt", "open"],
      [2, "Paginate the admin lists", "open"],
    ]);
    const kinds = (await db.select().from(taskEvents)).map((e) => [e.taskId, e.kind]);
    expect(kinds).toEqual([
      [1, "created"],
      [1, "published"],
      [2, "created"],
      [2, "published"],
    ]);
  });

  it("writes nothing when a title is already on the board, or the member isn't active", async () => {
    await db.insert(tasks).values({ title: "ADD SECURITY.TXT", status: "done" });
    expect(await existingTaskTitles(db, list)).toEqual(["ADD SECURITY.TXT"]);
    await expect(importTasks(db, "haodong", list)).rejects.toThrow(TaskRuleError);
    expect(await db.select().from(tasks)).toHaveLength(1);

    await resetDb(db);
    await db.insert(members).values({ id: "gone", displayName: "Gone", email: "g@novawerk.io", active: false });
    await expect(importTasks(db, "gone", list)).rejects.toThrow(/No active member/);
    expect(await db.select().from(tasks)).toEqual([]);
  });

  it("rolls back every task when one fails half-way", async () => {
    const bad = taskImportInput.parse([
      { title: "Fine", area: "web", size: "S" },
      { title: "Unknown reviewer", area: "web", size: "S", reviewerId: "nobody" },
    ]);
    await expect(importTasks(db, "haodong", bad)).rejects.toThrow();
    expect(await db.select().from(tasks)).toEqual([]);
  });
});
