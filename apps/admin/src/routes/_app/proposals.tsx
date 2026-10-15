import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { InboxIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"

import { AREA_LABELS, ReasonDialog, SizeLabel, TaskLink } from "@/components/board/parts"
import { ProposalCard } from "@/components/board/task-panels"
import { Page } from "@/components/page"
import { proposalQueueQueryOptions, usePostOnTask } from "@/lib/board-queries"
import type { ProposalQueueGroup } from "@/lib/types"

export const Route = createFileRoute("/_app/proposals")({
  loader: ({ context }) => context.queryClient.ensureQueryData(proposalQueueQueryOptions),
  component: ProposalsPage,
})

function ProposalsPage() {
  const { data = [], isPending } = useQuery(proposalQueueQueryOptions)
  const [asking, setAsking] = React.useState<string | null>(null)
  const post = usePostOnTask()
  const count = data.reduce((n, g) => n + g.proposals.length, 0)

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Contributors"
          title="Proposals"
          description={isPending ? "Plans waiting for a decision." : `${count} ${count === 1 ? "plan" : "plans"} on ${data.length} ${data.length === 1 ? "task" : "tasks"}, the longest-waiting first.`}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : data.length === 0 ? (
            <EmptyState icon={<InboxIcon />} title="No plans to decide on" description="When someone proposes a plan on an open task, it shows here." />
          ) : (
            data.map((group) => <TaskGroup key={group.task.id} group={group} onAsk={() => setAsking(group.task.id)} />)
          )}
        </div>
        <Card className="h-fit lg:sticky lg:top-0">
          <CardHeader>
            <CardTitle>How we decide</CardTitle>
            <CardDescription>The same way every time, so nobody has to guess.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-2 pl-4 text-sm">
              <li>The plan meets every done-when line.</li>
              <li>Prefer people with nothing in progress.</li>
              <li>Reply within a week, even when the answer is no.</li>
              <li>Choosing one plan declines the others with a kind note only each author reads.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
      {asking && (
        <ReasonDialog
          title={`Ask on ${asking}`}
          description="Your question goes into the task's thread as Novawerk. Everyone can read it."
          label="Question"
          field="body"
          confirmLabel="Post"
          onSubmit={(body) => post.mutateAsync({ id: asking, body }).then(() => toast.success("Posted in the thread"))}
          onClose={() => setAsking(null)}
        />
      )}
    </Page>
  )
}

function TaskGroup({ group, onAsk }: { group: ProposalQueueGroup; onAsk: () => void }) {
  const { task, proposals } = group
  return (
    <section aria-labelledby={`group-${task.id}`} className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <TaskLink id={task.id} />
          <h2 id={`group-${task.id}`} className="font-medium">
            {task.title}
          </h2>
        </div>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>{task.area ? AREA_LABELS[task.area] : "No area"}</span>
          <SizeLabel size={task.size} />
        </p>
        {task.criteria.length > 0 && (
          <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground">
            {task.criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        )}
      </header>
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} others={proposals.filter((o) => o.id !== p.id)} onAsk={onAsk} />
      ))}
    </section>
  )
}
