// A task in a list (/tasks, /contribute) and on the board view. Server-safe.

import type { PublicTask } from "@nw/contracts";
import Link from "next/link";

import { AreaChip, KindChip, SizeBadge, StatusLabel } from "./bits";
import { RowVote } from "./votes";
import { boardState, formatDate, personLabel, plural, STATE_COLUMN, type BoardState } from "./labels";

/** id · title · area · skills · posts · updated · size · status. The whole row opens the task. */
export function TaskRow({ task }: { task: PublicTask }) {
  const meta: React.ReactNode[] = [];
  if (task.suggestedBy) meta.push(<span key="by">Suggested by {personLabel(task.suggestedBy)}</span>);
  for (const skill of task.skills) meta.push(<span key={`s-${skill}`}>{skill}</span>);
  meta.push(<span key="posts">{plural(task.postCount, "post")}</span>);
  meta.push(<span key="updated">updated {formatDate(task.updatedAt)}</span>);

  return (
    <li className="relative grid gap-x-[18px] gap-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0 hover:bg-subtle sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center sm:px-5 sm:py-4">
      <span className="font-mono text-[13px] text-muted">{task.id}</span>
      <div className="min-w-0">
        <Link href={`/tasks/${task.id}`} className="text-base font-medium tracking-tight after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-accent">
          {task.title}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted">
          <AreaChip area={task.area} />
          {meta.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-2.5">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              {m}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 sm:grid sm:justify-items-end sm:gap-1.5">
        {task.size ? (
          <SizeBadge size={task.size} />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <RowVote task={task} />
            <KindChip kind={task.kind} />
          </span>
        )}
        <StatusLabel task={task} />
      </div>
    </li>
  );
}

export function TaskList({ tasks }: { tasks: PublicTask[] }) {
  return (
    <ul className="border border-line bg-paper">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </ul>
  );
}

const COLUMNS = Object.entries(STATE_COLUMN) as [Exclude<BoardState, "closed">, string][];
const COLUMN_RULE: Record<Exclude<BoardState, "closed">, string> = {
  suggested: "border-st-suggested",
  open: "border-st-open",
  proposed: "border-st-proposed",
  assigned: "border-st-progress",
  in_review: "border-st-review",
  done: "border-st-done",
};

/** Six columns; scrolls sideways on a phone. */
export function TaskColumns({ tasks }: { tasks: PublicTask[] }) {
  return (
    <div className="grid snap-x snap-mandatory auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2" tabIndex={0} aria-label="Tasks by status">
      {COLUMNS.map(([state, name]) => {
        const items = tasks.filter((t) => boardState(t) === state);
        return (
          <section key={state} aria-label={name} className="grid snap-start content-start gap-2">
            <h3 className={`flex justify-between border-b-2 px-0.5 py-1.5 text-[13px] font-medium ${COLUMN_RULE[state]}`}>
              <span>{name}</span>
              <span className="font-mono text-muted">{items.length}</span>
            </h3>
            {items.length === 0 ? <p className="px-0.5 py-2 text-[13px] text-muted">Nothing here.</p> : null}
            {items.map((t) => (
              <Link key={t.id} href={`/tasks/${t.id}`} className="grid gap-2 border border-line bg-paper p-3 text-left hover:border-ink">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] text-muted">{t.id}</span>
                  {t.size ? <SizeBadge size={t.size} /> : <KindChip kind={t.kind} />}
                </span>
                <span className="font-medium">{t.title}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-muted">
                  <AreaChip area={t.area} />
                  {t.assignee ? personLabel(t.assignee) : t.proposalCount ? plural(t.proposalCount, "proposal") : null}
                </span>
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
