// What a rule says when it says no. The API turns `code` into an HTTP status (httpStatusOf).

export type TaskRuleCode =
  | "not_found"
  | "forbidden"
  | "github_required"
  | "suspended"
  | "invalid_state"
  | "conflict"
  | "rate_limited"
  | "invalid";

const STATUS: Record<TaskRuleCode, 400 | 403 | 404 | 409 | 429> = {
  not_found: 404,
  forbidden: 403,
  github_required: 403,
  suspended: 403,
  invalid_state: 409,
  conflict: 409,
  rate_limited: 429,
  invalid: 400,
};

export class TaskRuleError extends Error {
  constructor(
    readonly code: TaskRuleCode,
    message: string,
    /** The input field the message belongs to, for `{ issues: { field: [message] } }`. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "TaskRuleError";
  }

  get httpStatus() {
    return STATUS[this.code];
  }
}

export const httpStatusOf = (code: TaskRuleCode) => STATUS[code];

/** Postgres unique_violation, from node-postgres or PGlite (Drizzle wraps it in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
