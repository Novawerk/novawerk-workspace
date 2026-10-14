// Response helpers shared by the routers: the ApiError shape and the zod-validator hooks.

import type { ApiError } from "@nw/contracts";
import type { Context } from "hono";
import { z } from "zod";

export const notFound = { error: "Not found" } satisfies ApiError;

/** `409 { error, issues }` for a value that must be unique (a slug, a handle, an email). */
export function conflict(field: string, message: string) {
  return { error: message, issues: { [field]: [message] } } satisfies ApiError;
}

/** Postgres unique_violation, as thrown by node-postgres or PGlite (Drizzle wraps it in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/** `400 { error: "Validation failed", issues: { field: [messages] } }`. Root-level issues go under `_form`. */
export function validationFailed(issues: Record<string, string[]>) {
  return { error: "Validation failed", issues } satisfies ApiError;
}

export function issuesFrom(error: z.core.$ZodError): Record<string, string[]> {
  const { formErrors, fieldErrors } = z.flattenError(error);
  const issues: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
    if (messages?.length) issues[field] = messages;
  }
  if (formErrors.length) issues._form = formErrors;
  return issues;
}

type HookResult = { success: true } | { success: false; error: z.core.$ZodError };

/** zValidator hook: answer invalid input with the ApiError shape. */
export function rejectInvalid(result: HookResult, c: Context) {
  if (!result.success) return c.json(validationFailed(issuesFrom(result.error)), 400);
}

/** zValidator hook for path params: an id that can't exist is simply not found. */
export function notFoundIfInvalid(result: HookResult, c: Context) {
  if (!result.success) return c.json(notFound, 404);
}

/** True when a bot filled the hidden `website` field. */
export function honeypotFilled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = (body as Record<string, unknown>).website;
  return value !== undefined && value !== null && value !== "";
}

/**
 * zValidator hook for the public forms. The honeypot is checked first, on the raw body:
 * a filled `website` gets `200 { ok: true }` and nothing is stored, whether or not the
 * rest validates (the schema also rejects it, so a bot never reaches the handler).
 */
export function rejectInvalidForm(result: HookResult & { data: unknown }, c: Context) {
  if (honeypotFilled(result.data)) return c.json({ ok: true as const }, 200);
  if (!result.success) return c.json(validationFailed(issuesFrom(result.error)), 400);
}
