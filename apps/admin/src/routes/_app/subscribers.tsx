import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon, MailIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"

import { Page } from "@/components/page"
import { dataSource } from "@/lib/data-source"
import { errorMessage } from "@/lib/errors"
import { formatDateTime, formatRelative, todayIso } from "@/lib/format"
import { subscribersQueryOptions } from "@/lib/queries"
import type { Subscriber, SubscriberStatus } from "@/lib/types"

export const Route = createFileRoute("/_app/subscribers")({
  loader: ({ context }) => context.queryClient.ensureQueryData(subscribersQueryOptions),
  component: SubscribersPage,
})

// Narrow table (a phone): email and status; source and date move under the email.
const from2xl = { className: "hidden @2xl:table-cell" }

const columns: ColumnDef<Subscriber>[] = [
  {
    id: "email",
    accessorKey: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    cell: ({ row }) => (
      <div className="flex w-0 min-w-full flex-col">
        <span className="truncate font-medium">{row.original.email}</span>
        <span className="truncate text-xs text-muted-foreground @2xl:hidden">
          {row.original.source} · {formatRelative(row.original.createdAt)}
        </span>
      </div>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
    size: 130,
  },
  {
    id: "source",
    accessorKey: "source",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.source}</span>,
    size: 140,
    meta: from2xl,
  },
  {
    id: "since",
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Since" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground" title={formatDateTime(row.original.createdAt)}>
        {formatRelative(row.original.createdAt)}
      </span>
    ),
    size: 140,
    meta: from2xl,
  },
]

const STATUS: Record<SubscriberStatus, { label: string; className: string; title: string }> = {
  confirmed: {
    label: "Confirmed",
    className: "border-success/25 bg-success/10 text-success",
    title: "Clicked the link in the confirmation email. Gets the newsletter.",
  },
  pending: {
    label: "Pending",
    className: "border-warning/25 bg-warning/10 text-warning",
    title: "Hasn't clicked the confirmation link yet. Gets nothing.",
  },
  unsubscribed: {
    label: "Unsubscribed",
    className: "text-muted-foreground",
    title: "Unsubscribed. We keep only this marker, so we never email them again.",
  },
}

function StatusBadge({ status }: { status: SubscriberStatus }) {
  const { label, className, title } = STATUS[status]
  return (
    <Badge variant="outline" className={className} title={title}>
      {label}
    </Badge>
  )
}

function SubscribersPage() {
  const { data = [], isPending } = useQuery(subscribersQueryOptions)
  const [exporting, setExporting] = React.useState(false)
  const counts = { pending: 0, confirmed: 0, unsubscribed: 0 }
  for (const s of data) counts[s.status]++
  const subscribed = counts.confirmed

  const exportCsv = async () => {
    setExporting(true)
    try {
      const csv = await dataSource.exportSubscribers()
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = `novawerk-subscribers-${todayIso()}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${subscribed} ${subscribed === 1 ? "address" : "addresses"}`)
    } catch (err) {
      toast.error("We couldn't export the list", { description: errorMessage(err) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page
      header={
        <PageHeader
          eyebrow="Organisation"
          title="Subscribers"
          description={`People who signed up for the newsletter on novawerk.io/about. ${counts.confirmed} confirmed, ${counts.pending} pending, ${counts.unsubscribed} unsubscribed.`}
          actions={
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || subscribed === 0}>
              <DownloadIcon /> {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(row) => String(row.id)}
        searchPlaceholder="Search subscribers"
        pageSize={50}
        emptyState={
          <EmptyState
            variant="plain"
            icon={<MailIcon />}
            title="No subscribers yet"
            description="Sign-ups from the newsletter box land here."
          />
        }
      />
      <p className="text-xs text-muted-foreground">
        Signing up sends a confirmation email; only people who click it are confirmed. The CSV holds only
        confirmed people. Unsubscribing keeps the row as a marker, so we never email them again.
      </p>
    </Page>
  )
}
