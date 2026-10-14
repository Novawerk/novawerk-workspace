import { cacheLife, cacheTag } from "next/cache";
import { PUBLIC_PROJECT_STATUSES, type PublicProject, type PublicProjectStatus } from "@nw/contracts";

import { FALLBACK_PROJECTS } from "./fallback-projects";

/** Cache tag for the portfolio. POST /api/revalidate invalidates it. */
export const PROJECTS_TAG = "projects";

export const STATUS_LABELS: Record<PublicProjectStatus, string> = {
  planning: "Planning",
  building: "Building",
  launching: "Launching",
  launched: "Launched",
};

/**
 * The portfolio, from GET ${API_URL}/public/projects.
 *
 * Cached with `"use cache"` and tagged `projects`, so it lands in the prerendered page and
 * refreshes on `revalidateTag("projects")` (plus an hourly safety net). If the API is not
 * configured or fails, we serve the built-in fallback with a short lifetime so the next
 * attempt comes soon.
 */
export async function getProjects(): Promise<PublicProject[]> {
  "use cache";
  cacheTag(PROJECTS_TAG);

  const apiUrl = process.env.API_URL?.trim();
  if (!apiUrl) {
    cacheLife("hours");
    return FALLBACK_PROJECTS;
  }

  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/public/projects`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`GET /public/projects answered ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error("GET /public/projects did not return an array");

    cacheLife("hours");
    return body.map(toPublicProject).filter((p): p is PublicProject => p !== null);
  } catch (error) {
    console.warn("[web] Falling back to built-in projects:", error instanceof Error ? error.message : error);
    cacheLife("minutes");
    return FALLBACK_PROJECTS;
  }
}

/** Defensive mapping: one bad row should not take the home page down. */
function toPublicProject(raw: unknown): PublicProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.slug !== "string" || typeof r.title !== "string") return null;

  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const status = PUBLIC_PROJECT_STATUSES.includes(r.status as PublicProjectStatus)
    ? (r.status as PublicProjectStatus)
    : "planning";

  return {
    slug: r.slug,
    title: r.title,
    tagline: str(r.tagline),
    description: typeof r.description === "string" ? r.description : "",
    status,
    year: typeof r.year === "number" ? r.year : null,
    link: safeHttpUrl(r.link),
    coverUrl: safeHttpUrl(r.coverUrl),
    featured: r.featured === true,
    team: Array.isArray(r.team) ? (r.team as PublicProject["team"]) : [],
  };
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
