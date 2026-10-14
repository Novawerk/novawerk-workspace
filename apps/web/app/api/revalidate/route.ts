import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { PROJECTS_TAG } from "@/lib/projects";

/**
 * POST /api/revalidate — called by the API after a portfolio change.
 * Requires `x-revalidate-secret: $REVALIDATE_SECRET`. Marks the `projects` cache stale;
 * the next visit serves the old page once while the fresh one renders.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get("x-revalidate-secret");

  if (!secret || !given || !sameSecret(given, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(PROJECTS_TAG, "max");
  return Response.json({ revalidated: true, tag: PROJECTS_TAG });
}

/** Constant-time comparison (hashing first so lengths always match). */
function sameSecret(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
