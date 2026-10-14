import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  InboxIcon,
  PencilIcon,
  SendIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { OUTBOX_STATUSES, type OutboxStatus } from "@nw/contracts"
import { DataTable, DataTableColumnHeader, type ColumnDef } from "@nw/ui/compound/data-table"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"
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
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import { FormField } from "@/components/form-field"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { DetailSkeleton } from "@/components/inbox/detail-skeleton"
import { InboxSplitView } from "@/components/inbox/inbox-split-view"
import { StatusFilter } from "@/components/inbox/status-filter"
import { errorMessage, issueFor } from "@/lib/errors"
import { formatDateTime, formatRelative } from "@/lib/format"
import { draftedByLabel } from "@/lib/labels"
import {
  membersQueryOptions,
  outboxEmailQueryOptions,
  outboxQueryOptions,
  useApproveOutbox,
  useRejectOutbox,
  useUpdateOutbox,
} from "@/lib/queries"
import type { MemberSummary, OutboxEmail } from "@/lib/types"

/** `status` defaults to pending: what needs a member. "all" shows everything. */
type Search = { status?: OutboxStatus | "all"; id?: string }

export const Route = createFileRoute("/_app/outbox")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    status: search.status === "all" ? "all" : OUTBOX_STATUSES.find((s) => s === search.status),
    id: typeof search.id === "string" && search.id ? search.id : undefined,
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(outboxQueryOptions(filterOf(deps.status))),
  component: OutboxPage,
})

const filterOf = (status: Search["status"]) =>
  status === "all" ? {} : { status: status ?? ("pending" as const) }

const ABOUT = {
  project_submissions: { label: "Pitch", to: "/inbox/projects" },
  member_applications: { label: "Application", to: "/inbox/applications" },
  partners: { label: "Partner", to: "/partners" },
} as const

function OutboxPage() {
  const { status, id } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data = [], isPending } = useQuery(outboxQueryOptions(filterOf(status)))
  const { data: members = [] } = useQuery(membersQueryOptions)

  const columns = React.useMemo<ColumnDef<OutboxEmail>[]>(
    () => [
      {
        id: "email",
        accessorFn: (row) => `${row.subject} ${row.to} ${row.draftedBy}`,
        header: () => "Email",
        cell: ({ row }) => (
          <div className="flex w-0 min-w-full flex-col gap-0.5">
            <span className="truncate font-medium">{row.original.subject}</span>
            <span className="truncate text-xs text-muted-foreground">
              To {row.original.to} · {draftedByLabel(row.original.draftedBy, members)} ·{" "}
              {formatRelative(row.original.createdAt)}
            </span>
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => OUTBOX_STATUSES.indexOf(row.status),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" className="float-right" />,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <StatusBadge kind="outbox" status={row.original.status} />
          </div>
        ),
        size: 110,
      },
    ],
    [members],
  )

  const shown = status === "all" ? undefined : (status ?? "pending")

  return (
    <InboxSplitView
      hasSelection={Boolean(id)}
      header={
        <PageHeader
          eyebrow="Inbox"
          title="Outbox"
          description="Every email to someone outside Novawerk waits here. Nothing leaves until a member approves it."
        />
      }
      list={
        <>
          <StatusFilter
            statuses={OUTBOX_STATUSES}
            value={shown}
            onChange={(next) => void navigate({ search: (prev) => ({ ...prev, status: next ?? "all" }) })}
          />
          <DataTable
            className="min-h-0 flex-1"
            columns={columns}
            data={data}
            isLoading={isPending}
            getRowId={(row) => row.id}
            selectedRowId={id}
            onRowClick={(row) => void navigate({ search: (prev) => ({ ...prev, id: row.id }) })}
            searchPlaceholder="Search emails"
            emptyState={
              <EmptyState
                variant="plain"
                icon={<InboxIcon />}
                title={shown === "pending" ? "Nothing waiting for approval" : shown ? `No ${shown} emails` : "No emails yet"}
                description="Drafts from agents and from “Draft reply” land here."
              />
            }
          />
        </>
      }
      detail={
        id ? (
          <OutboxDetail
            key={id}
            id={id}
            members={members}
            onBack={() => void navigate({ search: (prev) => ({ ...prev, id: undefined }) })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              variant="plain"
              icon={<SendIcon />}
              title="Pick an email"
              description="Read it, fix it if needed, then approve or reject it."
            />
          </div>
        )
      }
    />
  )
}

