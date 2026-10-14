// @nw/records — read/write the markdown records under records/ with frontmatter.
// Narrative only. Structured data goes to @nw/db; binaries go to @nw/object-store.

import { readFile, writeFile } from "node:fs/promises";

import type { MarkdownRecord, RecordFrontmatter } from "@nw/types";

/** Parse a record file's frontmatter + body. */
export function parseRecord(raw: string): MarkdownRecord {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error("record is missing YAML frontmatter");
  return { frontmatter: parseFrontmatter(match[1]!), body: match[2] ?? "" };
}

export async function readRecord(path: string): Promise<MarkdownRecord> {
  return parseRecord(await readFile(path, "utf8"));
}

export async function writeRecord(path: string, record: MarkdownRecord): Promise<void> {
  await writeFile(path, serializeRecord(record), "utf8");
}

export function serializeRecord(record: MarkdownRecord): string {
  const fm = record.frontmatter;
  const lines = [
    "---",
    `title: ${fm.title}`,
    `category: ${fm.category}`,
    `status: ${fm.status}`,
    `confidential: ${fm.confidential}`,
    `source: [${fm.source.join(", ")}]`,
    `related: [${fm.related.join(", ")}]`,
    `updated: ${fm.updated}`,
    "---",
    "",
    record.body.replace(/^\n+/, ""),
  ];
  return lines.join("\n");
}

// Minimal YAML-subset reader for our fixed frontmatter shape.
// Phase 1 may swap in `gray-matter`/`yaml` for full fidelity.
function parseFrontmatter(block: string): RecordFrontmatter {
  const map: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const list = (s: string | undefined): string[] =>
    !s ? [] : s.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);

  return {
    title: strip(map["title"]) ?? "",
    category: (strip(map["category"]) ?? "operations") as RecordFrontmatter["category"],
    status: (strip(map["status"]) ?? "draft") as RecordFrontmatter["status"],
    confidential: (map["confidential"] ?? "true").trim() !== "false",
    source: list(map["source"]),
    related: list(map["related"]),
    updated: strip(map["updated"]) ?? "",
  };
}

function strip(s: string | undefined): string | undefined {
  return s?.replace(/^["']|["']$/g, "");
}

export {
  appendSection,
  assertRecordPath,
  fileRecordStore,
  memoryRecordStore,
  newRecord,
  type RecordStore,
} from "./store.js";
