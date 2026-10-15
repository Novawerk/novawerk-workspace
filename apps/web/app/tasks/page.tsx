import type { Metadata } from "next";
import { Suspense } from "react";

import { getBoardCounts, getTaskPage } from "@/lib/board";

import { TaskBoard, TaskBoardFallback } from "./task-board";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Open tasks on the software Novawerk runs on: the site, the admin panel, the API and the agents. Anyone can read them; contributors propose a plan.",
  alternates: { canonical: "/tasks" },
};

/**
 * The board. The default view (active tasks, recently updated) is cached and prerendered; the
 * filters are in the URL and the browser fetches anything else.
 */
export default async function TasksPage() {
  const [initial, counts] = await Promise.all([getTaskPage(), getBoardCounts()]);
  return (
    <Suspense fallback={<TaskBoardFallback initial={initial} counts={counts} />}>
      <TaskBoard initial={initial} counts={counts} />
    </Suspense>
  );
}
