import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArrowDownLeftIcon, ArrowUpRightIcon, PlusIcon, UploadIcon, WalletIcon } from "lucide-react"
import { toast } from "sonner"

import { LEDGER_DIRECTIONS, financeEntryInput, parseAmountToCents, type LedgerDirection } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nw/ui/core/components/ui/dialog"
import { Input } from "@nw/ui/core/components/ui/input"
import { Label } from "@nw/ui/core/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@nw/ui/core/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"
import { cn } from "@nw/ui/lib/utils"

import { FormField } from "@/components/form-field"
import { Page } from "@/components/page"
import { UploadDocumentDialog } from "@/components/upload-document-dialog"
import { dataSource } from "@/lib/data-source"
import { errorMessage, issueFor, issuesFromParse } from "@/lib/errors"
import { formatCents, formatDate, todayIso } from "@/lib/format"
import {
  documentsQueryOptions,
  financeQueryOptions,
  membersQueryOptions,
  partnersQueryOptions,
  useAddFinanceEntry,
} from "@/lib/queries"
import type { DocumentRow, FinanceEntry, MemberSummary, Partner } from "@/lib/types"

export const Route = createFileRoute("/_app/finance")({
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQueryOptions),
  component: FinancePage,
})

/** In is positive, out is negative. Integer cents throughout. */
const signed = (e: FinanceEntry) => (e.direction === "in" ? e.amountCents : -e.amountCents)

function FinancePage() {
  const { data = [], isPending } = useQuery(financeQueryOptions)
  const { data: partners = [] } = useQuery(partnersQueryOptions)
  const { data: documents = [] } = useQuery(documentsQueryOptions)
  const { data: members = [] } = useQuery(membersQueryOptions)
  const [adding, setAdding] = React.useState(false)

  const totals = React.useMemo(() => {
    const moneyIn = data.filter((e) => e.direction === "in").reduce((sum, e) => sum + e.amountCents, 0)
    const moneyOut = data.filter((e) => e.direction === "out").reduce((sum, e) => sum + e.amountCents, 0)
    return { moneyIn, moneyOut, balance: moneyIn - moneyOut }
  }, [data])

  const columns = React.useMemo(() => buildColumns(partners, documents, members), [partners, documents, members])

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Organisation"
          title="Finance"
          description="Every euro in and out, one row each. The ledger only grows: fix a mistake with a correcting entry."
          actions={
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add entry
            </Button>
          }
        />
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Total title="Money in" cents={totals.moneyIn} tone="in" />
        <Total title="Money out" cents={totals.moneyOut} tone="out" />
        <Total
          title="Balance"
          cents={totals.balance}
          tone={totals.balance < 0 ? "out" : "neutral"}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(row) => String(row.id)}
        searchPlaceholder="Search the ledger"
        pageSize={50}
        emptyState={
          <EmptyState
            variant="plain"
            icon={<WalletIcon />}
            title="No entries yet"
            description="Add the first money movement: a grant, a donation, a hosting bill."
          />
        }
      />
      {adding && <AddEntryDialog partners={partners} documents={documents} onClose={() => setAdding(false)} />}
    </Page>
  )
}

function Total({
  title,
  cents,
  tone,
  className,
}: {
  title: string
  cents: number
  tone: "in" | "out" | "neutral"
  className?: string
}) {
  return (
    <Card className={cn("gap-1 py-4 shadow-none", className)}>
      <CardHeader className="px-4">
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl tabular-nums sm:text-2xl",
            tone === "in" && "text-success",
            tone === "out" && cents !== 0 && "text-destructive",
          )}
        >
          {formatCents(cents)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 text-xs text-muted-foreground">All time, in euro</CardContent>
    </Card>
  )
}

