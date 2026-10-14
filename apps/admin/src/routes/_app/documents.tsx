import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon, FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"

import { ConfirmAction } from "@/components/inbox/confirm-action"
import { Page } from "@/components/page"
import { UploadDocumentDialog } from "@/components/upload-document-dialog"
import { dataSource } from "@/lib/data-source"
import { errorMessage } from "@/lib/errors"
import { formatDate, formatRelative } from "@/lib/format"
import { DOCUMENT_KIND_LABELS } from "@/lib/labels"
import { documentsQueryOptions, membersQueryOptions, useDeleteDocument } from "@/lib/queries"
import type { DocumentRow, MemberSummary } from "@/lib/types"

export const Route = createFileRoute("/_app/documents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(documentsQueryOptions),
  component: DocumentsPage,
})

// Narrow table (a phone): the document and its actions. Kind and counterparty move under the
// title; the other columns appear as the table gets wider.
const buildColumns = (members: MemberSummary[]): ColumnDef<DocumentRow>[] => [
  {
    id: "title",
    accessorFn: (row) => `${row.title} ${row.r2Key} ${row.counterparty ?? ""}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Document" />,
    sortingFn: (a, b) => a.original.title.localeCompare(b.original.title),
    cell: ({ row }) => (
      <div className="flex w-0 min-w-full flex-col">
        <span className="truncate font-medium">{row.original.title}</span>
        <span className="hidden truncate font-mono text-xs text-muted-foreground @2xl:block">{row.original.r2Key}</span>
        <span className="truncate text-xs text-muted-foreground @2xl:hidden">
          {[DOCUMENT_KIND_LABELS[row.original.kind], row.original.counterparty].filter(Boolean).join(" · ")}
        </span>
      </div>
    ),
  },
  {
    id: "kind",
    accessorKey: "kind",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
    cell: ({ row }) => <Badge variant="secondary">{DOCUMENT_KIND_LABELS[row.original.kind]}</Badge>,
    size: 110,
    meta: { className: "hidden @2xl:table-cell" },
  },
  {
    id: "counterparty",
    accessorFn: (row) => row.counterparty ?? "",
    header: () => "With",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.counterparty ?? "—"}</span>,
    size: 170,
    meta: { className: "hidden @2xl:table-cell" },
  },
  {
    id: "signed",
    accessorFn: (row) => row.signedOn ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Signed" />,
    cell: ({ row }) => (row.original.signedOn ? formatDate(row.original.signedOn) : "—"),
    size: 130,
    meta: { className: "hidden @3xl:table-cell" },
  },
  {
    id: "owner",
    accessorFn: (row) => row.owner ?? "",
    header: () => "Owner",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.owner
          ? (members.find((m) => m.id === row.original.owner)?.displayName ?? row.original.owner)
          : "Novawerk"}
      </span>
    ),
    size: 150,
    meta: { className: "hidden @4xl:table-cell" },
  },
  {
    id: "added",
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Added" />,
    cell: ({ row }) => <span className="text-muted-foreground">{formatRelative(row.original.createdAt)}</span>,
    size: 120,
    meta: { className: "hidden @5xl:table-cell" },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <DocumentActions doc={row.original} />,
    size: 120,
  },
]

function DocumentActions({ doc }: { doc: DocumentRow }) {
  const remove = useDeleteDocument()
  const url = dataSource.documentFileUrl(doc.id)
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={!url}
        nativeButton={false}
        render={url ? <a href={url} target="_blank" rel="noreferrer noopener" /> : <span />}
      >
        <ExternalLinkIcon /> Open
      </Button>
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${doc.title}`} disabled={remove.isPending}>
            <Trash2Icon />
          </Button>
        }
        variant="destructive"
        title={`Delete ${doc.title}?`}
        description="The file and its entry go. Ledger entries that used it as a receipt keep their amounts."
        confirmLabel="Delete"
        onConfirm={() =>
          remove.mutate(doc.id, {
            onSuccess: () => toast.success(`Deleted ${doc.title}`),
            onError: (err) => toast.error("We couldn't delete it", { description: errorMessage(err) }),
          })
        }
      />
    </div>
  )
}

function DocumentsPage() {
  const { data = [], isPending } = useQuery(documentsQueryOptions)
  const { data: members = [] } = useQuery(membersQueryOptions)
  const [uploading, setUploading] = React.useState(false)

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Organisation"
          title="Documents"
          description="Contracts, NDAs, invoices and receipts, kept private. You see your own, plus the ones that belong to Novawerk as a whole."
          actions={
            <Button
              onClick={() => setUploading(true)}
              disabled={dataSource.isSample}
              title={dataSource.isSample ? "Uploads are off in sample mode" : undefined}
            >
              <UploadIcon /> Upload document
            </Button>
          }
        />
      }
    >
      <DataTable
        columns={buildColumns(members)}
        data={data}
        isLoading={isPending}
        getRowId={(row) => String(row.id)}
        searchPlaceholder="Search documents"
        emptyState={
          <EmptyState
            variant="plain"
            icon={<FileTextIcon />}
            title="No documents yet"
            description="Upload a contract or a receipt. Only you can open what you upload."
          />
        }
      />
      {uploading && <UploadDocumentDialog onClose={() => setUploading(false)} />}
    </Page>
  )
}
