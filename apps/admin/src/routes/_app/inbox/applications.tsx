import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { InboxIcon, UserPlusIcon } from "lucide-react"

import { APPLICATION_STATUSES, type ApplicationStatus } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"

import { ApplicationDetail } from "@/components/inbox/application-detail"
import { InboxSplitView } from "@/components/inbox/inbox-split-view"
import { StatusFilter } from "@/components/inbox/status-filter"
import { formatRelative } from "@/lib/format"
import { functionLabel } from "@/lib/labels"
import { applicationsQueryOptions } from "@/lib/queries"
import type { MemberApplication } from "@/lib/types"

type Search = { status?: ApplicationStatus; id?: string }

export const Route = createFileRoute("/_app/inbox/applications")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    status: APPLICATION_STATUSES.find((s) => s === search.status),
    id: typeof search.id === "string" && search.id ? search.id : undefined,
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(applicationsQueryOptions(deps.status)),
  component: ApplicationsPage,
})

const columns: ColumnDef<MemberApplication>[] = [
  {
    id: "person",
    accessorFn: (row) => `${row.name} ${row.email} ${row.city ?? ""} ${row.functions.join(" ")}`,
    header: () => "Applicant",
    cell: ({ row }) => (
      <div className="flex w-0 min-w-full flex-col gap-0.5">
        <span className="truncate font-medium">{row.original.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {row.original.functions.map(functionLabel).join(", ")} · {formatRelative(row.original.createdAt)}
        </span>
      </div>
    ),
  },
  {
    id: "status",
    accessorFn: (row) => APPLICATION_STATUSES.indexOf(row.status),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" className="float-right" />,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <StatusBadge kind="application" status={row.original.status} />
      </div>
    ),
    size: 120,
  },
]

function ApplicationsPage() {
  const { status, id } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data = [], isPending } = useQuery(applicationsQueryOptions(status))

  return (
    <InboxSplitView
      hasSelection={Boolean(id)}
      header={
        <PageHeader
          eyebrow="Inbox"
          title="Applications"
          description="People who want to join Novawerk as Members, from novawerk.io/join."
        />
      }
      list={
        <>
          <StatusFilter
            statuses={APPLICATION_STATUSES}
            value={status}
            onChange={(next) => void navigate({ search: (prev) => ({ ...prev, status: next }) })}
          />
          <DataTable
            className="min-h-0 flex-1"
            columns={columns}
            data={data}
            isLoading={isPending}
            getRowId={(row) => row.id}
            selectedRowId={id}
            onRowClick={(row) => void navigate({ search: (prev) => ({ ...prev, id: row.id }) })}
            searchPlaceholder="Search applications"
            emptyState={
              <EmptyState
                variant="plain"
                icon={<InboxIcon />}
                title={status ? `No ${status} applications` : "No applications yet"}
                description="New applications from the website land here."
              />
            }
          />
        </>
      }
      detail={
        id ? (
          <ApplicationDetail
            key={id}
            id={id}
            onBack={() => void navigate({ search: (prev) => ({ ...prev, id: undefined }) })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              variant="plain"
              icon={<UserPlusIcon />}
              title="Pick an application"
              description="Choose someone on the left to read their application and reply."
            />
          </div>
        )
      }
    />
  )
}
