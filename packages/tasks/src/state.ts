// The task state machine (docs/contributor-board-design.md, "Task lifecycle"). Pure: which
// action may move a task from which status, and who may do it. transitionTask() (./transitions.ts)
// applies it to the database and writes the event.
//
//   draft ──publish──▶ open ──choose──▶ assigned ──link_pr──▶ in_review ──merge──▶ done
//   suggested ──accept──▶ open          ▲   │ release            │ pr_closed
//   suggested ──accept_assign──▶ assigned   └──────▶ open         └──▶ assigned
//   suggested ──decline / mark_duplicate──▶ declined / duplicate
//   open, assigned, in_review ──close──▶ closed ──reopen──▶ open
//
// "Has proposals" is not a state, and neither is "released": an event that puts the task back
// to open.

import type { TaskEventKind, TaskStatus } from "@nw/contracts";

import { TaskRuleError } from "./errors.js";

/** Who acts: a member (admin panel), a contributor (the site, a token), or the system (GitHub, cron). */
export type Actor = { kind: "member"; id: string } | { kind: "contributor"; id: string } | { kind: "system" };

export type TaskAction =
  | "publish"
  | "request_info"
  | "accept"
  | "accept_assign"
  | "decline"
  | "mark_duplicate"
  | "choose"
  | "release"
  | "link_pr"
  | "pr_closed"
  | "merge"
  | "close"
  | "reopen";

type Rule = {
  from: readonly TaskStatus[];
  to: TaskStatus;
  event: TaskEventKind;
  /** Who may do it. `assignee`: a contributor, only on the task they hold. */
  by: readonly ("member" | "assignee" | "system")[];
};

export const TASK_ACTIONS: Record<TaskAction, Rule> = {
  publish: { from: ["draft"], to: "open", event: "published", by: ["member"] },
  request_info: { from: ["suggested"], to: "suggested", event: "info_requested", by: ["member"] },
  accept: { from: ["suggested"], to: "open", event: "accepted", by: ["member"] },
  accept_assign: { from: ["suggested"], to: "assigned", event: "accepted", by: ["member"] },
  decline: { from: ["suggested"], to: "declined", event: "declined", by: ["member"] },
  mark_duplicate: { from: ["suggested"], to: "duplicate", event: "duplicate", by: ["member"] },
  // The system chooses on an S task: the first plan from someone who can take it (NB-ADR-0013).
  choose: { from: ["open"], to: "assigned", event: "assigned", by: ["member", "system"] },
  release: { from: ["assigned"], to: "open", event: "released", by: ["member", "assignee", "system"] },
  link_pr: { from: ["assigned"], to: "in_review", event: "pr_linked", by: ["member", "assignee", "system"] },
  pr_closed: { from: ["in_review"], to: "assigned", event: "pr_closed", by: ["member", "system"] },
  // A merge the webhook sees before any "opened" counts too.
  merge: { from: ["assigned", "in_review"], to: "done", event: "merged", by: ["member", "system"] },
  close: { from: ["open", "assigned", "in_review"], to: "closed", event: "closed", by: ["member"] },
  reopen: { from: ["closed"], to: "open", event: "reopened", by: ["member"] },
};

/** Statuses a task never leaves. A closed task can only be reopened by a member. */
export const FINAL_STATUSES: readonly TaskStatus[] = ["done", "closed", "declined", "duplicate"];

/** Tasks someone holds: "one task in progress at a time". */
export const IN_PROGRESS_STATUSES = ["assigned", "in_review"] as const satisfies readonly TaskStatus[];

/** Every status `from` can reach in one step. */
export function nextStatuses(from: TaskStatus): TaskStatus[] {
  return [...new Set(Object.values(TASK_ACTIONS).filter((r) => r.from.includes(from)).map((r) => r.to))];
}

/**
 * Where `action` takes a task in `status`, and its event kind; throws a TaskRuleError when the
 * task is in the wrong state or the actor may not do it.
 */
export function planTransition(
  task: { status: TaskStatus; assigneeId: string | null },
  action: TaskAction,
  actor: Actor,
): { to: TaskStatus; event: TaskEventKind } {
  const rule = TASK_ACTIONS[action];
  const allowed =
    (actor.kind === "member" && rule.by.includes("member")) ||
    (actor.kind === "system" && rule.by.includes("system")) ||
    (actor.kind === "contributor" && rule.by.includes("assignee") && task.assigneeId === actor.id);
  if (!allowed) {
    throw new TaskRuleError("forbidden", actor.kind === "contributor" ? "Only the person on this task can do that" : "Not allowed");
  }
  if (!rule.from.includes(task.status)) {
    throw new TaskRuleError("invalid_state", `A task that is ${task.status.replace("_", " ")} can't be changed that way`);
  }
  return { to: rule.to, event: rule.event };
}
