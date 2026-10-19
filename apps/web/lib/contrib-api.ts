// The browser's side of the API for signed-in pages. /auth and /contrib carry the session cookie
// (httpOnly, on the API's domain; one for everyone, NB-ADR-0014), so they go with credentials;
// /public goes without.
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

/** Locally the usual cause is an API that didn't start (apps/api/.env), so say where to look. */
function unreachable(base: string | null): string {
  if (!base) return process.env.NODE_ENV === "development" ? "NEXT_PUBLIC_API_URL isn't set in apps/web/.env.local." : UNREACHABLE;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
    ? `We couldn't reach the API at ${base}. Is it running? Check the pnpm dev output for "@nw/api env:".`
    : UNREACHABLE;
}

/** Fired on window when a /contrib call (or /auth/me) answers 401: the session provider resets to signed out. */
export const SIGNED_OUT_EVENT = "nw:contributor-signed-out";

export async function api<T>(
  path: `/${"public" | "contrib" | "auth"}${string}`,
  { method = "GET", body }: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) return { ok: false, status: 0, error: unreachable(base), issues: {} };
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
    return { ok: false, status: 0, error: unreachable(base), issues: {} };
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (res.ok) return { ok: true, data: json as T };
  if (res.status === 401 && (path.startsWith("/contrib") || path === "/auth/me") && typeof window !== "undefined") {
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

/**
 * Our other apps a sign-in may hand back to (NB-ADR-0014): the admin panel and the team chat.
 * Their origins only; the API checks the same list on the GitHub return.
 */
function appOrigins(): string[] {
  // Each must be referenced literally so Next inlines it into the client bundle.
  const urls = [
    process.env.NEXT_PUBLIC_ADMIN_URL?.trim() || "https://admin.novawerk.io",
    process.env.NEXT_PUBLIC_CHAT_URL?.trim() || "https://chat.novawerk.io",
  ];
  return urls.flatMap((u) => {
    try {
      return [new URL(u).origin];
    } catch {
      return [];
    }
  });
}

/** Where to go after signing in: a path on this site, or an address on one of our apps. */
export function safeReturnTo(value: string | null | undefined, fallback = "/tasks"): string {
  if (value && /^https?:\/\//.test(value)) {
    try {
      const url = new URL(value);
      return appOrigins().includes(url.origin) ? url.toString() : fallback;
    } catch {
      return fallback;
    }
  }
  return safeReturnPath(value, fallback);
}

/** Where "Continue with GitHub" goes. The API sends the visitor back to `returnTo` afterwards. */
export function githubStartUrl(returnTo: string): string | null {
  const base = apiBase();
  if (!base) return null;
  return `${base}/auth/github/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}
