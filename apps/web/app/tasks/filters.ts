// The board's filters live in the URL (/tasks?area=web,api&status=open&view=board), so a filtered
// board can be shared and Back works. Pure: used by the page and its tests.

import {
  TASK_AREAS,
  TASK_SIZES,
  TASK_SORTS,
  TASK_STATUS_FILTERS,
  type TaskArea,
  type TaskSize,
  type TaskSort,
  type TaskStatusFilter,
} from "@nw/contracts";

export type BoardView = "list" | "board";

export type Filters = {
  q: string;
  area: TaskArea[];
  size: TaskSize[];
  status: TaskStatusFilter;
  skills: string;
  sort: TaskSort;
  view: BoardView;
  /** "My tasks" (/tasks?mine=1). */
  mine: boolean;
};

export const DEFAULT_FILTERS: Filters = { q: "", area: [], size: [], status: "active", skills: "", sort: "updated", view: "list", mine: false };

const listOf = <T extends string>(value: string | null, options: readonly T[]): T[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (options as readonly string[]).includes(s))
    .filter((s, i, all) => all.indexOf(s) === i);

const oneOf = <T extends string>(value: string | null, options: readonly T[], fallback: T): T =>
  (options as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

export function filtersFrom(params: URLSearchParams): Filters {
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    area: listOf(params.get("area"), TASK_AREAS),
    size: listOf(params.get("size"), TASK_SIZES),
    status: oneOf(params.get("status"), TASK_STATUS_FILTERS, "active"),
    skills: (params.get("skills") ?? "").trim().toLowerCase().slice(0, 40),
    sort: oneOf(params.get("sort"), TASK_SORTS, "updated"),
    view: params.get("view") === "board" ? "board" : "list",
    mine: params.has("mine"),
  };
}

/** The page URL's query (without "?"), leaving defaults out. */
export function filtersToSearch(f: Filters): string {
  const p = new URLSearchParams();
  if (f.mine) p.set("mine", "1");
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.area.length) p.set("area", f.area.join(","));
  if (f.size.length) p.set("size", f.size.join(","));
  if (f.status !== "active") p.set("status", f.status);
  if (f.skills) p.set("skills", f.skills);
  if (f.sort !== "updated") p.set("sort", f.sort);
  if (f.view !== "list") p.set("view", f.view);
  return p.toString().replace(/%2C/g, ",");
}

/** GET /public/tasks's query for these filters (the view and "mine" aren't the API's business). */
export function filtersToApiQuery(f: Filters, cursor?: string | null): string {
  const p = new URLSearchParams();
  if (f.area.length) p.set("area", f.area.join(","));
  if (f.size.length) p.set("size", f.size.join(","));
  if (f.status !== "active") p.set("status", f.status);
  if (f.skills) p.set("skills", f.skills);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.sort !== "updated") p.set("sort", f.sort);
  if (cursor) p.set("cursor", cursor);
  return p.toString().replace(/%2C/g, ",");
}

/** How many filters differ from the default ("Clear 2 filters"). The view doesn't count. */
export function activeFilterCount(f: Filters): number {
  return f.area.length + f.size.length + (f.skills ? 1 : 0) + (f.status !== "active" ? 1 : 0) + (f.q.trim() ? 1 : 0) + (f.sort !== "updated" ? 1 : 0);
}
