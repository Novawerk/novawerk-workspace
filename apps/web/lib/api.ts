import type { ApiError, FormKind } from "@nw/contracts";

import { track } from "./analytics";

export type PostResult =
  | { ok: true }
  /** The API rejected the input; `issues` maps field → messages. */
  | { ok: false; reason: "invalid"; issues: Record<string, string[]> }
  /** API not configured, unreachable, timed out, or answered with an error. */
  | { ok: false; reason: "unavailable" };

/**
 * POST a form to the public API from the browser.
 * Never throws: every failure comes back as a result the form can show.
 */
export async function postToApi(path: `/public/${string}`, body: unknown): Promise<PostResult> {
  // Must be referenced literally so Next inlines it into the client bundle.
  const base = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!base) return { ok: false, reason: "unavailable" };

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (res.ok) return { ok: true };

  const error = (await res.json().catch(() => null)) as Partial<ApiError> | null;
  if (error?.issues && typeof error.issues === "object" && Object.keys(error.issues).length > 0) {
    return { ok: false, reason: "invalid", issues: error.issues };
  }
  return { ok: false, reason: "unavailable" };
}

const FORM_PATHS = {
  pitch: "/public/submissions",
  join: "/public/applications",
  newsletter: "/public/subscribe",
} as const satisfies Record<FormKind, `/public/${string}`>;

/** POST one of the public forms, and count how it went (lib/analytics.ts). */
export async function sendForm(form: FormKind, body: unknown): Promise<PostResult> {
  const result = await postToApi(FORM_PATHS[form], body);
  if (result.ok) track("form_submitted", { form });
  else track("form_failed", { form, reason: result.reason });
  return result;
}
