import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ListChecksIcon, PlusIcon } from "lucide-react"

import { ADMIN_TASK_FILTERS, type AdminTaskFilter } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"

import { AREA_LABELS, PersonChip, SizeLabel, StaleBadge, TaskStatusBadge } from "@/components/board/parts"
import { Page } from "@/components/page"
import { boardTasksQueryOptions } from "@/lib/board-queries"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { AdminTaskRow } from "@/lib/types"

type Search = { filter?: AdminTaskFilter }

export const Route = createFileRoute("/_app/tasks/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    filter: ADMIN_TASK_FILTERS.includes(search.filter as AdminTaskFilter) && search.filter !== "all" ? (search.filter as AdminTaskFilter) : undefined,
  }),
  loaderDeps: ({ search }) => ({ filter: search.filter ?? "all" }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(boardTasksQueryOptions(deps.filter)),
  component: TasksPage,
})

const FILTER_LABELS: Record<AdminTaskFilter, string> = {
  all: "All",
  decide: "Needs a decision",
  stale: "Stale",
  draft: "Drafts",
  active: "Active",
  finished: "Finished",
}

// The Task column takes the free width; the others fit their content. On a phone only Task and
// Updated stay, and the id, area and size move under the title.
const fit = "w-px whitespace-nowrap"
const fromXl = { className: `hidden @3xl:table-cell ${fit}` }
const from2xl = { className: `hidden @2xl:table-cell ${fit}` }

const columns: ColumnDef<AdminTaskRow>[] = [
  {
    id: "id",
    accessorKey: "number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Id" />,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.id}</span>,
    meta: from2xl,
  },
  {
    id: "title",
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
    cell: ({ row }) => {
      const t = row.original
      return (
        <div className="flex min-w-48 flex-col gap-1 py-0.5 whitespace-normal">
          <span className="line-clamp-2 font-medium">{t.title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge status={t.status} />
            {t.stale && <StaleBadge />}
            {t.needsDecision && (
              <Badge variant="outline" className="border-info/25 bg-info/10 text-info">
                {t.status === "suggested" ? "Triage" : "Choose a proposal"}
              </Badge>
            )}
            <span className="truncate text-xs text-muted-foreground">
              <span className="font-mono @2xl:hidden">
                {t.id}
                {t.suggestedBy ? " · " : ""}
              </span>
              {t.suggestedBy ? `Suggested by @${t.suggestedBy.handle}` : null}
            </span>
          </span>
        </div>
      )
    },
    meta: { className: "w-full" },
  },
  {
    id: "area",
    accessorFn: (t) => (t.area ? AREA_LABELS[t.area] : ""),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Area" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.area ? AREA_LABELS[row.original.area] : "—"}</span>,
    meta: fromXl,
  },
  {
    id: "size",
    accessorFn: (t) => t.werk ?? 0,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
    cell: ({ row }) => <SizeLabel size={row.original.size} />,
    meta: fromXl,
  },
  {
    id: "proposals",
    accessorKey: "proposalCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Proposals" />,
    cell: ({ row }) => (
      <span className={row.original.proposalCount ? "tabular-nums" : "text-muted-foreground tabular-nums"}>{row.original.proposalCount}</span>
    ),
    meta: from2xl,
  },
  {
    id: "assignee",
    accessorFn: (t) => t.assignee?.handle ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Assignee" />,
    cell: ({ row }) => <PersonChip person={row.original.assignee} />,
    meta: fromXl,
  },
  {
    id: "updated",
    accessorKey: "updatedAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground" title={formatDateTime(row.original.updatedAt)}>
        {formatRelative(row.original.updatedAt)}
      </span>
    ),
    meta: { className: fit },
  },
]

const EMPTY: Record<AdminTaskFilter, { title: string; description: string }> = {
  all: { title: "No tasks yet", description: "Write the first one. It stays a draft until you publish it." },
  decide: { title: "Nothing to decide right now", description: "Suggestions to triage and open tasks with proposals show here." },
  stale: { title: "Nothing stale", description: "Tasks someone holds without activity for a week show here." },
  draft: { title: "No drafts", description: "New tasks start here." },
  active: { title: "No task is in progress", description: "Suggested, open, assigned and in-review tasks show here." },
  finished: { title: "Nothing finished yet", description: "Done, closed, declined and duplicate tasks show here." },
}

function TasksPage() {
  const { filter = "all" } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data = [], isPending } = useQuery(boardTasksQueryOptions(filter))

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Contributors"
          title="Tasks"
          description="The open task board at novawerk.io/tasks. Drafts stay here until you publish them."
          actions={
            <Button render={<Link to="/tasks/new" />} nativeButton={false}>
              <PlusIcon /> New task
            </Button>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(t) => t.id}
        onRowClick={(t) => void navigate({ to: "/tasks/$taskId", params: { taskId: t.id } })}
        searchPlaceholder="Search tasks"
        initialSorting={[{ id: "updated", desc: true }]}
        pageSize={50}
        toolbar={
          <Tabs className="max-w-full min-w-0" value={filter} onValueChange={(next) => void navigate({ search: next === "all" ? {} : { filter: next as AdminTaskFilter } })}>
            <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
              {ADMIN_TASK_FILTERS.map((f) => (
                <TabsTrigger key={f} value={f}>
                  {FILTER_LABELS[f]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        emptyState={<EmptyState icon={<ListChecksIcon />} {...EMPTY[filter]} />}
      />
    </Page>
  )
}