function OutboxDetail({ id, members, onBack }: { id: string; members: MemberSummary[]; onBack: () => void }) {
  const { data: email, isPending, error } = useQuery(outboxEmailQueryOptions(id))

  if (isPending) return <DetailSkeleton />
  if (error || !email) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
          <ArrowLeftIcon /> Back
        </Button>
        <p className="text-sm text-destructive">{error?.message ?? "We can't find this email."}</p>
      </div>
    )
  }

  const nameOf = (memberId: string | null) =>
    memberId ? (members.find((m) => m.id === memberId)?.displayName ?? memberId) : "—"
  const about = email.relatedTable && email.relatedId ? ABOUT[email.relatedTable as keyof typeof ABOUT] : undefined

  return (
    <article className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-col gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 w-fit lg:hidden">
            <ArrowLeftIcon /> All emails
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="font-heading text-2xl font-semibold tracking-tight break-words">{email.subject}</h2>
              <p className="text-sm text-muted-foreground">
                To <span className="font-medium text-foreground">{email.to}</span>
              </p>
            </div>
            <StatusBadge kind="outbox" status={email.status} className="mt-1" />
          </div>
        </header>

        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Drafted by</dt>
          <dd>
            {draftedByLabel(email.draftedBy, members)} · {formatDateTime(email.createdAt)}
          </dd>
          {about && (
            <>
              <dt className="text-muted-foreground">About</dt>
              <dd>
                <Link
                  to={about.to}
                  search={{ id: email.relatedId! }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {about.label}
                  {about.label === "Partner" ? ` ${email.relatedId}` : ""}
                </Link>
              </dd>
            </>
          )}
          {email.approvedAt && (
            <>
              <dt className="text-muted-foreground">{email.status === "rejected" ? "Rejected by" : "Approved by"}</dt>
              <dd>
                {nameOf(email.approvedBy)} · {formatDateTime(email.approvedAt)}
              </dd>
            </>
          )}
          {email.status === "sent" && email.sentAt && (
            <>
              <dt className="text-muted-foreground">Sent</dt>
              <dd>{formatDateTime(email.sentAt)}</dd>
            </>
          )}
        </dl>

        <StateNotice email={email} />

        <section className="rounded-lg border bg-card">
          <h3 className="border-b px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Message
          </h3>
          <div className="px-4 py-4 text-sm leading-relaxed break-words whitespace-pre-wrap">{email.body}</div>
        </section>

        <Actions email={email} />
      </div>
    </article>
  )
}

/** Why this email is where it is, when that isn't obvious from the badge. */
function StateNotice({ email }: { email: OutboxEmail }) {
  if (email.status === "failed") {
    return (
      <Notice tone="danger" icon={<CircleAlertIcon />}>
        Resend refused it: {email.error ?? "no reason given"}. Fix the cause, then approve it again.
      </Notice>
    )
  }
  if (email.status === "approved" && !email.sentAt) {
    return (
      <Notice tone="warning" icon={<TriangleAlertIcon />}>
        Approved, not sent yet. The API had no Resend key when it was approved. Press Send once the key is set.
      </Notice>
    )
  }
  if (email.status === "approved" && email.sentAt) {
    return (
      <Notice tone="warning" icon={<TriangleAlertIcon />}>
        A send started and never finished. Check Resend's log before trying again (docs/runbook.md, “Approve an
        email”).
      </Notice>
    )
  }
  return null
}

