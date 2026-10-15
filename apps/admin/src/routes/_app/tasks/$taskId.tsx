import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeftIcon, ExternalLinkIcon, LockIcon, RotateCcwIcon, SendIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@nw/ui/compound/page-header"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"

import { AREA_LABELS, PersonChip, ReasonDialog, SizeLabel, StaleBadge, TaskLink, TaskStatusBadge, WHERE_LABELS } from "@/components/board/parts"
import { TaskEditor } from "@/components/board/task-editor"
import { ProposalCard, Thread, Timeline } from "@/components/board/task-panels"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { Page } from "@/components/page"
import { boardTaskQueryOptions, useCloseTask, usePublishTask, useReopenTask } from "@/lib/board-queries"
import { WEB_URL } from "@/lib/env"
import { errorMessage } from "@/lib/errors"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { AdminTaskDetail } from "@/lib/types"

export const Route = createFileRoute("/_app/tasks/$taskId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(boardTaskQueryOptions(params.taskId)),
  component: TaskPage,
})

const FINAL = ["done", "closed", "declined", "duplicate"]

function TaskPage() {
  const { taskId } = Route.useParams()
  const { data: task, isPending } = useQuery(boardTaskQueryOptions(taskId))
  const composerRef = React.useRef<HTMLTextAreaElement>(null)

  if (isPending || !task) {
    return (
      <Page header={<Skeleton className="h-12 w-72" />}>
        <Skeleton className="h-96 w-full" />
      </Page>
    )
  }

  const pendingPlans = task.proposals.filter((p) => p.status === "pending")
  const decided = task.proposals.filter((p) => p.status !== "pending")

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow={
            <Link to="/tasks" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeftIcon className="size-3" /> Tasks · <span className="font-mono">{task.id}</span>
            </Link>
          }
          title={task.title}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              {task.stale && <StaleBadge />}
              <span>Updated {formatRelative(task.updatedAt)}</span>
            </span>
          }
          actions={<TaskActions task={task} />}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex min-w-0 flex-col gap-6">
          {task.kind !== "task" && task.status === "suggested" && (
            <Card className="border-info/30 bg-info/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>This is a suggestion. Triage it from the queue: accept, ask, mark duplicate or decline.</span>
                <Button size="sm" variant="outline" nativeButton={false} render={<Link to="/suggestions" search={{ id: task.id }} />}>
                  Open in Suggestions
                </Button>
              </CardContent>
            </Card>
          )}
          <TaskEditor key={task.id} task={task} readOnly={FINAL.includes(task.status)} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Facts task={task} />

          {task.status !== "draft" && task.kind === "task" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Proposals <span className="font-normal text-muted-foreground tabular-nums">{pendingPlans.length} pending</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {task.proposals.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
                {pendingPlans.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    others={pendingPlans.filter((o) => o.id !== p.id)}
                    onAsk={() => composerRef.current?.focus()}
                  />
                ))}
                {decided.map((p) => (
                  <ProposalCard key={p.id} proposal={p} others={[]} />
                ))}
              </CardContent>
            </Card>
          )}

          {task.status !== "draft" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Thread {task.threadLocked && <LockIcon className="size-3.5 text-muted-foreground" aria-label="Locked" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Thread taskId={task.id} posts={task.posts} canPost composerRef={composerRef} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={task.events} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </Page>
  )
}

function TaskActions({ task }: { task: AdminTaskDetail }) {
  const publish = usePublishTask()
  const close = useCloseTask()
  const reopen = useReopenTask()
  const [dialog, setDialog] = React.useState<"close" | "reopen" | null>(null)
  const canClose = ["open", "assigned", "in_review"].includes(task.status)

  return (
    <>
      {task.status !== "draft" && task.status !== "suggested" && (
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href={`${WEB_URL}/tasks/${task.id}`} target="_blank" rel="noreferrer" />}>
          <ExternalLinkIcon /> On the site
        </Button>
      )}
      {task.status === "draft" && (
        <ConfirmAction
          trigger={
            <Button disabled={publish.isPending}>
              <SendIcon /> Publish
            </Button>
          }
          title={`Publish ${task.id}?`}
          description="It goes on novawerk.io/tasks, and anyone can propose a plan."
          confirmLabel="Publish"
          onConfirm={() =>
            publish.mutate(task.id, {
              onSuccess: () => toast.success(`${task.id} is on the board`),
              onError: (err) => toast.error("We couldn't publish it", { description: errorMessage(err) }),
            })
          }
        />
      )}
      {canClose && (
        <Button variant="outline" onClick={() => setDialog("close")}>
          <XCircleIcon /> Close task
        </Button>
      )}
      {task.status === "closed" && (
        <Button variant="outline" onClick={() => setDialog("reopen")}>
          <RotateCcwIcon /> Reopen
        </Button>
      )}
      {dialog === "close" && (
        <ReasonDialog
          title={`Close ${task.id}?`}
          description={
            task.assignee
              ? `@${task.assignee.handle} holds it. Closing takes it off the board; the reason shows on the timeline.`
              : "It leaves the board. The reason shows on the timeline."
          }
          label="Public reason"
          placeholder="Done another way, no longer needed…"
          confirmLabel="Close task"
          destructive
          onSubmit={(reason) => close.mutateAsync({ id: task.id, reason }).then(() => toast.success(`${task.id} closed`))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "reopen" && (
        <ReasonDialog
          title={`Reopen ${task.id}?`}
          description="It goes back on the board as open. Whoever held it before proposes again."
          label="Public reason"
          placeholder="We need it after all"
          confirmLabel="Reopen"
          onSubmit={(reason) => reopen.mutateAsync({ id: task.id, reason }).then(() => toast.success(`${task.id} is open again`))}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

function Facts({ task }: { task: AdminTaskDetail }) {
  const rows: [string, React.ReactNode][] = [
    ["Size", <SizeLabel size={task.size} />],
    ["Area", task.area ? AREA_LABELS[task.area] : "—"],
    ["Assignee", <PersonChip person={task.assignee} />],
  ]
  if (task.lastActivityAt) rows.push(["Last activity", <span title={formatDateTime(task.lastActivityAt)}>{formatRelative(task.lastActivityAt)}</span>])
  if (task.releaseAt) rows.push(["Back on the board", <span title="If nothing happens before then">{formatDateTime(task.releaseAt)}</span>])
  if (task.prUrl)
    rows.push([
      "Pull request",
      <a href={task.prUrl} target="_blank" rel="noreferrer" className="block truncate underline underline-offset-2" title={task.prUrl}>
        {task.prUrl.replace(/^https:\/\/github\.com\//, "")}
      </a>,
    ])
  if (task.suggestedBy) rows.push(["Suggested by", <PersonChip person={task.suggestedBy} />])
  if (task.where) rows.push(["Where", `${WHERE_LABELS[task.where]}${task.wherePath ? ` · ${task.wherePath}` : ""}`])
  if (task.kind !== "task") rows.push(["Votes", task.voteCount ? <span className="tabular-nums">{task.voteCount}</span> : "No votes yet"])
  if (task.closedReason) rows.push([task.status === "declined" ? "Decline note" : "Closed because", task.closedReason])
  if (task.duplicateOf) rows.push(["Duplicate of", <TaskLink id={task.duplicateOf} />])

  return (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
