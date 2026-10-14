// Tests the pure discovery helpers. Discovery is autonomous, so dedup must be reliable —
// a flaky dedupe means re-emailing partners we already have, which is exactly what the
// human gate shouldn't have to catch.

import { describe, expect, it } from "vitest";
import { candidateToPartner, candidateToRecord, dedupeCandidates, slugify } from "./index.js";

describe("slugify", () => {
  it("makes a kebab id from a name", () => {
    expect(slugify("The Acme Foundation, Inc.")).toBe("the-acme-foundation-inc");
  });
});

describe("dedupeCandidates", () => {
  it("drops candidates we already have by id", () => {
    const out = dedupeCandidates([{ name: "Acme Foundation", whyFit: "x" }], ["acme-foundation"]);
    expect(out).toEqual([]);
  });

  it("drops intra-batch duplicates, keeping the first", () => {
    const out = dedupeCandidates(
      [
        { name: "Globex", whyFit: "a" },
        { name: "Globex", whyFit: "b" },
      ],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.whyFit).toBe("a");
  });

  it("passes through genuinely new candidates with ids filled in", () => {
    const out = dedupeCandidates([{ name: "New Org", whyFit: "fits" }], ["acme"]);
    expect(out[0]?.id).toBe("new-org");
  });
});

describe("candidateToPartner", () => {
  it("maps to an intro-stage partner row", () => {
    const p = candidateToPartner({ name: "Acme", whyFit: "x", suggestedContact: "a@b.org" });
    expect(p).toEqual({ id: "acme", name: "Acme", stage: "intro", primaryEmail: "a@b.org" });
  });
});

describe("candidateToRecord", () => {
  it("produces a record at the partner path with an unverified-contact caveat", () => {
    const { path, markdown } = candidateToRecord({ name: "Acme", whyFit: "fits us" }, "2026-06-04");
    expect(path).toBe("records/partners/acme.md");
    expect(markdown).toContain("category: partners");
    expect(markdown).toContain("unverified");
    expect(markdown).toContain("fits us");
  });
});
