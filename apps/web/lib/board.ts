// The task board's public reads, on the server. Cached with "use cache" and tagged `tasks`, so the
// pages prerender with real data and refresh within a minute (or on revalidateTag("tasks")).
// Who is signed in is never known here: the contributor cookie lives on the API's domain, so the
// browser asks for it (lib/session.tsx) and the pages layer the viewer's view on top.

import { cacheLife, cacheTag } from "next/cache";
import type {
  PublicBlock,
  PublicContributorPage,
  PublicContributorProfile,
  PublicTaskDetail,
  PublicTaskPage,
} from "@nw/contracts";

import type { PublicInitiator } from "@/components/board/wall";
import type { Block } from "@/components/builders/types";

/** Cache tags. The API marks them stale (POST /api/revalidate) after a merge or a profile change. */
export const TASKS_TAG = "tasks";
export const CONTRIBUTORS_TAG = "contributors";

type Read<T> = { ok: true; data: T } | { ok: false; notFound: boolean };

async function read<T>(path: string): Promise<Read<T>> {
  const apiUrl = process.env.API_URL?.trim();
  if (!apiUrl) return { ok: false, notFound: false };
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) throw new Error(`GET ${path} answered ${res.status}`);
    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    console.warn("[web] task board read failed:", error instanceof Error ? error.message : error);
    return { ok: false, notFound: false };
  }
}

/**
 * Refreshed every minute; a failed read is tried again after 30 seconds. Both stay long enough
 * (stale ≥ 30 s, expire ≥ 5 min) to be part of the prerendered page, not a dynamic hole.
 */
function lifetime(ok: boolean) {
  if (ok) cacheLife("minutes");
  else cacheLife({ stale: 30, revalidate: 30, expire: 300 });
}

/** One page of GET /public/tasks; `query` is a query string without "?". null: the API can't answer. */
export async function getTaskPage(query = ""): Promise<PublicTaskPage | null> {
  "use cache";
  cacheTag(TASKS_TAG);
  const res = await read<PublicTaskPage>(`/public/tasks${query ? `?${query}` : ""}`);
  lifetime(res.ok);
  return res.ok ? res.data : null;
}

/** A task, "missing" for an unknown id, or null when the API can't answer. */
export async function getTask(id: string): Promise<PublicTaskDetail | "missing" | null> {
  "use cache";
  cacheTag(TASKS_TAG);
  const res = await read<PublicTaskDetail>(`/public/tasks/${encodeURIComponent(id)}`);
  lifetime(res.ok || res.notFound);
  return res.ok ? res.data : res.notFound ? "missing" : null;
}

export type BoardCounts = { open: number; inProgress: number; done: number };

/** Counts for the board's header ("4 open · 2 in progress · 9 done"), up to 100 each. */
export async function getBoardCounts(): Promise<BoardCounts | null> {
  "use cache";
  cacheTag(TASKS_TAG);
  const pages = await Promise.all(
    ["open", "in_progress", "in_review", "done"].map((status) => read<PublicTaskPage>(`/public/tasks?status=${status}&limit=100`)),
  );
  const ok = pages.every((p) => p.ok);
  lifetime(ok);
  if (!ok) return null;
  const [open, assigned, review, done] = pages.map((p) => (p.ok ? p.data.tasks.length : 0));
  return { open, inProgress: assigned + review, done };
}

export async function getContributorPage(query = ""): Promise<PublicContributorPage | null> {
  "use cache";
  cacheTag(TASKS_TAG, CONTRIBUTORS_TAG);
  const res = await read<PublicContributorPage>(`/public/contributors${query ? `?${query}` : ""}`);
  lifetime(res.ok);
  return res.ok ? res.data : null;
}

/** A public profile, "missing" (private, unknown or suspended), or null when the API can't answer. */
export async function getProfile(handle: string): Promise<PublicContributorProfile | "missing" | null> {
  "use cache";
  cacheTag(TASKS_TAG, CONTRIBUTORS_TAG);
  const res = await read<PublicContributorProfile>(`/public/contributors/${encodeURIComponent(handle)}`);
  lifetime(res.ok || res.notFound);
  return res.ok ? res.data : res.notFound ? "missing" : null;
}

/** Every merged task, for the builders scene (GET /public/blocks), oldest first. */
export async function getBlocks(): Promise<Block[]> {
  "use cache";
  cacheTag(TASKS_TAG, CONTRIBUTORS_TAG);
  const res = await read<PublicBlock[]>("/public/blocks");
  lifetime(res.ok || res.notFound);
  if (!res.ok || !Array.isArray(res.data)) return [];
  // A merged task always has an area and a size; skip a row that somehow doesn't.
  return res.data.flatMap((b) => (b.area && b.size ? [{ ...b, area: b.area, size: b.size }] : []));
}

/** Initiators who opted in, one row per public project (GET /public/initiators); [] until the API has it. */
export async function getInitiators(): Promise<PublicInitiator[]> {
  "use cache";
  cacheTag(TASKS_TAG, CONTRIBUTORS_TAG);
  const res = await read<PublicInitiator[]>("/public/initiators");
  lifetime(res.ok || res.notFound);
  return res.ok && Array.isArray(res.data) ? res.data : [];
}
