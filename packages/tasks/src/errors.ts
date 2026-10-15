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
