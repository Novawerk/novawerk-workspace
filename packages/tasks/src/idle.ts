// When an idle task goes back on the board. Used by the nightly check (github.ts) and, under the
// row lock, by the release itself (transitions.ts).

import { TASK_LIMITS } from "@nw/contracts";
import type { Task } from "@nw/db";

const DAY_MS = 24 * 3_600_000;

/** When the quiet stretch began: the last activity, else the assignment. */
export const idleSince = (task: Pick<Task, "lastActivityAt" | "assignedAt" | "updatedAt">) =>
  task.lastActivityAt ?? task.assignedAt ?? task.updatedAt;

/** When an idle task goes back on the board: 14 days after the last activity, 21 with an extension. */
export function idleReleaseAt(task: Pick<Task, "lastActivityAt" | "assignedAt" | "updatedAt" | "extendedAt">): Date {
  const days = TASK_LIMITS.idleReleaseDays + (task.extendedAt ? TASK_LIMITS.extensionDays : 0);
  return new Date(idleSince(task).getTime() + days * DAY_MS);
}