function buildColumns(partners: Partner[], documents: DocumentRow[], members: MemberSummary[]): ColumnDef<FinanceEntry>[] {
  const partnerName = (id: string | null) => (id ? (partners.find((p) => p.id === id)?.name ?? id) : null)
  const receipt = (id: number | null) => (id ? (documents.find((d) => d.id === id)?.title ?? `Document ${id}`) : null)
  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.displayName ?? id) : "—")
  return [
    {
      id: "date",
      accessorKey: "entryDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDate(row.original.entryDate)}</span>,
      size: 120,
      meta: { className: "hidden @lg:table-cell" },
    },
    {
      id: "what",
      accessorFn: (row) =>
        `${row.description ?? ""} ${row.category ?? ""} ${partnerName(row.partnerId) ?? ""} ${receipt(row.receiptDocumentId) ?? ""}`,
      header: () => "What",
      cell: ({ row }) => {
        const partner = partnerName(row.original.partnerId)
        const doc = receipt(row.original.receiptDocumentId)
        return (
          <div className="flex w-0 min-w-full flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate">{row.original.description || <span className="text-muted-foreground">No description</span>}</span>
              {row.original.category && <Badge variant="secondary">{row.original.category}</Badge>}
            </span>
            <span className="truncate text-xs text-muted-foreground tabular-nums @lg:hidden">
              {formatDate(row.original.entryDate)}
            </span>
            {(partner || doc) && (
              <span className="truncate text-xs text-muted-foreground">
                {[partner && `Partner: ${partner}`, doc && `Receipt: ${doc}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: "owner",
      accessorFn: (row) => memberName(row.owner),
      header: () => "Recorded by",
      cell: ({ row }) => <span className="text-muted-foreground">{memberName(row.original.owner)}</span>,
      size: 150,
      meta: { className: "hidden @2xl:table-cell" },
    },
    {
      id: "amount",
      accessorFn: signed,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" className="float-right" />,
      cell: ({ row }) => (
        <div
          className={cn(
            "flex items-center justify-end gap-1 font-medium whitespace-nowrap tabular-nums",
            row.original.direction === "in" ? "text-success" : "text-foreground",
          )}
        >
          {row.original.direction === "in" ? (
            <ArrowDownLeftIcon className="size-3.5" aria-label="In" />
          ) : (
            <ArrowUpRightIcon className="size-3.5 text-muted-foreground" aria-label="Out" />
          )}
          {row.original.direction === "in" ? "" : "−"}
          {formatCents(row.original.amountCents)}
        </div>
      ),
      size: 150,
    },
  ]
}

const NONE = "__none__"

function AddEntryDialog({
  partners,
  documents,
  onClose,
}: {
  partners: Partner[]
  documents: DocumentRow[]
  onClose: () => void
}) {
  const add = useAddFinanceEntry()
  const [entryDate, setEntryDate] = React.useState(todayIso())
  const [direction, setDirection] = React.useState<LedgerDirection>("out")
  const [amount, setAmount] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [partnerId, setPartnerId] = React.useState<string>(NONE)
  const [receiptId, setReceiptId] = React.useState<string>(NONE)
  const [uploadingReceipt, setUploadingReceipt] = React.useState(false)
  const [issues, setIssues] = React.useState<Record<string, string[]>>({})

  const cents = parseAmountToCents(amount)
  const receipts = documents.filter((d) => d.kind === "receipt" || d.kind === "invoice")
  const errorOf = (field: string) => issues[field]?.[0] ?? issueFor(add.error, field)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (cents === null) {
      setIssues({ amountCents: ["Enter an amount like 12.50"] })
      return
    }
    const input = {
      entryDate,
      direction,
      amountCents: cents,
      category,
      description,
      partnerId: partnerId === NONE ? null : partnerId,
      receiptDocumentId: receiptId === NONE ? null : Number(receiptId),
    }
    const parsed = financeEntryInput.safeParse(input)
    if (!parsed.success) {
      setIssues(issuesFromParse(parsed.error))
      return
    }
    setIssues({})
    add.mutate(input, {
      onSuccess: (entry) => {
        toast.success(`Added ${entry.direction === "in" ? "+" : "−"}${formatCents(entry.amountCents)}`)
        onClose()
      },
      onError: (err) => {
        if (!["entryDate", "amountCents", "partnerId", "receiptDocumentId"].some((f) => issueFor(err, f))) {
          toast.error("We couldn't add it", { description: errorMessage(err) })
        }
      },
    })
  }

  const partnerOptions = [{ value: NONE, label: "None" }, ...partners.map((p) => ({ value: p.id, label: p.name }))]
  const receiptOptions = [
    { value: NONE, label: "None" },
    ...receipts.map((d) => ({ value: String(d.id), label: d.title })),
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Add a ledger entry</DialogTitle>
            <DialogDescription>In euro. Entries can't be edited later, so check the amount.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Direction</Label>
              <Tabs value={direction} onValueChange={(v) => setDirection(v as LedgerDirection)}>
                <TabsList className="w-full">
                  {LEDGER_DIRECTIONS.map((d) => (
                    <TabsTrigger key={d} value={d}>
                      {d === "in" ? "Money in" : "Money out"}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Amount (€)"
                htmlFor="entry-amount"
                error={errorOf("amountCents")}
                hint={cents !== null ? formatCents(cents) : "e.g. 19.99"}
              >
                <Input
                  id="entry-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="tabular-nums"
                  required
                  autoFocus
                />
              </FormField>
              <FormField label="Date" htmlFor="entry-date" error={errorOf("entryDate")}>
                <Input id="entry-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Category" htmlFor="entry-category" error={errorOf("category")} hint="grant, hosting, workshop…">
                <Input id="entry-category" value={category} onChange={(e) => setCategory(e.target.value)} />
              </FormField>
              <FormField label="Partner" htmlFor="entry-partner" error={errorOf("partnerId")}>
                <Select items={partnerOptions} value={partnerId} onValueChange={(v) => setPartnerId(String(v ?? NONE))}>
                  <SelectTrigger id="entry-partner" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {partnerOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label="Description" htmlFor="entry-description" error={errorOf("description")}>
              <Input id="entry-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <FormField
              label="Receipt"
              htmlFor="entry-receipt"
              error={errorOf("receiptDocumentId")}
              hint="A receipt or invoice from Documents, or upload one now."
            >
              <div className="flex gap-2">
                <Select items={receiptOptions} value={receiptId} onValueChange={(v) => setReceiptId(String(v ?? NONE))}>
                  <SelectTrigger id="entry-receipt" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {receiptOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUploadingReceipt(true)}
                  disabled={dataSource.isSample}
                  title={dataSource.isSample ? "Uploads are off in sample mode" : undefined}
                >
                  <UploadIcon /> Upload
                </Button>
              </div>
            </FormField>
            {uploadingReceipt && (
              <UploadDocumentDialog
                defaultKind="receipt"
                onClose={() => setUploadingReceipt(false)}
                onUploaded={(doc) => setReceiptId(String(doc.id))}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
