// Where agents write narrative records. Every write goes through a RecordStore, which only
// accepts Markdown paths under records/ — an agent can't write code, workflows, or private
// escape-hatch files, whatever its prompt says. The GitHub Actions workflow commits the result.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import type { RecordFrontmatter } from "@nw/types";

import { parseRecord, serializeRecord } from "./index.js";

export interface RecordStore {
  /** The file's text, or undefined if it doesn't exist. Path is repo-relative (records/...). */
  read(path: string): Promise<string | undefined>;
  write(path: string, markdown: string): Promise<void>;
}

/** Normalise and validate a repo-relative record path. Throws if it isn't a public-to-git record. */
export function assertRecordPath(path: string): string {
  const normalized = posix.normalize(path.replace(/\\/g, "/"));
  if (
    !normalized.startsWith("records/") ||
    normalized.split("/").includes("..") ||
    !normalized.endsWith(".md") ||
    normalized.endsWith(".private.md") ||
    normalized.includes(".private/")
  ) {
    throw new Error(`refusing to touch "${path}": agents may only write records/**/*.md (not *.private.*).`);
  }
  return normalized;
}

/** Records on disk under a repo root. */
export function fileRecordStore(repoRoot: string): RecordStore {
  return {
    async read(path) {
      try {
        return await readFile(join(repoRoot, assertRecordPath(path)), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw err;
      }
    },
    async write(path, markdown) {
      const full = join(repoRoot, assertRecordPath(path));
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, markdown, "utf8");
    },
  };
}

/** Records in memory — for dry runs and tests. `files` shows what would have been written. */
export function memoryRecordStore(
  seed: Record<string, string> = {},
  onWrite?: (path: string, markdown: string) => void,
): RecordStore & { files: Map<string, string> } {
  const files = new Map(Object.entries(seed));
  return {
    files,
    async read(path) {
      return files.get(assertRecordPath(path));
    },
    async write(path, markdown) {
      const p = assertRecordPath(path);
      files.set(p, markdown);
      onWrite?.(p, markdown);
    },
  };
}

/** A fresh record: frontmatter + body. */
export function newRecord(fm: Omit<RecordFrontmatter, "confidential" | "source" | "related"> & Partial<RecordFrontmatter>, body: string): string {
  return serializeRecord({
    frontmatter: { confidential: true, source: [], related: [], ...fm },
    body: body.endsWith("\n") ? body : `${body}\n`,
  });
}

/**
 * Append a `## heading` section to an existing record and bump `updated`. If the record
 * doesn't exist yet, `create()` supplies its frontmatter and opening body.
 */
export async function appendSection(
  store: RecordStore,
  path: string,
  section: { heading: string; body: string; updated: string },
  create: () => string,
): Promise<string> {
  const existing = (await store.read(path)) ?? create();
  const record = parseRecord(existing);
  record.frontmatter.updated = section.updated;
  record.body = `${record.body.trimEnd()}\n\n## ${section.heading}\n\n${section.body.trim()}\n`;
  const markdown = serializeRecord(record);
  await store.write(path, markdown);
  return markdown;
}
