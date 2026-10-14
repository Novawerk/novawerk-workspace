// @nw/kb — read canonical Novawerk facts from knowledge/ in this monorepo.
// We CONSUME the knowledge base; agents never copy facts into prompts or code by hand.
// Agents run from a checkout of the repo (locally or in GitHub Actions), so knowledge/ is
// always on disk next to the code — no clone, no network.

import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KBFact } from "@nw/types";

/** knowledge/ at the repo root (this file is packages/kb/src/index.ts). */
export const KNOWLEDGE_DIR = fileURLToPath(new URL("../../../knowledge/", import.meta.url));

/** The knowledge/ directory for a given repo root, or the one next to this package. */
export function knowledgeDir(repoRoot?: string): string {
  return repoRoot ? join(repoRoot, "knowledge") : KNOWLEDGE_DIR;
}

/**
 * Read one fact file by its knowledge-relative path, e.g. "brand/voice.md".
 * Refuses paths that escape knowledge/.
 */
export async function readFact(path: string, opts: { dir?: string } = {}): Promise<KBFact> {
  const dir = opts.dir ?? KNOWLEDGE_DIR;
  const full = resolve(dir, path);
  const rel = relative(dir, full);
  if (rel.startsWith("..") || isAbsolute(rel) || !full.endsWith(".md")) {
    throw new Error(`readFact(): "${path}" is not a Markdown file inside knowledge/.`);
  }
  const raw = await readFile(full, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  return {
    path,
    title: frontmatter["title"] ?? path,
    status: frontmatter["status"] === "evolving" ? "evolving" : "stable",
    updated: frontmatter["updated"] ?? "",
    body,
  };
}

// Minimal frontmatter reader — enough for the scalar fields we use (title, status, updated).
function splitFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { frontmatter: {}, body: raw };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    if (/^\s/.test(line)) continue; // list items / nested values
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: match[2] ?? "" };
}
