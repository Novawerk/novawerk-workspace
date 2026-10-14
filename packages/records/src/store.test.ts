// Agents write records/ files that a workflow commits. The store must refuse anything else.

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseRecord } from "./index.js";
import { appendSection, assertRecordPath, fileRecordStore, memoryRecordStore, newRecord } from "./store.js";

describe("assertRecordPath", () => {
  it("accepts Markdown under records/", () => {
    expect(assertRecordPath("records/operations/standups/2026-W40-standup-digest.md")).toBe(
      "records/operations/standups/2026-W40-standup-digest.md",
    );
  });

  it.each([
    "records/../.github/workflows/ci.yml",
    "packages/email/src/outbox.ts",
    "records/partners/acme.txt",
    "records/people/salaries.private.md",
    "records/legal/x.private/contract.md",
    "/etc/passwd",
  ])("refuses %s", (path) => {
    expect(() => assertRecordPath(path)).toThrow(/refusing/);
  });
});

describe("fileRecordStore", () => {
  it("writes, creating folders, and reads back; missing files read as undefined", async () => {
    const root = await mkdtemp(join(tmpdir(), "nw-records-"));
    const store = fileRecordStore(root);
    expect(await store.read("records/partners/acme.md")).toBeUndefined();
    await store.write("records/partners/acme.md", "# Acme\n");
    expect(await readFile(join(root, "records/partners/acme.md"), "utf8")).toBe("# Acme\n");
    expect(await store.read("records/partners/acme.md")).toBe("# Acme\n");
  });
});

describe("appendSection", () => {
  const create = () =>
    newRecord({ title: "Standup digest 2026-W40", category: "operations", status: "evolving", updated: "2026-10-01" }, "# Standup digest 2026-W40\n");

  it("creates the record on first write, then appends dated sections", async () => {
    const store = memoryRecordStore();
    const path = "records/operations/standups/2026-W40-standup-digest.md";
    await appendSection(store, path, { heading: "2026-10-01", body: "Done: a", updated: "2026-10-01" }, create);
    await appendSection(store, path, { heading: "2026-10-03", body: "Done: b", updated: "2026-10-03" }, create);

    const record = parseRecord(store.files.get(path)!);
    expect(record.frontmatter.updated).toBe("2026-10-03");
    expect(record.frontmatter.confidential).toBe(true);
    expect(record.body).toMatch(/## 2026-10-01\n\nDone: a\n\n## 2026-10-03\n\nDone: b\n$/);
  });
});
