// The post schedule: which moments a project has reached, with lead time, and no stale backlog.

import { describe, expect, it } from "vitest";

import { addDays, daysBetween, nextSeq, plannedPosts, upcomingPosts, type LifecycleFacts } from "./plan.js";

const building = (since: string): LifecycleFacts => ({ status: "building", launchDate: null, buildingSince: since });
const kinds = (facts: LifecycleFacts, today: string) => plannedPosts(facts, today).map((p) => `${p.kind}:${p.seq}@${p.dueOn}`);

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-11")).toBe(10);
    expect(daysBetween("2026-10-11", "2026-10-01")).toBe(-10);
  });
});

describe("plannedPosts", () => {
  it("has nothing for drafts, planning, or a project with no dates", () => {
    expect(plannedPosts({ status: "draft", launchDate: null, buildingSince: null }, "2026-10-03")).toEqual([]);
    expect(plannedPosts({ status: "planning", launchDate: null, buildingSince: "2026-10-01" }, "2026-10-03")).toEqual([]);
    expect(plannedPosts({ status: "building", launchDate: null, buildingSince: null }, "2026-10-03")).toEqual([]);
  });

  it("announces the start, then a progress post every two weeks, three days ahead", () => {
    const facts = building("2026-10-01");
    expect(kinds(facts, "2026-10-01")).toEqual(["kickoff:0@2026-10-01"]);
    // Week 2 is due on the 15th and shows up on the 12th.
    expect(kinds(facts, "2026-10-11")).toEqual(["kickoff:0@2026-10-01"]);
    expect(kinds(facts, "2026-10-12")).toEqual(["kickoff:0@2026-10-01", "progress:2@2026-10-15"]);
    // By the 26th the kickoff is more than two weeks gone.
    expect(kinds(facts, "2026-10-26")).toEqual(["progress:2@2026-10-15", "progress:4@2026-10-29"]);
  });

  it("skips moments more than two weeks gone instead of piling them up", () => {
    // Building since spring: only the latest progress posts are still worth writing.
    expect(kinds(building("2026-03-02"), "2026-10-03")).toEqual(["progress:30@2026-09-28"]);
  });

  it("warms up for the launch while launching, once the date is set", () => {
    const launching: LifecycleFacts = { status: "launching", launchDate: "2026-11-01", buildingSince: "2026-10-20" };
    // Behind the scenes is due T-10 and appears five days before that.
    expect(kinds(launching, "2026-10-16")).toEqual([]);
    expect(kinds(launching, "2026-10-17")).toEqual(["behind_the_scenes:0@2026-10-22"]);
    expect(kinds(launching, "2026-10-20")).toEqual(["kickoff:0@2026-10-20", "behind_the_scenes:0@2026-10-22"]);
    expect(kinds(launching, "2026-10-25")).toContain("launch:0@2026-11-01");
    expect(kinds({ ...launching, launchDate: null }, "2026-10-25")).toEqual(["kickoff:0@2026-10-20"]);
  });

  it("follows up ten, thirty and ninety days after launch", () => {
    const launched: LifecycleFacts = { status: "launched", launchDate: "2026-09-01", buildingSince: null };
    expect(kinds(launched, "2026-09-01")).toEqual(["launch:0@2026-09-01"]);
    expect(kinds(launched, "2026-09-08")).toEqual(["launch:0@2026-09-01", "ten_day:0@2026-09-11"]);
    expect(kinds(launched, "2026-09-28")).toEqual(["retro:30@2026-10-01"]);
    expect(kinds(launched, "2026-11-25")).toEqual(["retro:90@2026-11-30"]);
    // No behind-the-scenes post once it has launched.
    expect(kinds({ ...launched, launchDate: "2026-09-12" }, "2026-09-05")).toEqual(["launch:0@2026-09-12"]);
  });
});

describe("nextSeq", () => {
  const facts: LifecycleFacts = { status: "building", launchDate: null, buildingSince: "2026-09-01" };
  it("numbers an extra progress post by the current week, skipping used ones", () => {
    expect(nextSeq("progress", [], facts, "2026-10-03")).toBe(5);
    expect(nextSeq("progress", [5, 6], facts, "2026-10-03")).toBe(7);
  });
  it("numbers a retro by days since launch, and one-offs with 0", () => {
    expect(nextSeq("retro", [], { ...facts, launchDate: "2026-09-01" }, "2026-10-01")).toBe(30);
    expect(nextSeq("retro", [30], { ...facts, launchDate: "2026-09-01" }, "2026-10-01")).toBe(31);
    expect(nextSeq("launch", [], facts, "2026-10-01")).toBe(0);
  });
});

describe("upcomingPosts", () => {
  const ahead = (facts: LifecycleFacts, today: string, existing: { kind: "kickoff" | "progress" | "launch"; seq: number }[] = []) =>
    upcomingPosts(facts, today, existing).map((p) => `${p.kind}:${p.seq}@${p.dueOn}`);

  it("shows the next progress post while building, and nothing that already exists", () => {
    const facts = building("2026-10-01");
    expect(ahead(facts, "2026-10-03")).toEqual(["kickoff:0@2026-10-01", "progress:2@2026-10-15"]);
    expect(ahead(facts, "2026-10-03", [{ kind: "kickoff", seq: 0 }, { kind: "progress", seq: 2 }])).toEqual([
      "progress:4@2026-10-29",
    ]);
  });

  it("shows the launch moments as soon as a date is set, before the project gets there", () => {
    const facts: LifecycleFacts = { status: "building", launchDate: "2026-11-01", buildingSince: null };
    expect(ahead(facts, "2026-10-03")).toEqual([
      "behind_the_scenes:0@2026-10-22",
      "launch:0@2026-11-01",
      "ten_day:0@2026-11-11",
      "retro:30@2026-12-01",
      "retro:90@2027-01-30",
    ]);
  });

  it("drops what is long gone and what is too far ahead", () => {
    const launched: LifecycleFacts = { status: "launched", launchDate: "2026-06-01", buildingSince: null };
    expect(ahead(launched, "2026-10-03")).toEqual([]);
    const far: LifecycleFacts = { status: "launching", launchDate: "2027-06-01", buildingSince: null };
    expect(ahead(far, "2026-10-03")).toEqual([]);
  });
});
