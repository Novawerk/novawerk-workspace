import { describe, expect, it } from "vitest";

import { TASK_STATUSES, type TaskStatus } from "@nw/contracts";

import { TaskRuleError } from "./errors.js";
import { FINAL_STATUSES, TASK_ACTIONS, nextStatuses, planTransition, type Actor, type TaskAction } from "./state.js";

const member: Actor = { kind: "member", id: "ada" };
const system: Actor = { kind: "system" };
const lena: Actor = { kind: "contributor", id: "lena" };
const jonas: Actor = { kind: "contributor", id: "jonas" };

function ruleError(fn: () => unknown): TaskRuleError {
  try {
    fn();
  } catch (e) {
    if (e instanceof TaskRuleError) return e;
    throw e;
  }
  throw new Error("expected a TaskRuleError");
}

describe("the task lifecycle", () => {
  it("matches the design's diagram", () => {
    const edges = Object.fromEntries(TASK_STATUSES.map((s) => [s, nextStatuses(s).sort()]));
    expect(edges).toEqual({
      draft: ["open"],
      suggested: ["assigned", "declined", "duplicate", "open", "suggested"],
      open: ["assigned", "closed"],
      assigned: ["closed", "done", "in_review", "open"],
      in_review: ["assigned", "closed", "done"],
      done: [],
      closed: ["open"],
      declined: [],
      duplicate: [],
    });
  });

  it("never leaves a final status, except a member reopening a closed task", () => {
    expect(planTransition({ status: "closed", assigneeId: null }, "reopen", member)).toEqual({ to: "open", event: "reopened" });
    for (const status of FINAL_STATUSES) {
      for (const action of Object.keys(TASK_ACTIONS) as TaskAction[]) {
        if (status === "closed" && action === "reopen") continue;
        expect(ruleError(() => planTransition({ status, assigneeId: "lena" }, action, member)).code).toMatch(
          /invalid_state|forbidden/,
        );
      }
    }
  });

  it("walks a task from draft to done", () => {
    let status: TaskStatus = "draft";
    for (const [action, actor] of [
      ["publish", member],
      ["choose", member],
      ["link_pr", lena],
      ["pr_closed", system],
      ["link_pr", system],
      ["merge", system],
    ] as const) {
      status = planTransition({ status, assigneeId: "lena" }, action, actor).to;
    }
    expect(status).toBe("done");
  });

  it("names the event for each step", () => {
    expect(planTransition({ status: "open", assigneeId: null }, "choose", member).event).toBe("assigned");
    expect(planTransition({ status: "assigned", assigneeId: "lena" }, "release", lena)).toEqual({ to: "open", event: "released" });
    expect(planTransition({ status: "suggested", assigneeId: null }, "accept_assign", member).event).toBe("accepted");
  });
});

describe("who may do what", () => {
  it("lets only members publish, triage, choose, close and reopen", () => {
    for (const action of ["publish", "accept", "decline", "mark_duplicate", "choose", "close", "reopen"] as const) {
      const from = TASK_ACTIONS[action].from[0]!;
      expect(ruleError(() => planTransition({ status: from, assigneeId: "lena" }, action, lena)).code).toBe("forbidden");
      expect(ruleError(() => planTransition({ status: from, assigneeId: null }, action, system)).code).toBe("forbidden");
      expect(planTransition({ status: from, assigneeId: null }, action, member).to).toBe(TASK_ACTIONS[action].to);
    }
  });

  it("lets the assignee release and link a PR, nobody else among contributors", () => {
    const held = { status: "assigned" as const, assigneeId: "lena" };
    expect(planTransition(held, "release", lena).to).toBe("open");
    expect(planTransition(held, "link_pr", lena).to).toBe("in_review");
    expect(ruleError(() => planTransition(held, "release", jonas)).code).toBe("forbidden");
    expect(ruleError(() => planTransition(held, "link_pr", jonas)).code).toBe("forbidden");
  });

  it("never lets a contributor merge, even on their own task", () => {
    expect(ruleError(() => planTransition({ status: "in_review", assigneeId: "lena" }, "merge", lena)).code).toBe("forbidden");
  });

  it("refuses an action from the wrong status", () => {
    expect(ruleError(() => planTransition({ status: "open", assigneeId: null }, "merge", system)).code).toBe("invalid_state");
    expect(ruleError(() => planTransition({ status: "suggested", assigneeId: null }, "choose", member)).code).toBe("invalid_state");
    expect(ruleError(() => planTransition({ status: "suggested", assigneeId: null }, "close", member)).code).toBe("invalid_state");
  });
});
