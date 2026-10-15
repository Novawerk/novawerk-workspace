import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Button } from "@nw/ui/core/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nw/ui/core/components/ui/dialog"
import { Input } from "@nw/ui/core/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@nw/ui/core/components/ui/select"
import { Textarea } from "@nw/ui/core/components/ui/textarea"
import { cn } from "@nw/ui/lib/utils"

import { PersonChip, TaskLink } from "@/components/board/parts"
import { FormField } from "@/components/form-field"
import { Page } from "@/components/page"
import { contributorsQueryOptions, useAdjustWerk, werkQueryOptions } from "@/lib/board-queries"
import { errorMessage, issueFor } from "@/lib/errors"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { AdminWerkRow } from "@/lib/types"

export const Route = createFileRoute("/_app/werk")({
  loader: ({ context }) => context.queryClient.ensureQueryData(werkQueryOptions()),
  component: WerkPage,
})

const from2xl = { className: "hidden @2xl:table-cell" }

const columns: ColumnDef<AdminWerkRow>[] = [
  {
    id: "when",
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground" title={formatDateTime(row.original.createdAt)}>
        {formatRelative(row.original.createdAt)}
      </span>
    ),
    size: 120,
    meta: from2xl,
  },
  {
    id: "who",
    accessorFn: (r) => r.contributor?.handle ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Who" />,
    cell: ({ row }) =>
      row.original.contributor ? <PersonChip person={row.original.contributor} /> : <span className="text-muted-foreground">A former contributor</span>,
    size: 170,
    meta: from2xl,
  },
  {
    id: "change",
    accessorKey: "delta",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Change" />,
    cell: ({ row }) => (
      <span className={cn("font-medium tabular-nums", row.original.delta < 0 && "text-destructive")}>
        {row.original.delta > 0 ? "+" : ""}
        {row.original.delta}
      </span>
    ),
    size: 90,
  },
  {
    id: "reason",
    accessorKey: "reason",
    header: () => <span>Reason</span>,
    cell: ({ row }) => (
      <div className="flex w-0 min-w-full flex-col gap-0.5">
        <span className="line-clamp-2 whitespace-normal">{row.original.reason}</span>
        <span className="flex gap-2 truncate text-xs text-muted-foreground">
          <span className="@2xl:hidden">
            {row.original.contributor ? `@${row.original.contributor.handle}` : "A former contributor"} · {formatRelative(row.original.createdAt)}
          </span>
          {row.original.task && <TaskLink id={row.original.task.id} />}
        </span>
      </div>
    ),
  },
  {
    id: "by",
    accessorFn: (r) => r.byMember?.name ?? "GitHub",
    header: ({ column }) => <DataTableColumnHeader column={column} title="By" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.byMember ? row.original.byMember.name : "GitHub (merge)"}</span>,
    size: 150,
    meta: from2xl,
  },
]

function WerkPage() {
  const { data = [], isPending } = useQuery(werkQueryOptions())
  const [adjusting, setAdjusting] = React.useState(false)

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Contributors"
          title="Werk"
          description="Recognition for merged work, never money or rank. Rows are never edited: a change is a new row with a reason the contributor sees."
          actions={
            <Button onClick={() => setAdjusting(true)}>
              <PlusIcon /> Adjust Werk
            </Button>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(r) => String(r.id)}
        searchPlaceholder="Search the ledger"
        initialSorting={[{ id: "when", desc: true }]}
        pageSize={50}
        emptyState={<EmptyState icon={<SparklesIcon />} title="No Werk yet" description="A merged task adds its Werk here." />}
      />
      {adjusting && <AdjustDialog onClose={() => setAdjusting(false)} />}
    </Page>
  )
}

function AdjustDialog({ onClose }: { onClose: () => void }) {
  const { data: people = [] } = useQuery(contributorsQueryOptions)
  const adjust = useAdjustWerk()
  const [contributorId, setContributorId] = React.useState<string | null>(null)
  const [delta, setDelta] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [taskId, setTaskId] = React.useState("")
  const items = people.map((p) => ({ value: p.id, label: `@${p.handle} · ${p.werk} Werk` }))
  const amount = Number(delta)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!contributorId) return
    adjust.mutate(
      { contributorId, delta: amount, reason, ...(taskId.trim() ? { taskId: taskId.trim() } : {}) },
      {
        onSuccess: (row) => {
          toast.success(`${row.delta > 0 ? "+" : ""}${row.delta} Werk for @${row.contributor?.handle}`)
          onClose()
        },
        onError: (err) => {
          if (!["contributorId", "delta", "reason", "taskId"].some((f) => issueFor(err, f))) {
            toast.error("We couldn't add the row", { description: errorMessage(err) })
          }
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Adjust Werk</DialogTitle>
            <DialogDescription>A revert, a mistake, extra work. This adds a row; nothing is edited. They see the reason.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Contributor" htmlFor="werk-who" error={issueFor(adjust.error, "contributorId")}>
              <Select items={items} value={contributorId} onValueChange={(v) => setContributorId(v ? String(v) : null)}>
                <SelectTrigger id="werk-who" className="w-full">
                  <SelectValue placeholder="Pick a contributor" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Change" htmlFor="werk-delta" error={issueFor(adjust.error, "delta")} hint="e.g. -3 or 2">
                <Input id="werk-delta" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} className="tabular-nums" />
              </FormField>
              <FormField label="Task (optional)" htmlFor="werk-task" error={issueFor(adjust.error, "taskId")}>
                <Input id="werk-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="NW-12" className="font-mono" />
              </FormField>
            </div>
            <FormField label="Reason" htmlFor="werk-reason" error={issueFor(adjust.error, "reason")} hint="The contributor sees this.">
              <Textarea id="werk-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reverted in #215" />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!contributorId || !Number.isInteger(amount) || amount === 0 || !reason.trim() || adjust.isPending}
            >
              {adjust.isPending ? "Adding…" : "Add row"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
