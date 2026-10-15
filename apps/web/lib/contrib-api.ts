// The browser's side of the task board API. /auth/contributor and /contrib carry the contributor
// cookie (httpOnly, on the API's domain), so they go with credentials; /public goes without.
// Never throws: every failure comes back as a result the page can show.

import type { ApiError } from "@nw/contracts";

export type ApiResult<T> =
  | { ok: true; data: T }
  /**
   * `status` 0: the API isn't configured or can't be reached. `issues` maps a field to messages
   * when the API rejected the input; `error` is its message, written for people.
   */
  | { ok: false; status: number; error: string; issues: Record<string, string[]> };

export function apiBase(): string | null {
  // Must be referenced literally so Next inlines it into the client bundle.
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  return base ? base.replace(/\/+$/, "") : null;
}

const UNREACHABLE = "We couldn't reach the task board. Check your connection and try again.";

/** Fired on window when a /contrib call answers 401: the session provider resets to signed out. */
export const SIGNED_OUT_EVENT = "nw:contributor-signed-out";

export async function api<T>(
  path: `/${"public" | "contrib" | "auth/contributor"}${string}`,
  { method = "GET", body }: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) return { ok: false, status: 0, error: UNREACHABLE, issues: {} };
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      credentials: path.startsWith("/public") ? "omit" : "include",
      headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, status: 0, error: UNREACHABLE, issues: {} };
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return { ok: true, data: json as T };
  if (res.status === 401 && path.startsWith("/contrib") && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }
  const err = (json ?? {}) as Partial<ApiError> & { error?: string };
  const issues = err.issues && typeof err.issues === "object" ? (err.issues as Record<string, string[]>) : {};
  const error =
    typeof err.error === "string" && err.error
      ? err.error
      : res.status === 401
        ? "Please sign in again."
        : res.status === 429
          ? "Too many tries. Please wait a little and try again."
          : "Something went wrong on our side. Please try again.";
  return { ok: false, status: res.status, error, issues };
}

/** The first message for a field, or the general error. */
export function fieldError(result: ApiResult<unknown>, field: string): string | undefined {
  return result.ok ? undefined : result.issues[field]?.[0];
}

/** A path on this site, the same rule as the API's `githubStartQuery`: no "//host", no backslash, no whitespace. */
const SAFE_PATH = /^\/(?![/\\])[^\s]*$/;

/**
 * Where to send someone after signing in: `value` if it is a path on this site, else `fallback`.
 * Rejects "//example.com", "/\\example.com" and encoded tricks like "/%09/example.com" (decoded
 * by the time it gets here), and anything that resolves to another origin.
 */
export function safeReturnPath(value: string | null | undefined, fallback = "/tasks"): string {
  if (!value || !SAFE_PATH.test(value)) return fallback;
  if (typeof window !== "undefined") {
    try {
      if (new URL(value, window.location.origin).origin !== window.location.origin) return fallback;
    } catch {
      return fallback;
    }
  }
  return value;
}

/** Where "Continue with GitHub" goes. The API sends the visitor back to `returnTo` afterwards. */
export function githubStartUrl(returnTo: string): string | null {
  const base = apiBase();
  if (!base) return null;
  return `${base}/auth/contributor/github/start?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
