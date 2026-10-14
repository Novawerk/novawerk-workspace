// Board hygiene rules and the CLI output parser. jira-automation comments on real issues,
// so "who is ownerless" has to be exactly right.

import { describe, expect, it } from "vitest";

import { fakeJira, findOwnerless, nudgeOwnerless, OWNER_NUDGE, ownerlessJql, parseRawIssues, type JiraIssue } from "./index.js";

const ISSUES: JiraIssue[] = [
  { key: "NB-1", status: "To Do", assignee: "", summary: "No owner" },
  { key: "NB-2", status: "In Progress", assignee: "Haodong Ju", summary: "Owned" },
  { key: "NB-3", status: "Blocked", assignee: " - ", summary: "Dash means nobody" },
  { key: "NB-4", status: "Done", assignee: "", summary: "Done without owner" },
];

describe("parseRawIssues", () => {
  it("reads key, status, assignee and summary from --raw JSON", () => {
    const raw = JSON.stringify([
      { key: "NB-7", fields: { summary: "Ship it", status: { name: "正在进行" }, assignee: { displayName: "Ada" } } },
      { key: "NB-8", fields: { summary: "Orphan", status: { name: "待办" }, assignee: { displayName: "" } } },
      { key: "NB-9", fields: { summary: "Null owner", status: { name: "待办" }, assignee: null } },
    ]);
    expect(parseRawIssues(raw)).toEqual([
      { key: "NB-7", status: "正在进行", assignee: "Ada", summary: "Ship it" },
      { key: "NB-8", status: "待办", assignee: "", summary: "Orphan" },
      { key: "NB-9", status: "待办", assignee: "", summary: "Null owner" },
    ]);
  });

  it("refuses output that is not an array", () => {
    expect(() => parseRawIssues("{}")).toThrow(/array/);
  });
});

describe("findOwnerless", () => {
  it("keeps empty and dash assignees only", () => {
    expect(findOwnerless(ISSUES).map((i) => i.key)).toEqual(["NB-1", "NB-3", "NB-4"]);
  });
});

describe("ownerlessJql", () => {
  it("filters server-side by owner, open status and quiet period, without ORDER BY", () => {
    const jql = ownerlessJql(7);
    expect(jql).toBe("assignee is EMPTY AND statusCategory != Done AND updated <= -7d");
    expect(jql).not.toMatch(/ORDER BY|project/i);
  });
});

describe("fakeJira", () => {
  it("applies the agents' filters and records comments instead of posting", async () => {
    const jira = fakeJira(ISSUES);
    expect((await jira.listIssues(ownerlessJql(7))).map((i) => i.key)).toEqual(["NB-1", "NB-3"]);
    await jira.addComment("NB-1", "hi");
    expect(jira.comments).toEqual([{ key: "NB-1", body: "hi" }]);
  });
});

describe("nudgeOwnerless", () => {
  it("comments the house rule on ownerless open issues, capped at max", async () => {
    const jira = fakeJira(ISSUES);
    const out = await nudgeOwnerless(jira, { quietDays: 7, max: 1, log: () => {} });
    expect(out).toEqual({ nudged: ["NB-1"], found: 2 });
    expect(jira.comments).toEqual([{ key: "NB-1", body: OWNER_NUDGE }]);
  });
});
