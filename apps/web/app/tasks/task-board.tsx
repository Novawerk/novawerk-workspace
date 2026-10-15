"use client";

import {
  TASK_AREAS,
  TASK_SIZE_WERK,
  TASK_SIZES,
  type MyProposal,
  type MyTasks as MyTasksData,
  type PublicTask,
  type PublicTaskPage,
  type TaskStatusFilter,
} from "@nw/contracts";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { EmptyState, Note, StatusDot } from "@/components/board/bits";
import { ETA_LABELS, formatDate } from "@/components/board/labels";
import { SignInPanel } from "@/components/board/sign-in";
import { TaskColumns, TaskList } from "@/components/board/task-row";
import { buttonAccent, buttonOutline, container, eyebrow, field, textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { useSession } from "@/lib/session";
import type { BoardCounts } from "@/lib/board";

import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filtersFrom,
  filtersToApiQuery,
  filtersToSearch,
  type Filters,
} from "./filters";

/** The board's 34 px controls: the field style without its vertical padding, so the text isn't clipped. */
const compactField = `${field.replace("py-2", "")} h-[34px] py-0`;

const STATUS_CHIPS: [TaskStatusFilter, string][] = [
  ["active", "Active"],
  ["suggested", "Suggested"],
  ["open", "Open"],
  ["proposals", "Has proposals"],
  ["in_progress", "In progress"],
  ["in_review", "In review"],
  ["done", "Done"],
  ["closed", "Closed"],
  ["all", "All"],
];

type FilterName = "search" | "area" | "size" | "status" | "skills" | "sort" | "view";

type Props = {
  /** The default board (active, recently updated), prerendered and cached. */
  initial: PublicTaskPage | null;
  counts: BoardCounts | null;
};

/** The board with the URL's filters. Needs useSearchParams, so the page wraps it in Suspense. */
export function TaskBoard(props: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFrom(new URLSearchParams(params.toString())), [params]);

  const setFilters = (next: Filters, changed: FilterName | null) => {
    if (changed) track("task_filter", { filter: changed });
    const search = filtersToSearch(next);
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  if (filters.mine) return <MyTasks />;
  return <BoardShell {...props} filters={filters} setFilters={setFilters} />;
}

/** What renders before the URL is read (the prerendered page): the default board, no controls yet. */
export function TaskBoardFallback(props: Props) {
  return <BoardShell {...props} filters={DEFAULT_FILTERS} setFilters={null} />;
}

