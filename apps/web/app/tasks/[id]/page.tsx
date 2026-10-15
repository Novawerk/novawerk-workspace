import { formatTaskId, parseTaskId } from "@nw/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { BoardOffline } from "@/components/board/bits";
import { container, textLink } from "@/components/ui";
import { getTask } from "@/lib/board";

import { TaskView } from "./task-view";

export async function generateMetadata({ params }: PageProps<"/tasks/[id]">): Promise<Metadata> {
  const n = parseTaskId((await params).id);
  const task = n ? await getTask(formatTaskId(n)) : "missing";
  if (!task || task === "missing") return { title: "Task" };
  return {
    title: `${task.id}: ${task.title}`,
    description: task.summary,
    alternates: { canonical: `/tasks/${task.id}` },
  };
}

/** One task: what and why, done when, proposals, the thread and the timeline. */
export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<TaskSkeleton />}>
      {params.then(({ id }) => (
        <TaskLoader id={id} />
      ))}
    </Suspense>
  );
}

async function TaskLoader({ id }: { id: string }) {
  const n = parseTaskId(id);
  if (!n) notFound();
  // "nw-42" and "42" work too; the address people share is NW-42.
  if (id !== formatTaskId(n)) permanentRedirect(`/tasks/${formatTaskId(n)}`);
  const task = await getTask(formatTaskId(n));
  if (task === "missing") notFound();
  if (!task) {
    return (
      <div className={`${container} py-16`}>
        <BoardOffline what="This task" />
        <p className="mt-6 text-center text-sm">
          <Link className={textLink} href="/tasks">
            Back to the board
          </Link>
        </p>
      </div>
    );
  }
  return <TaskView initial={task} />;
}

function TaskSkeleton() {
  return (
    <div aria-hidden="true" className={`${container} grid gap-4 py-10`}>
      <div className="h-4 w-24 bg-subtle" />
      <div className="h-9 w-2/3 bg-subtle" />
      <div className="h-5 w-1/2 bg-subtle" />
      <div className="mt-6 h-40 bg-subtle" />
    </div>
  );
}
