import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FlagIcon, MessagesSquareIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import type { DiscussionFilter } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"

import { PersonChip, ReasonDialog } from "@/components/board/parts"
import { PostItem } from "@/components/board/task-panels"
import { Page } from "@/components/page"
import { contributorsQueryOptions, discussionsQueryOptions, moderationHistoryQueryOptions, useSetSuspended } from "@/lib/board-queries"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { AdminContributor } from "@/lib/types"

/** Reported first: that's where moderation starts. */
const TABS = ["reported", "posts", "contributors"] as const
type Tab = (typeof TABS)[number]
type Search = { tab?: Exclude<Tab, "reported">; hidden?: true }

export const Route = createFileRoute("/_app/moderation")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    tab: search.tab === "posts" || search.tab === "contributors" ? search.tab : undefined,
    hidden: search.hidden === true || search.hidden === "true" ? true : undefined,
  }),
  component: ModerationPage,
})

function ModerationPage() {
  const { tab = "reported", hidden } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: reported = [] } = useQuery(discussionsQueryOptions("reported"))
  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Contributors"
          title="Moderation"
          description="The pledge applies to every thread. Hide what breaks it, lock a thread that runs hot, and suspend an account when talking doesn't help."
        />
      }
    >
      {/* `key` remounts the tabs on every change of the search param, so the highlight always follows the URL. */}
      <Tabs
        key={tab}
        defaultValue={tab}
        onValueChange={(next) => void navigate({ search: next === "reported" ? {} : { tab: next as Exclude<Tab, "reported"> } })}
      >
        <TabsList>
          <TabsTrigger value="reported">
            <FlagIcon /> Reported
            {reported.length > 0 && (
              <Badge variant="outline" className="ml-1 border-warning/25 bg-warning/10 px-1.5 text-warning tabular-nums">
                {reported.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="posts">
            <MessagesSquareIcon /> All posts
          </TabsTrigger>
          <TabsTrigger value="contributors">
            <UsersIcon /> Contributors
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reported" className="pt-4">
          <Posts filter="reported" />
        </TabsContent>
        <TabsContent value="posts" className="flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={hidden ? "outline" : "default"} aria-pressed={!hidden} onClick={() => void navigate({ search: { tab: "posts" } })}>
              Everything
            </Button>
            <Button
              size="sm"
              variant={hidden ? "default" : "outline"}
              aria-pressed={Boolean(hidden)}
              onClick={() => void navigate({ search: { tab: "posts", hidden: true } })}
            >
              Hidden
            </Button>
          </div>
          <Posts filter={hidden ? "hidden" : "all"} />
        </TabsContent>
        <TabsContent value="contributors" className="pt-4">
          <Contributors />
        </TabsContent>
      </Tabs>
    </Page>
  )
}

const EMPTY: Record<DiscussionFilter, { title: string; description: string }> = {
  reported: { title: "Nothing reported", description: "When a contributor reports a post, it waits here until you keep or hide it." },
  hidden: { title: "No hidden posts", description: "Nothing has needed hiding." },
  all: { title: "No posts yet", description: "Posts on any task show here, newest first." },
}

function Posts({ filter }: { filter: DiscussionFilter }) {
  const { data = [], isPending } = useQuery(discussionsQueryOptions(filter))
  if (isPending) return <Skeleton className="h-48 w-full" />
  if (data.length === 0) return <EmptyState icon={<MessagesSquareIcon />} {...EMPTY[filter]} />
  return (
    <ul className="flex flex-col gap-2">
      {data.map((post) => (
        <PostItem key={post.id} post={{ ...post, parentId: null }} showTask moderation={filter === "reported"} />
      ))}
    </ul>
  )
}

const from2xl = { className: "hidden @2xl:table-cell" }

function Contributors() {
  const { data = [], isPending } = useQuery(contributorsQueryOptions)
  const [acting, setActing] = React.useState<AdminContributor | null>(null)
  const setSuspended = useSetSuspended()

  const columns = React.useMemo<ColumnDef<AdminContributor>[]>(
    () => [
      {
        id: "handle",
        accessorKey: "handle",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Contributor" />,
        cell: ({ row }) => {
          const c = row.original
          return (
            <div className="flex w-0 min-w-full flex-col gap-0.5">
              <PersonChip person={c} />
              <span className="truncate text-xs text-muted-foreground">
                {c.displayName} · {c.public ? "public profile" : "private profile"}
                {c.suspendedReason ? ` · ${c.suspendedReason}` : ""}
              </span>
            </div>
          )
        },
      },
      {
        id: "record",
        accessorKey: "done",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Done" />,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.done}
            <span className="text-muted-foreground"> · {row.original.inProgress} in progress</span>
          </span>
        ),
        size: 110,
        meta: from2xl,
      },
      {
        id: "werk",
        accessorKey: "werk",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Werk" />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.werk}</span>,
        size: 80,
        meta: from2xl,
      },
      {
        id: "since",
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground" title={formatDateTime(row.original.createdAt)}>
            {formatRelative(row.original.createdAt)}
          </span>
        ),
        size: 120,
        meta: from2xl,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant={row.original.suspended ? "outline" : "ghost"}
              onClick={(e) => {
                e.stopPropagation()
                setActing(row.original)
              }}
            >
              {row.original.suspended ? "Lift suspension" : "Suspend"}
            </Button>
          </div>
        ),
        size: 140,
        enableSorting: false,
      },
    ],
    [],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(c) => c.id}
        searchPlaceholder="Search contributors"
        emptyState={<EmptyState icon={<UsersIcon />} title="No contributors yet" description="People who sign in at novawerk.io/tasks show here." />}
        toolbar={
          <Badge variant="outline" className="text-muted-foreground">
            {data.filter((c) => c.suspended).length} suspended
          </Badge>
        }
      />
      {acting && (
        <ReasonDialog
          title={acting.suspended ? `Lift @${acting.handle}'s suspension?` : `Suspend @${acting.handle}?`}
          description={
            acting.suspended
              ? "They can propose, post and suggest again, and come back on the wall."
              : "They can still sign in and read, but not propose, post, suggest or vote. They leave the wall, and any task they hold goes back on the board."
          }
          label="Reason (maintainers only)"
          confirmLabel={acting.suspended ? "Lift suspension" : "Suspend"}
          destructive={!acting.suspended}
          onSubmit={(reason) =>
            setSuspended
              .mutateAsync({ id: acting.id, suspended: !acting.suspended, reason })
              .then(() => toast.success(acting.suspended ? `@${acting.handle} can write again` : `@${acting.handle} is suspended`))
          }
          onClose={() => setActing(null)}
        >
          <History id={acting.id} />
        </ReasonDialog>
      )}
    </>
  )
}

/** Earlier suspensions and lifts, for the decision at hand. */
function History({ id }: { id: string }) {
  const { data = [] } = useQuery(moderationHistoryQueryOptions(id))
  if (data.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      {data.map((h, i) => (
        <li key={i}>
          {h.action === "suspended" ? "Suspended" : "Lifted"} by {h.by ?? "a former member"} · {formatRelative(h.at)}: {h.reason}
        </li>
      ))}
    </ul>
  )
}
