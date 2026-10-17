import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { CopyIcon, LightbulbIcon, MessageCircleQuestionIcon, CheckIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { SUGGESTION_SORTS, type SuggestionSort, type TaskArea, type TaskSize } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@nw/ui/core/components/ui/sheet"
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"

import { AreaSelect, CriteriaEditor, PersonChip, ReasonDialog, SizeControl, WHERE_LABELS, cleanLines } from "@/components/board/parts"
import { Thread } from "@/components/board/task-panels"
import { FormField, SwitchRow } from "@/components/form-field"
import { Page } from "@/components/page"
import {
  boardTaskQueryOptions,
  suggestionsQueryOptions,
  useAcceptSuggestion,
  useAskForInfo,
  useDeclineSuggestion,
  useMarkDuplicate,
} from "@/lib/board-queries"
import { errorMessage, issueFor } from "@/lib/errors"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { AdminSuggestion } from "@/lib/types"

type Search = { sort?: SuggestionSort; id?: string }

export const Route = createFileRoute("/_app/suggestions")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    sort: search.sort === "votes" ? "votes" : undefined,
    id: typeof search.id === "string" && search.id ? search.id : undefined,
  }),
  loaderDeps: ({ search }) => ({ sort: search.sort ?? "oldest" }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(suggestionsQueryOptions(deps.sort)),
  component: SuggestionsPage,
})

const SORT_LABELS: Record<SuggestionSort, string> = { oldest: "Oldest first", votes: "Most wanted" }

const from2xl = { className: "hidden @2xl:table-cell" }

const columns: ColumnDef<AdminSuggestion>[] = [
  {
    id: "title",
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Suggestion" />,
    cell: ({ row }) => {
      const s = row.original
      return (
        <div className="flex w-0 min-w-full flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{s.title}</span>
            {s.needsInfo && (
              <Badge variant="outline" className="border-warning/25 bg-warning/10 text-warning">
                Needs info
              </Badge>
            )}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {kindLabel(s)} · {s.where ? WHERE_LABELS[s.where] : "—"}
            {s.wantsIt ? " · wants to do it" : ""}
          </span>
        </div>
      )
    },
  },
  {
    id: "by",
    accessorFn: (s) => s.suggestedBy?.handle ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="By" />,
    cell: ({ row }) => <PersonChip person={row.original.suggestedBy} />,
    size: 160,
    meta: from2xl,
  },
  {
    id: "votes",
    accessorKey: "voteCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Votes" />,
    cell: ({ row }) => <span className={row.original.voteCount ? "tabular-nums" : "text-muted-foreground tabular-nums"}>{row.original.voteCount}</span>,
    size: 80,
  },
  {
    id: "age",
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Waiting" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground" title={formatDateTime(row.original.createdAt)}>
        {formatRelative(row.original.createdAt)}
      </span>
    ),
    size: 120,
    meta: from2xl,
  },
]

function SuggestionsPage() {
  const { sort = "oldest", id } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data = [], isPending } = useQuery(suggestionsQueryOptions(sort))

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Contributors"
          title="Suggestions"
          description="Improvements and bugs contributors suggest. Reply within a week. Votes help us choose; they don't decide."
        />
      }
    >
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(s) => s.id}
        selectedRowId={id ?? null}
        onRowClick={(s) => void navigate({ search: (prev) => ({ ...prev, id: s.id }) })}
        toolbar={
          <Tabs value={sort} onValueChange={(next) => void navigate({ search: (prev) => ({ ...prev, sort: next === "votes" ? "votes" : undefined }) })}>
            <TabsList>
              {SUGGESTION_SORTS.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {SORT_LABELS[s]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        emptyState={<EmptyState icon={<LightbulbIcon />} title="Nothing to triage" description="New suggestions from /tasks/suggest show here." />}
      />
      <Sheet open={Boolean(id)} onOpenChange={(open) => !open && void navigate({ search: (prev) => ({ ...prev, id: undefined }) })}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">{id && <Triage id={id} />}</SheetContent>
      </Sheet>
    </Page>
  )
}

type Action = "accept" | "duplicate" | "ask" | "decline"

function Triage({ id }: { id: string }) {
  const { data: task } = useQuery(boardTaskQueryOptions(id))
  const [action, setAction] = React.useState<Action | null>(null)
  const ask = useAskForInfo()
  const decline = useDeclineSuggestion()

  if (!task) {
    return (
      <SheetHeader>
        <SheetTitle>{id}</SheetTitle>
        <SheetDescription>Loading…</SheetDescription>
      </SheetHeader>
    )
  }
  const open = task.status === "suggested"

  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6">{task.title}</SheetTitle>
        <SheetDescription>
          <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="font-mono hover:underline">
            {task.id}
          </Link>{" "}
          · {kindLabel(task)} · {task.where ? WHERE_LABELS[task.where] : "—"}
          {task.wherePath ? ` · ${task.wherePath}` : ""}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <PersonChip person={task.suggestedBy} />
          <span className="text-muted-foreground tabular-nums">
            {task.voteCount === 0 ? "No votes yet" : task.voteCount === 1 ? "1 vote" : `${task.voteCount} votes`}
          </span>
          {task.wantsIt && <Badge variant="outline">Wants to do it</Badge>}
        </div>
        <p className="text-sm whitespace-pre-wrap">{task.body}</p>
        {task.voters.length > 0 && (
          <p className="text-xs text-muted-foreground">+1 from {task.voters.map((v) => `@${v.handle}`).join(", ")}</p>
        )}

        {open ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAction("accept")}>
              <CheckIcon /> Accept
            </Button>
            <Button variant="outline" onClick={() => setAction("ask")}>
              <MessageCircleQuestionIcon /> Ask for info
            </Button>
            <Button variant="outline" onClick={() => setAction("duplicate")}>
              <CopyIcon /> Duplicate
            </Button>
            <Button variant="outline" onClick={() => setAction("decline")}>
              <XIcon /> Decline
            </Button>
          </div>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Triaged: {task.status.replace("_", " ")}.{" "}
            <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="underline underline-offset-2">
              Open {task.id}
            </Link>
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Thread</h3>
          <Thread taskId={task.id} posts={task.posts} canPost />
        </section>
      </div>

      {action === "accept" && (
        <AcceptDialog
          id={task.id}
          wantsIt={task.wantsIt}
          suggester={task.suggestedBy?.handle}
          initial={{ area: task.area, size: task.size, criteria: task.criteria }}
          onClose={() => setAction(null)}
        />
      )}
      {action === "duplicate" && <DuplicateDialog id={task.id} onClose={() => setAction(null)} />}
      {action === "ask" && (
        <ReasonDialog
          title="Ask for more info"
          description="The question goes into the thread as Novawerk. The suggestion stays open with a “needs info” flag."
          label="Question"
          field="question"
          placeholder="Which page was it on? What did you expect?"
          confirmLabel="Ask"
          onSubmit={(question) => ask.mutateAsync({ id: task.id, question }).then(() => toast.success("Asked in the thread"))}
          onClose={() => setAction(null)}
        />
      )}
      {action === "decline" && (
        <ReasonDialog
          title={`Decline ${task.id}?`}
          description="The note shows on the closed suggestion, for everyone."
          label="Note"
          field="note"
          placeholder="Thanks. It's out of scope for this year because…"
          confirmLabel="Decline"
          destructive
          onSubmit={(note) => decline.mutateAsync({ id: task.id, note }).then(() => toast.success(`${task.id} declined`))}
          onClose={() => setAction(null)}
        />
      )}
    </>
  )
}