function Notice({ tone, icon, children }: { tone: "danger" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === "danger"
          ? "flex gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
          : "flex gap-2 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
      }
    >
      {icon}
      <p>{children}</p>
    </div>
  )
}

function Actions({ email }: { email: OutboxEmail }) {
  const approve = useApproveOutbox()
  const reject = useRejectOutbox()
  const [editing, setEditing] = React.useState(false)
  const busy = approve.isPending || reject.isPending

  const canApprove = email.status === "pending" || email.status === "failed" || (email.status === "approved" && !email.sentAt)
  const canReject = (email.status === "pending" || email.status === "failed" || email.status === "approved") && !email.sentAt
  if (!canApprove && !canReject) return null

  const approveLabel =
    email.status === "pending" ? "Approve and send" : email.status === "failed" ? "Approve again" : "Send now"

  const onApprove = () =>
    approve.mutate(email.id, {
      onSuccess: (result) => {
        if (result.sent) toast.success(`Sent to ${result.email.to}`)
        else if (result.email.status === "failed") toast.error("Approved, but Resend refused it", { description: result.note })
        else toast.warning("Approved, not sent", { description: result.note })
      },
      onError: (err) => toast.error("We couldn't approve it", { description: errorMessage(err) }),
    })

  const onReject = () =>
    reject.mutate(email.id, {
      onSuccess: () => toast.success("Rejected. It will never be sent."),
      onError: (err) => toast.error("We couldn't reject it", { description: errorMessage(err) }),
    })

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      {canApprove && (
        <ConfirmAction
          trigger={
            <Button disabled={busy}>
              <CheckIcon /> {approve.isPending ? "Sending…" : approveLabel}
            </Button>
          }
          disabled={busy}
          title="Send this email?"
          description={
            <>
              It goes to <strong className="text-foreground">{email.to}</strong> from info@novawerk.io as soon as you
              confirm. You can't call it back.
            </>
          }
          confirmLabel={approveLabel}
          onConfirm={onApprove}
        />
      )}
      {email.status === "pending" && (
        <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>
          <PencilIcon /> Edit
        </Button>
      )}
      {canReject && (
        <ConfirmAction
          trigger={
            <Button variant="destructive" disabled={busy}>
              <XIcon /> Reject
            </Button>
          }
          disabled={busy}
          variant="destructive"
          title="Reject this email?"
          description="It stays here for the record and can never be sent. Draft a new one if you still want to write."
          confirmLabel="Reject"
          onConfirm={onReject}
        />
      )}
      {editing && <EditEmailDialog email={email} onClose={() => setEditing(false)} />}
    </div>
  )
}

function EditEmailDialog({ email, onClose }: { email: OutboxEmail; onClose: () => void }) {
  const update = useUpdateOutbox()
  const [to, setTo] = React.useState(email.to)
  const [subject, setSubject] = React.useState(email.subject)
  const [body, setBody] = React.useState(email.body)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    update.mutate(
      { id: email.id, patch: { to, subject, body } },
      {
        onSuccess: () => {
          toast.success("Saved. It still waits for approval.")
          onClose()
        },
        onError: (err) => {
          if (!["to", "subject", "body"].some((f) => issueFor(err, f))) {
            toast.error("We couldn't save it", { description: errorMessage(err) })
          }
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Edit before approval</DialogTitle>
            <DialogDescription>Changes keep it pending. Someone still approves it afterwards.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="To" htmlFor="edit-to" error={issueFor(update.error, "to")}>
              <Input id="edit-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
            </FormField>
            <FormField label="Subject" htmlFor="edit-subject" error={issueFor(update.error, "subject")}>
              <Input id="edit-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </FormField>
            <FormField label="Message" htmlFor="edit-body" error={issueFor(update.error, "body")}>
              <Textarea
                id="edit-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="max-h-96 min-h-56"
                required
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
