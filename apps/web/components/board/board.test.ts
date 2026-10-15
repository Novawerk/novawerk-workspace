import type { PublicContributor, PublicTask } from "@nw/contracts";
import { describe, expect, it } from "vitest";

import type { Block } from "../builders/types";
import { boardState, formatDate, maskEmail, personLabel, prLabel, safeHref } from "./labels";
import { firstContributions, scenePeople } from "./wall";

const task = (patch: Partial<PublicTask>): Pick<PublicTask, "status" | "proposalCount"> => ({ status: "open", proposalCount: 0, ...patch });

describe("boardState", () => {
  it("shows an open task with pending proposals as 'proposed'", () => {
    expect(boardState(task({}))).toBe("open");
    expect(boardState(task({ proposalCount: 2 }))).toBe("proposed");
  });
  it("reads declined and duplicate suggestions as closed", () => {
    expect(boardState(task({ status: "declined" }))).toBe("closed");
    expect(boardState(task({ status: "duplicate" }))).toBe("closed");
    expect(boardState(task({ status: "in_review" }))).toBe("in_review");
  });
});

describe("labels", () => {
  it("prints dates in UTC, whatever the clock's zone", () => {
    expect(formatDate("2026-10-11T23:30:00Z")).toBe("Oct 11, 2026");
    expect(formatDate("not a date")).toBe("");
    expect(formatDate(null)).toBe("");
  });
  it("names people without showing more than the public may see", () => {
    expect(personLabel({ kind: "contributor", handle: "lena-k", name: null, avatarUrl: null, public: false })).toBe("@lena-k");
    expect(personLabel({ kind: "member", name: "Haodong" })).toBe("Haodong");
    expect(personLabel({ kind: "former" })).toBe("a former contributor");
  });
  it("labels pull requests and keeps links to http(s)", () => {
    expect(prLabel("https://github.com/Novawerk/novawerk-workspace/pull/212")).toBe("PR #212");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://lenak.dev")).toBe("https://lenak.dev/");
  });
  it("masks the owner's email", () => {
    expect(maskEmail("lena@posteo.at")).toBe("l•••@posteo.at");
  });
});

const contributor = (handle: string): PublicContributor => ({
  handle,
  name: handle,
  avatarUrl: null,
  bio: null,
  areas: ["web"],
  lastContributionAt: "2026-10-01T00:00:00Z",
  idea: false,
});
const block = (id: string, handle: string, mergedAt: string): Block => ({ id, title: id, area: "web", size: "S", handle, mergedAt });

describe("the wall", () => {
  it("lists first contributions newest first, only for people on the wall", () => {
    const blocks = [
      block("NW-1", "lena-k", "2026-09-01T00:00:00Z"),
      block("NW-2", "anon-1a2b3c4d", "2026-09-05T00:00:00Z"),
      block("NW-3", "mira", "2026-09-10T00:00:00Z"),
      block("NW-4", "lena-k", "2026-10-01T00:00:00Z"),
    ];
    const firsts = firstContributions(blocks, [contributor("lena-k"), contributor("mira")]);
    expect(firsts.map((f) => [f.contributor.handle, f.block.id])).toEqual([
      ["mira", "NW-3"],
      ["lena-k", "NW-1"],
    ]);
  });
  it("turns contributors into the scene's people", () => {
    expect(scenePeople([contributor("lena-k")])).toEqual([{ handle: "lena-k", name: "lena-k", avatar: null, kind: "contributor" }]);
  });
});
