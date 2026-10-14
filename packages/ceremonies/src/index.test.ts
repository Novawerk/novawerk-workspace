// Dates, the fortnight rule, and both writers against a fake board and in-memory records.

import { describe, expect, it } from "vitest";

import { stubClaude, type ClaudeCall } from "@nw/agent-core";
import { fakeJira, type JiraIssue } from "@nw/jira";
import { memoryRecordStore, parseRecord } from "@nw/records";

import { berlinDate, isAllHandsWeek, isoWeek, writeAllHandsAgenda, writeStandupDigest } from "./index.js";

const ISSUES: JiraIssue[] = [
  { key: "NB-1", status: "In Progress", assignee: "Haodong Ju", summary: "Outbox gate" },
  { key: "NB-2", status: "Blocked", assignee: "", summary: "R2 bucket" },
  { key: "NB-3", status: "Done", assignee: "Haodong Ju", summary: "Monorepo" },
];

describe("dates", () => {
  it("berlinDate uses Berlin's calendar day", () => {
    expect(berlinDate(new Date("2026-10-04T22:30:00Z"))).toBe("2026-10-05"); // 00:30 in Berlin
  });

  it("isoWeek matches ISO-8601, including year boundaries", () => {
    expect(isoWeek("2026-10-05")).toBe("2026-W41");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
  });

  it("isAllHandsWeek alternates weekly from the anchor Monday", () => {
    expect(isAllHandsWeek("2026-10-05", "2026-10-05")).toBe(true);
    expect(isAllHandsWeek("2026-10-12", "2026-10-05")).toBe(false);
    expect(isAllHandsWeek("2026-10-19", "2026-10-05")).toBe(true);
    expect(isAllHandsWeek("2026-10-21", "2026-10-05")).toBe(true); // same week, Wednesday
    expect(isAllHandsWeek("2026-09-28", "2026-10-05")).toBe(false); // before the anchor
  });
});

describe("writeStandupDigest", () => {
  it("appends a dated section to this week's digest", async () => {
    const calls: ClaudeCall[] = [];
    const claude = stubClaude((call) => {
      calls.push(call);
      return "### Done\n- NB-3\n\n### Next\n- NB-1\n\n### Blocked\n- NB-2";
    });
    const records = memoryRecordStore();
    const deps = { jira: fakeJira(ISSUES), claude, records, voice: "# Brand voice\nShort.", log: () => {} };

    const out = await writeStandupDigest(deps, { now: new Date("2026-10-05T07:00:00Z") });
    expect(out).toEqual({ path: "records/operations/standups/2026-W41-standup-digest.md", open: 2, done: 1 });
    await writeStandupDigest(deps, { now: new Date("2026-10-07T07:00:00Z") });

    const rec = parseRecord(records.files.get(out.path)!);
    expect(rec.frontmatter).toMatchObject({ title: "Standup digest 2026-W41", category: "operations", updated: "2026-10-07" });
    expect(rec.body).toContain("## 2026-10-05");
    expect(rec.body).toContain("## 2026-10-07");
    expect(calls[0]!.user).toContain("NB-2 [Blocked] no owner: R2 bucket");
    expect(calls[0]!.system).toContain("Short.");
  });
});

describe("writeAllHandsAgenda", () => {
  const claude = stubClaude(() => "## Blockers\n- NB-2 — owner: Haodong — get the bucket.");
  const deps = () => ({
    jira: fakeJira(ISSUES),
    claude,
    records: memoryRecordStore(),
    voice: "Short.",
    meetingDesign: "Blockers first.",
    log: () => {},
  });

  it("skips off-weeks unless forced", async () => {
    const d = deps();
    const off = await writeAllHandsAgenda(d, { now: new Date("2026-10-12T07:00:00Z"), anchor: "2026-10-05" });
    expect(off.status).toBe("skipped");
    expect(d.records.files.size).toBe(0);
    const forced = await writeAllHandsAgenda(d, { now: new Date("2026-10-12T07:00:00Z"), anchor: "2026-10-05", force: true });
    expect(forced).toEqual({ status: "written", path: "records/operations/all-hands/2026-10-12-all-hands.md" });
  });

  it("writes the agenda once and never overwrites an existing one", async () => {
    const d = deps();
    const opts = { now: new Date("2026-10-05T07:00:00Z"), anchor: "2026-10-05" };
    expect(await writeAllHandsAgenda(d, opts)).toEqual({ status: "written", path: "records/operations/all-hands/2026-10-05-all-hands.md" });
    const rec = parseRecord(d.records.files.get("records/operations/all-hands/2026-10-05-all-hands.md")!);
    expect(rec.frontmatter).toMatchObject({ title: "All-hands 2026-10-05", status: "draft" });
    expect(rec.body).toContain("NB-2 — owner: Haodong");
    expect((await writeAllHandsAgenda(d, opts)).status).toBe("skipped");
  });
});
