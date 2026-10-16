import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ShieldCheckIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { toHandle } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Avatar, AvatarFallback } from "@nw/ui/core/components/ui/avatar"
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
import { Switch } from "@nw/ui/core/components/ui/switch"

import { FormField, SwitchRow } from "@/components/form-field"
import { Page } from "@/components/page"
import { errorMessage, issueFor } from "@/lib/errors"
import { formatDate, initials } from "@/lib/format"
import { meQueryOptions, membersQueryOptions, useCreateMember, useUpdateMember } from "@/lib/queries"
import type { Member } from "@/lib/types"

type Search = { id?: string }

export const Route = createFileRoute("/_app/members")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    id: typeof search.id === "string" && search.id ? search.id : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(membersQueryOptions),
  component: MembersPage,
})

// Narrow table (a phone): one column. Email, role and status move into the member cell.
const from2xl = { className: "hidden @2xl:table-cell" }

const columns: ColumnDef<Member>[] = [
  {
    id: "member",
    accessorFn: (row) => `${row.displayName} ${row.id} ${row.email}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
    sortingFn: (a, b) => a.original.displayName.localeCompare(b.original.displayName),
    cell: ({ row }) => (
      <div className="flex w-0 min-w-full items-center gap-3">
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg text-xs">{initials(row.original.displayName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{row.original.displayName}</span>
            {row.original.role === "maintainer" && (
              <ShieldCheckIcon aria-label="Maintainer" className="size-3.5 shrink-0 text-muted-foreground @2xl:hidden" />
            )}
          </span>
          <span className="hidden truncate font-mono text-xs text-muted-foreground @2xl:block">{row.original.id}</span>
          <span className="truncate text-xs text-muted-foreground @2xl:hidden">
            {row.original.email}
            {row.original.active ? "" : " · Inactive"}
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "email",
    accessorKey: "email",
    header: () => "Email",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
    meta: from2xl,
  },
  {
    id: "access",
    accessorFn: (row) => (row.role === "maintainer" ? 1 : 0),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
    cell: ({ row }) =>
      row.original.role === "maintainer" ? (
        <Badge variant="outline" className="gap-1">
          <ShieldCheckIcon /> Maintainer
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    size: 110,
    meta: from2xl,
  },
  {
    id: "active",
    accessorFn: (row) => (row.active ? 1 : 0),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) =>
      row.original.active ? (
        <Badge variant="outline" className="border-success/25 bg-success/10 text-success">
          Active
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Inactive
        </Badge>
      ),
    size: 110,
    meta: from2xl,
  },
  {
    id: "joined",
    accessorFn: (row) => row.joinedOn ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />,
    cell: ({ row }) => (row.original.joinedOn ? formatDate(row.original.joinedOn) : "—"),
    size: 130,
    meta: { className: "hidden @3xl:table-cell" },
  },
]

function MembersPage() {
  const { id } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data = [], isPending } = useQuery(membersQueryOptions)
  const [adding, setAdding] = React.useState(false)
  const editing = id ? data.find((m) => m.id === id) : undefined
  const activeCount = data.filter((m) => m.active).length

  const close = () => void navigate({ search: {} })

  return (
    <Page
      header={
        <PageHeader
          eyebrow="Organisation"
          title="Members"
          description={`Everyone in Novawerk, one account each. Maintainers run Novawerk; there are no other ranks. ${activeCount} active.`}
          actions={
            <Button onClick={() => setAdding(true)}>
              <UserPlusIcon /> Add member
            </Button>
          }
        />
      }
    >
      <DataTable
        columns={columns}
        data={data}
        isLoading={isPending}
        getRowId={(row) => row.id}
        selectedRowId={id}
        onRowClick={(row) => void navigate({ search: { id: row.id } })}
        searchPlaceholder="Search members"
        emptyState={
          <EmptyState
            variant="plain"
            icon={<UsersIcon />}
            title="No members yet"
            description="Accept an application, or add someone by hand."
          />
        }
      />
      {/* Mounted only while open, so each "Add member" starts from a fresh form. */}
      {adding && <MemberDialog open onOpenChange={setAdding} />}
      {editing && (
        <MemberDialog key={editing.id} member={editing} open onOpenChange={(open) => !open && close()} />
      )}
    </Page>
  )
}

/** Add a member (no `member`), or edit one. Handle and email stay fixed once created. Mount it fresh. */
function MemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member?: Member
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: me } = useQuery(meQueryOptions)
  const create = useCreateMember()
  const update = useUpdateMember()
  const mutation = member ? update : create
  const isSelf = member?.id === me?.id

  const [displayName, setDisplayName] = React.useState(member?.displayName ?? "")
  const [handle, setHandle] = React.useState(member?.id ?? "")
  const [handleTouched, setHandleTouched] = React.useState(Boolean(member))
  const [email, setEmail] = React.useState(member?.email ?? "")
  const [maintainer, setMaintainer] = React.useState(member?.role === "maintainer")
  const role = maintainer ? ("maintainer" as const) : ("member" as const)
  const [active, setActive] = React.useState(member?.active ?? true)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const onError = (err: unknown) => {
      const fields = ["id", "displayName", "email", "role", "active"]
      if (!fields.some((f) => issueFor(err, f))) toast.error("We couldn't save that", { description: errorMessage(err) })
    }
    if (member) {
      update.mutate(
        { id: member.id, patch: { displayName: displayName.trim(), role, active } },
        {
          onSuccess: (saved) => {
            toast.success(`Saved ${saved.displayName}`)
            onOpenChange(false)
          },
          onError,
        },
      )
    } else {
      create.mutate(
        { id: handle.trim(), displayName: displayName.trim(), email: email.trim(), role },
        {
          onSuccess: (saved) => {
            toast.success(`${saved.displayName} is a member now`, {
              description:
                saved.role === "maintainer" ? "They sign in on novawerk.io with that address (Google or a code)." : undefined,
            })
            onOpenChange(false)
          },
          onError,
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{member ? member.displayName : "Add a member"}</DialogTitle>
            <DialogDescription>
              {member
                ? `Handle ${member.id} · ${member.email}`
                : "Most members arrive through an accepted application. Add someone here when they joined another way."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="member-name" error={issueFor(mutation.error, "displayName")}>
              <Input
                id="member-name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  if (!handleTouched) setHandle(toHandle(e.target.value))
                }}
                required
                autoFocus={!member}
              />
            </FormField>
            {!member && (
              <>
                <FormField
                  label="Handle"
                  htmlFor="member-handle"
                  error={issueFor(create.error, "id")}
                  hint="Their id everywhere in Novawerk, e.g. ada-lovelace. It can't change later."
                >
                  <Input
                    id="member-handle"
                    value={handle}
                    onChange={(e) => {
                      setHandle(e.target.value)
                      setHandleTouched(true)
                    }}
                    className="font-mono"
                    required
                  />
                </FormField>
                <FormField
                  label="Email"
                  htmlFor="member-email"
                  error={issueFor(create.error, "email")}
                  hint="They sign in on novawerk.io with it: Google or an emailed code."
                >
                  <Input
                    id="member-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </FormField>
              </>
            )}
            <SwitchRow
              label="Maintainer"
              htmlFor="member-admin"
              description={
                isSelf
                  ? "You can't stop being a maintainer yourself."
                  : "Runs Novawerk: the whole panel. Without it, members see only their projects. Not a rank."
              }
            >
              <Switch id="member-admin" aria-label="Maintainer" checked={maintainer} onCheckedChange={setMaintainer} disabled={isSelf && maintainer} />
            </SwitchRow>
            {member && (
              <SwitchRow
                label="Active"
                htmlFor="member-active"
                description={
                  isSelf ? "You can't mark yourself inactive." : "Inactive members can't sign in or approve emails."
                }
              >
                <Switch id="member-active" aria-label="Active" checked={active} onCheckedChange={setActive} disabled={isSelf && active} />
              </SwitchRow>
            )}
            {(issueFor(mutation.error, "role") ?? issueFor(mutation.error, "active")) && (
              <p role="alert" className="text-xs text-destructive">
                {issueFor(mutation.error, "role") ?? issueFor(mutation.error, "active")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : member ? "Save" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
