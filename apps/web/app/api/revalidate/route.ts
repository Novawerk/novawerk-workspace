import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { CONTRIBUTORS_TAG, TASKS_TAG } from "@/lib/board";
import { PROJECTS_TAG } from "@/lib/projects";

/** The cache tags the API may mark stale. Anything else in the body is ignored. */
const ALLOWED_TAGS = new Set([PROJECTS_TAG, TASKS_TAG, CONTRIBUTORS_TAG]);

/**
 * POST /api/revalidate — called by the API after a change the website caches: the portfolio (no
 * body: `projects`, as before) or the task board (`{"tags":["tasks","contributors"]}`).
 * Requires `x-revalidate-secret: $REVALIDATE_SECRET`. Marks those caches stale; the next visit
 * serves the old page once while the fresh one renders.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("x-revalidate-secret");

  if (!secret || !given || !sameSecret(given, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const asked = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [PROJECTS_TAG];
  const tags = [...new Set(asked)].filter((t) => ALLOWED_TAGS.has(t));
  if (tags.length === 0) return Response.json({ error: "No known tags" }, { status: 400 });

  for (const tag of tags) revalidateTag(tag, "max");
  return Response.json({ revalidated: true, tags });
}

/** Constant-time comparison (hashing first so lengths always match). */
function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