function BoardShell({
  initial,
  counts,
  filters,
  setFilters,
}: Props & { filters: Filters; setFilters: ((f: Filters, changed: FilterName | null) => void) | null }) {
  const apiQuery = filtersToApiQuery(filters);
  const isDefault = apiQuery === "";
  const [loaded, setLoaded] = useState<{ query: string; page: PublicTaskPage | null; extra: PublicTask[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(filters.q);
  const searchId = useId();
  const skillsId = useId();
  const sortId = useId();

  // Typing in the search box updates the URL after a short pause.
  useEffect(() => {
    if (!setFilters || query === filters.q) return;
    const t = setTimeout(() => setFilters({ ...filters, q: query }, "search"), 350);
    return () => clearTimeout(t);
  }, [query, filters, setFilters]);

  // Non-default filters: ask the API from the browser.
  useEffect(() => {
    if (isDefault) return;
    let cancelled = false;
    void api<PublicTaskPage>(`/public/tasks?${apiQuery}`).then((res) => {
      if (cancelled) return;
      setLoaded({ query: apiQuery, page: res.ok ? res.data : null, extra: [], cursor: res.ok ? res.data.nextCursor : null });
    });
    return () => {
      cancelled = true;
    };
  }, [apiQuery, isDefault]);

  const fromServer = useMemo(() => ({ query: "", page: initial, extra: [] as PublicTask[], cursor: initial?.nextCursor ?? null }), [initial]);
  const current = isDefault
    ? loaded?.query === "" ? loaded : fromServer
    : loaded?.query === apiQuery
      ? loaded
      : null;
  const tasks = useMemo(() => (current?.page ? [...current.page.tasks, ...current.extra] : []), [current]);
  const offline = current !== null && current.page === null;

  const loadMore = async () => {
    if (!current?.cursor) return;
    setLoading(true);
    const res = await api<PublicTaskPage>(`/public/tasks?${filtersToApiQuery(filters, current.cursor)}`);
    setLoading(false);
    if (!res.ok) return;
    setLoaded({ ...current, extra: [...current.extra, ...res.data.tasks], cursor: res.data.nextCursor });
  };

  const skills = useMemo(
    () => [...new Set([...(initial?.tasks ?? []), ...tasks].flatMap((t) => t.skills.map((s) => s.toLowerCase())))].sort(),
    [initial, tasks],
  );
  const n = activeFilterCount(filters);
  const update = setFilters ?? (() => {});
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chip =
    "h-[30px] shrink-0 border border-line-strong bg-paper px-[11px] text-[13px] whitespace-nowrap aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-60";
  const label = "w-14 shrink-0 font-mono text-xs text-muted max-sm:w-full";

  return (
    <div className={container}>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-10 pb-5">
        <div className="grid gap-2">
          <p className={eyebrow}>Open to everyone</p>
          <h1 className="text-4xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-muted">
            {counts ? `${counts.open} open · ${counts.inProgress} in progress · ${counts.done} done` : "Small tasks on the software Novawerk runs on."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/tasks/suggest" className={`${buttonOutline} h-10`}>
            Suggest a task
          </Link>
          <div className="inline-flex border border-line-strong" role="group" aria-label="View">
            {(["list", "board"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={filters.view === v}
                disabled={!setFilters}
                onClick={() => update({ ...filters, view: v }, "view")}
                className="h-10 px-3 text-sm text-muted capitalize aria-pressed:bg-ink aria-pressed:text-paper"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div role="search" className="grid gap-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={searchId} className={label}>
            Search
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            disabled={!setFilters}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title or NW-id"
            className={`${compactField} max-w-[360px]`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={label}>Area</span>
          <div className="flex min-w-0 gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto sm:flex-wrap [scrollbar-width:none]">
            {TASK_AREAS.map((a) => (
              <button key={a} type="button" disabled={!setFilters} aria-pressed={filters.area.includes(a)} className={`${chip} font-mono`} onClick={() => update({ ...filters, area: toggle(filters.area, a) }, "area")}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={label}>Size</span>
          <div className="flex flex-wrap gap-1.5">
            {TASK_SIZES.map((s) => (
              <button key={s} type="button" disabled={!setFilters} aria-pressed={filters.size.includes(s)} className={chip} onClick={() => update({ ...filters, size: toggle(filters.size, s) }, "size")}>
                {s} · {TASK_SIZE_WERK[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={label}>Status</span>
          <div className="flex min-w-0 gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto sm:flex-wrap [scrollbar-width:none]">
            {STATUS_CHIPS.map(([k, name]) => (
              <button key={k} type="button" disabled={!setFilters} aria-pressed={filters.status === k} className={chip} onClick={() => update({ ...filters, status: k }, "status")}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={skillsId} className={label}>
            Skills
          </label>
          <select id={skillsId} disabled={!setFilters} value={filters.skills} onChange={(e) => update({ ...filters, skills: e.target.value }, "skills")} className={`${compactField} max-w-[240px]`}>
            <option value="">Any skill</option>
            {skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={sortId} className={label}>
            Sort
          </label>
          <select
            id={sortId}
            disabled={!setFilters}
            value={filters.sort}
            onChange={(e) => update({ ...filters, sort: e.target.value === "votes" ? "votes" : "updated" }, "sort")}
            className={`${compactField} max-w-[240px]`}
          >
            <option value="updated">Recently updated</option>
            <option value="votes">Most wanted (suggestions)</option>
          </select>
          {n > 0 ? (
            <button type="button" className={`${textLink} text-sm`} onClick={() => update({ ...DEFAULT_FILTERS, view: filters.view }, null)}>
              Clear {n} {n === 1 ? "filter" : "filters"}
            </button>
          ) : null}
        </div>
      </div>

      {filters.status === "suggested" || filters.sort === "votes" ? (
        <p className="pt-4 text-[13px] text-muted">Votes help us choose. They don&apos;t decide: a member still triages every suggestion. Votes earn no Werk.</p>
      ) : null}

      <div className="pt-5 pb-12" aria-busy={loading || current === null}>
        {current === null ? (
          <p className="py-8 text-sm text-muted">Loading tasks…</p>
        ) : offline ? (
          <EmptyState title="The task board is offline right now">We couldn&apos;t load the tasks. Please try again in a few minutes.</EmptyState>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="No tasks match these filters"
            actions={
              <>
                <button type="button" className={buttonOutline} onClick={() => update({ ...DEFAULT_FILTERS, view: filters.view }, null)}>
                  Clear filters
                </button>
                <Link href="/tasks/suggest" className={buttonOutline}>
                  Suggest a task
                </Link>
              </>
            }
          >
            Try fewer filters. New tasks land every week. Missing something? Suggest it.
          </EmptyState>
        ) : filters.view === "board" ? (
          <TaskColumns tasks={tasks} />
        ) : (
          <TaskList tasks={tasks} />
        )}
        {current?.cursor && tasks.length > 0 ? (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={loadMore} disabled={loading} className={buttonOutline}>
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── My tasks ────────────────────────────────────────────────────────────────

const PROPOSAL_STATE: Record<MyProposal["status"], string> = { pending: "Pending", chosen: "Chosen", not_chosen: "Not chosen" };

/** Tasks I work on and proposals I sent (/tasks?mine=1). */
function MyTasks() {
  const { session } = useSession();
  const [tasks, setTasks] = useState<PublicTask[] | null>(null);
  const [proposals, setProposals] = useState<MyProposal[] | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = session.status === "signed-in";

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    // My tasks holds what I work on and my pending proposals; all proposals add the decided ones.
    void Promise.all([api<MyTasksData>("/contrib/me/tasks"), api<MyProposal[]>("/contrib/me/proposals")]).then(([t, p]) => {
      if (cancelled) return;
      setTasks(t.ok ? t.data.held : []);
      setProposals(p.ok ? p.data.filter((x) => !x.withdrawn) : t.ok ? t.data.proposals : []);
      setFailed(!t.ok && !p.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const me = session.status === "signed-in" ? session.me : null;

  return (
    <div className={`${container} pb-16`}>
      <div className="grid gap-2 pt-10 pb-6">
        <p className={eyebrow}>{me ? `Signed in as @${me.handle}` : "Contributors"}</p>
        <h1 className="text-4xl font-semibold tracking-tight">My tasks</h1>
        <p className="text-muted">Tasks you work on and proposals you sent.</p>
      </div>
      {session.status === "loading" ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !me ? (
        <div className="max-w-[460px] border border-line bg-paper p-6">
          <SignInPanel returnTo="/tasks?mine=1" heading={false} />
        </div>
      ) : tasks === null || proposals === null ? (
        <p className="text-sm text-muted">Loading your tasks…</p>
      ) : failed ? (
        <EmptyState title="We couldn't load your tasks">Please try again in a few minutes.</EmptyState>
      ) : tasks.length === 0 && proposals.length === 0 ? (
        <EmptyState
          title="You have no tasks yet"
          actions={
            <Link href="/tasks?status=open" className={buttonAccent}>
              Browse open tasks
            </Link>
          }
        >
          Pick an open task and send a proposal. It shows up here while a member reviews it.
        </EmptyState>
      ) : (
        <div className="grid gap-10">
          {tasks.length > 0 ? (
            <section aria-labelledby="mine-tasks" className="grid gap-3">
              <h2 id="mine-tasks" className="text-lg font-semibold">
                Working on
              </h2>
              <TaskList tasks={tasks} />
            </section>
          ) : null}
          <section aria-labelledby="mine-proposals" className="grid gap-3">
            <h2 id="mine-proposals" className="text-lg font-semibold">
              Your proposals
            </h2>
            {proposals.length === 0 ? (
              <p className="text-sm text-muted">No proposals right now.</p>
            ) : (
              <ul className="border border-line bg-paper">
                {proposals.map((p) => (
                  <li key={p.id} className="relative grid gap-1.5 border-t border-line px-5 py-4 first:border-t-0 hover:bg-subtle">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                      <span className="font-mono">{p.taskId}</span>
                      <span className="inline-flex items-center gap-1.5 text-ink">
                        <StatusDot state={p.status === "chosen" ? "assigned" : p.status === "pending" ? "proposed" : "closed"} />
                        {PROPOSAL_STATE[p.status]}
                      </span>
                      <span>{ETA_LABELS[p.eta]}</span>
                      <span>sent {formatDate(p.createdAt)}</span>
                    </span>
                    <Link href={`/tasks/${p.taskId}`} className="font-medium after:absolute after:inset-0">
                      {p.taskTitle}
                    </Link>
                    {p.status === "not_chosen" && p.declineNote ? (
                      <Note className="relative mt-1">
                        <b>Not chosen this time.</b> {p.declineNote} <span className="text-muted">Only you see this note.</span>
                      </Note>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
