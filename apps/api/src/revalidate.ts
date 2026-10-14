// Tell apps/web that the portfolio changed (POST /api/revalidate there marks the `projects`
// cache stale). Best effort: the edit is already saved, so a failure is logged and reported to
// the admin panel, never thrown. Without the hook the website catches up when its cache expires.

import type { ApiConfig, Logger } from "./types.js";

/** What happened to the website after an edit. The admin panel shows it next to "Saved". */
export type WebsiteRefresh = "updated" | "not-configured" | "failed";

const TIMEOUT_MS = 5_000;

export async function revalidateWeb(
  hook: ApiConfig["webRevalidate"],
  logger: Logger,
): Promise<WebsiteRefresh> {
  if (!hook) return "not-configured";
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: { "x-revalidate-secret": hook.secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return "updated";
    logger.warn(`[api] web revalidate answered ${res.status}`);
  } catch (err) {
    logger.warn("[api] web revalidate failed:", err instanceof Error ? err.message : err);
  }
  return "failed";
}
