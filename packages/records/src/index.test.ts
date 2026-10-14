// Tests the frontmatter parse/serialize for records. Narrative records are our source of truth
// for minutes, ADRs, and policies — parsing has to be faithful and round-trip cleanly.

import { describe, expect, it } from "vitest";
import { parseRecord, serializeRecord } from "./index.js";

const SAMPLE = `---
title: NB-ADR-0002 — Foundations
category: operations
status: stable
confidential: true
source: []
related: [NB-ADR-0001]
updated: 2026-06-04
---

# Body

Hello.
`;

describe("parseRecord", () => {
  it("throws when frontmatter is missing", () => {
    expect(() => parseRecord("# no frontmatter")).toThrow(/missing YAML frontmatter/);
  });

  it("parses scalar fields, lists, and the body", () => {
    const rec = parseRecord(SAMPLE);
    expect(rec.frontmatter.title).toBe("NB-ADR-0002 — Foundations");
    expect(rec.frontmatter.category).toBe("operations");
    expect(rec.frontmatter.confidential).toBe(true);
    expect(rec.frontmatter.source).toEqual([]);
    expect(rec.frontmatter.related).toEqual(["NB-ADR-0001"]);
    expect(rec.body.trim()).toBe("# Body\n\nHello.");
  });

  it("treats confidential as true unless explicitly false (private by default)", () => {
    const open = parseRecord(SAMPLE.replace("confidential: true", "confidential: false"));
    expect(open.frontmatter.confidential).toBe(false);
    const fallback = parseRecord(SAMPLE.replace("confidential: true", "confidential: maybe"));
    expect(fallback.frontmatter.confidential).toBe(true);
  });

  it("strips surrounding quotes from values", () => {
    const rec = parseRecord(SAMPLE.replace("title: NB-ADR-0002 — Foundations", 'title: "Quoted"'));
    expect(rec.frontmatter.title).toBe("Quoted");
  });
});

describe("serializeRecord round-trip", () => {
  it("re-parses to the same frontmatter", () => {
    const original = parseRecord(SAMPLE);
    const reparsed = parseRecord(serializeRecord(original));
    expect(reparsed.frontmatter).toEqual(original.frontmatter);
  });
});