/** A member's own L or XL task waits here too (kind "task"), with its size. */
const kindLabel = (s: { kind: string; size: TaskSize | null }) =>
  s.kind === "task" ? `Task${s.size ? ` · ${s.size}` : ""}` : s.kind === "bug" ? "Bug" : "Improvement"

function AcceptDialog({
  id,
  wantsIt,
  suggester,
  initial,
  onClose,
}: {
  id: string
  wantsIt: boolean
  suggester?: string
  /** What the author already set (a member's own L or XL task); empty for a suggestion. */
  initial: { area: TaskArea | null; size: TaskSize | null; criteria: string[] }
  onClose: () => void
}) {
  const accept = useAcceptSuggestion()
  const [area, setArea] = React.useState<TaskArea | null>(initial.area)
  const [size, setSize] = React.useState<TaskSize | null>(initial.size)
  const [criteria, setCriteria] = React.useState<string[]>(initial.criteria.length ? initial.criteria : [""])
  const [assign, setAssign] = React.useState(false)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!area || !size) return
    accept.mutate(
      { id, input: { area, size, criteria: cleanLines(criteria), assignToSuggester: assign } },
      {
        onSuccess: (task) => {
          toast.success(assign ? `${task.id} is @${suggester}'s now` : `${task.id} is open on the board`)
          onClose()
        },
        onError: (err) => {
          if (!["area", "size", "criteria"].some((f) => issueFor(err, f))) toast.error("We couldn't accept it", { description: errorMessage(err) })
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Accept {id}</DialogTitle>
            <DialogDescription>Set what a suggestion lacks. “Suggested by” stays on the task for good.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <SizeControl id="accept-size" value={size} onChange={setSize} error={issueFor(accept.error, "size")} />
            <AreaSelect id="accept-area" value={area} onChange={setArea} error={issueFor(accept.error, "area")} />
            <CriteriaEditor id="accept-criteria" value={criteria} onChange={setCriteria} error={issueFor(accept.error, "criteria")} />
            {wantsIt && (
              <SwitchRow
                htmlFor="accept-assign"
                label={`Give it to @${suggester}`}
                description="They asked to do it themselves. Skips proposals."
              >
                <Switch id="accept-assign" checked={assign} onCheckedChange={setAssign} />
              </SwitchRow>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!area || !size || cleanLines(criteria).length === 0 || accept.isPending}>
              {accept.isPending ? "Accepting…" : assign ? "Accept and assign" : "Accept and open"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DuplicateDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const mark = useMarkDuplicate()
  const [of, setOf] = React.useState("NW-")
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            mark.mutate(
              { id, of },
              {
                onSuccess: () => {
                  toast.success(`${id} points to ${of.toUpperCase()}`)
                  onClose()
                },
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>Duplicate of…</DialogTitle>
            <DialogDescription>The suggestion closes and points to the existing task.</DialogDescription>
          </DialogHeader>
          <FormField label="Existing task" htmlFor="dup-of" error={mark.error ? (issueFor(mark.error, "of") ?? errorMessage(mark.error)) : undefined}>
            <Input id="dup-of" value={of} onChange={(e) => setOf(e.target.value)} className="font-mono" autoFocus />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mark.isPending || of.trim().length < 4}>
              Mark duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
