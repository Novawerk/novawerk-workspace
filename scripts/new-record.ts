#!/usr/bin/env tsx
// Scaffold a new record with correct frontmatter.
// Usage: pnpm new:record <category> <slug> ["Title"]
//   category: operations | people | finance | legal | partners
// Records live in the private repo (Novawerk/novawerk). Link them into this checkout first:
//   ln -s ../novawerk/records records

import { mkdir, writeFile, access, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

const CATEGORIES = ["operations", "people", "finance", "legal", "partners"] as const;
type Category = (typeof CATEGORIES)[number];

async function main(): Promise<void> {
  const [, , category, slug, ...titleParts] = process.argv;

  if (!category || !slug || !CATEGORIES.includes(category as Category)) {
    console.error(`Usage: pnpm new:record <${CATEGORIES.join("|")}> <slug> ["Title"]`);
    process.exit(1);
  }

  const linked = await stat("records").then((s) => s.isDirectory()).catch(() => false);
  if (!linked) {
    console.error("No records/ here. Records live in the private repo Novawerk/novawerk.");
    console.error("Clone it next to this repo, then link its records into this checkout:");
    console.error("  ln -s ../novawerk/records records");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const title = titleParts.join(" ") || slug.replace(/-/g, " ");
  const path = join("records", category, `${slug}.md`);

  const body = `---
title: ${title}
category: ${category}
status: draft
confidential: true
source: []
related: []
updated: ${today}
---

# ${title}

`;

  const exists = await access(path).then(() => true).catch(() => false);
  if (exists) {
    console.error(`Refusing to overwrite existing record: ${path}`);
    process.exit(1);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
  console.log(`Created ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
