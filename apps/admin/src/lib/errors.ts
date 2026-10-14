import { ApiError } from "./api"

/** Field → messages from a 400/409 answer, so a form can show each one under its field. */
export function issuesOf(error: unknown): Record<string, string[]> {
  return error instanceof ApiError && error.issues ? error.issues : {}
}

/** The first message for one field, if any. */
export function issueFor(error: unknown, field: string): string | undefined {
  return issuesOf(error)[field]?.[0]
}

/** One line for a toast: the API's message, or the network error. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "Something went wrong. Try again."
}

/** Zod-style issues (from a `safeParse` in the browser) → field → messages, like the API's. */
export function issuesFromParse(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  const issues: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form")
    ;(issues[key] ??= []).push(issue.message)
  }
  return issues
}
