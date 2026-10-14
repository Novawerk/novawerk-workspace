// Agents pull brand voice and meeting design from knowledge/. Reads must hit the real files
// and must not wander outside knowledge/.

import { describe, expect, it } from "vitest";

import { readFact } from "./index.js";

describe("readFact", () => {
  it("reads a real fact from knowledge/ with its frontmatter", async () => {
    const voice = await readFact("brand/voice.md");
    expect(voice.title).toBe("Brand voice");
    expect(voice.status).toBe("stable");
    expect(voice.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(voice.body).toContain("# Brand voice");
    expect(voice.body).not.toContain("title:");
  });

  it("refuses paths outside knowledge/", async () => {
    await expect(readFact("../records/people/roster.md")).rejects.toThrow(/inside knowledge/);
    await expect(readFact("/etc/passwd")).rejects.toThrow(/inside knowledge/);
  });
});
