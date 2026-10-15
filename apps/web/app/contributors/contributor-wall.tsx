"use client";

import { TASK_AREAS, type ContributorSort, type PublicContributorPage, type TaskArea } from "@nw/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AreaChip, Avatar, EmptyState } from "@/components/board/bits";
import { formatDate } from "@/components/board/labels";
import { isInitiator, type WallPerson } from "@/components/board/wall";
import { buttonOutline, container, textLink } from "@/components/ui";
import { api } from "@/lib/contrib-api";

type Loaded = { key: string; ok: boolean; people: WallPerson[]; cursor: string | null };
type Filter = TaskArea | "initiators" | null;

/**
 * The wall: newest faces first or A–Z, never by Werk; an area filter, or Initiators (people who
 * started a project, shown only when the API sends some); "Load more".
 */
export function ContributorWall({ initial }: { initial: PublicContributorPage | null }) {
  const [filter, setFilter] = useState<Filter>(null);
  const area = filter === "initiators" ? null : filter;
  const [sort, setSort] = useState<ContributorSort>("newest");
  const [view, setView] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const key = `sort=${sort}${area ? `&area=${area}` : ""}`;
  const isDefault = key === "sort=newest";

  useEffect(() => {
    // The default view comes from the server; if that read failed, the browser tries once more.
    if (isDefault && initial !== null) return;
    let cancelled = false;
    void api<PublicContributorPage>(`/public/contributors?${key}`).then((res) => {
      if (!cancelled) setView({ key, ok: res.ok, people: res.ok ? res.data.contributors : [], cursor: res.ok ? res.data.nextCursor : null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, isDefault, initial]);

  const current: Loaded | null =
    view?.key === key
      ? view
      : isDefault && initial !== null
        ? { key, ok: true, people: initial?.contributors ?? [], cursor: initial?.nextCursor ?? null }
        : null;
  const loadedPeople = current?.people ?? [];
  const people = filter === "initiators" ? loadedPeople.filter(isInitiator) : loadedPeople;
  const hasInitiators = (initial?.contributors ?? []).some(isInitiator) || loadedPeople.some(isInitiator);

  const loadMore = async () => {
    if (!current?.cursor) return;
    setLoading(true);
    const res = await api<PublicContributorPage>(`/public/contributors?${key}&cursor=${encodeURIComponent(current.cursor)}`);
    setLoading(false);
    if (res.ok) setView({ ...current, people: [...current.people, ...res.data.contributors], cursor: res.data.nextCursor });
  };

  const chip =
    "h-[30px] shrink-0 border border-line-strong bg-paper px-[11px] text-[13px] whitespace-nowrap aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper";

  return (
    <section aria-label="Everyone" className={`${container} pb-16`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <div className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] max-sm:flex-nowrap sm:flex-wrap" role="group" aria-label="Area">
          <button type="button" className={chip} aria-pressed={filter === null} onClick={() => setFilter(null)}>
            All areas
          </button>
          {TASK_AREAS.map((a) => (
            <button key={a} type="button" className={chip} aria-pressed={filter === a} onClick={() => setFilter(a)}>
              {a}
            </button>
          ))}
          {hasInitiators || filter === "initiators" ? (
            <button type="button" className={chip} aria-pressed={filter === "initiators"} onClick={() => setFilter("initiators")}>
              Initiators
            </button>
          ) : null}
        </div>
        <div className="inline-flex border border-line-strong" role="group" aria-label="Order">
          {(
            [
              ["newest", "Newest"],
              ["az", "A–Z"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)} className="h-8 px-3 text-sm text-muted aria-pressed:bg-ink aria-pressed:text-paper">
              {label}
            </button>
          ))}
        </div>
      </div>

      {current === null ? (
        <p className="py-8 text-sm text-muted">Loading…</p>
      ) : !current.ok ? (
        <EmptyState title="The wall is offline right now">We couldn&apos;t load it. Please try again in a few minutes.</EmptyState>
      ) : people.length === 0 ? (
        <EmptyState title={filter === "initiators" ? "No initiators here yet" : area ? `Nobody here for ${area} yet` : "Nobody here yet"}>
          Be the first:{" "}
          <Link className={textLink} href={area ? `/tasks?area=${area}&status=open` : "/tasks?status=open"}>
            find {area ? `a ${area}` : "an open"} task
          </Link>
          .
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
          {people.map((c) => (
            <li key={c.handle}>
              <WallCard c={c} />
            </li>
          ))}
        </ul>
      )}

      {current?.cursor && people.length > 0 ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={loadMore} disabled={loading} className={buttonOutline}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      <p className="mt-4 text-[13px] text-muted">
        No ranks and no points here; Werk lives on each profile. Only public profiles appear, and anyone can leave the wall in Settings.
      </p>
    </section>
  );
}

function WallCard({ c }: { c: WallPerson }) {
  const ideaOnly = c.idea && c.areas.length === 0;
  const initiator = isInitiator(c);
  return (
    <div className="relative grid h-full grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-1 border border-line bg-paper p-4 hover:border-ink">
      <Avatar name={c.name || c.handle} url={c.avatarUrl} size="md" className="row-span-3" />
      <span className="flex items-center gap-1.5">
        <Link href={`/u/${c.handle}`} className="font-medium after:absolute after:inset-0">
          @{c.handle}
        </Link>
        {initiator ? <span className="bg-accent px-1 font-mono text-[11px] text-white">Initiator</span> : null}
        {c.idea ? (
          <span className="border border-dashed border-accent px-1 font-mono text-[11px] text-accent" title="Had an idea accepted">
            idea
          </span>
        ) : null}
      </span>
      <span className="truncate text-[13px] text-muted">{c.bio || c.name}</span>
      {initiator ? (
        <span className="relative z-10 text-[13px]">
          <span className="text-muted">Started</span>{" "}
          {c.project ? (
            <Link className={textLink} href="/#projects">
              {c.project.title}
            </Link>
          ) : (
            "a project"
          )}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-1 text-[13px]">
          {c.areas.map((a) => (
            <AreaChip key={a} area={a} />
          ))}
          <span className="ml-1 text-muted">
            {ideaOnly ? "idea accepted" : "last merge"} {formatDate(c.lastContributionAt)}
          </span>
        </span>
      )}
    </div>
  );
}
