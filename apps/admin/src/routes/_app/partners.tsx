import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { HandshakeIcon, PlusIcon, Trash2Icon, UserIcon } from "lucide-react"
import { toast } from "sonner"

import { PARTNER_STAGES, toHandle, type PartnerStage } from "@nw/contracts"
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
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"

import { FormField } from "@/components/form-field"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { DraftReplyDialog } from "@/components/inbox/draft-reply-dialog"
import { RelatedEmails } from "@/components/inbox/related-emails"
import { MemberSelect, StatusSelect } from "@/components/inbox/review-fields"
import { Page } from "@/components/page"
import { errorMessage, issueFor } from "@/lib/errors"
import { formatRelative } from "@/lib/format"
import { membersQueryOptions, partnersQueryOptions, useDeletePartner, useSavePartner } from "@/lib/queries"
import type { MemberSummary, Partner } from "@/lib/types"

type Search = { id?: string }

export const Route = createFileRoute("/_app/partners")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    id: typeof search.id === "string" && search.id ? search.id : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(partnersQueryOptions),
  component: PartnersPage,
})

const STAGE_HINTS: Record<PartnerStage, string> = {
  intro: "Found, not yet talked to",
  "follow-up": "In conversation",
  "grant-ask": "We asked for support",
  renewal: "Supporting us; renewal coming",
  closed: "Done, either way",
}

function PartnersPage() {
  const { id } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data = [], isPending } = useQuery(partnersQueryOptions)
  const { data: members = [] } = useQuery(membersQueryOptions)
  const [adding, setAdding] = React.useState(false)
  const editing = id ? data.find((p) => p.id === id) : undefined

  return (
    <Page
      width="wide"
      header={
        <PageHeader
          eyebrow="Organisation"
          title="Partners"
          description="Sponsors and partners, by stage. The story of each one lives in records/partners/."
          actions={
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add partner
            </Button>
          }
        />
      }
    >
      {!isPending && data.length === 0 ? (
        <EmptyState
          icon={<HandshakeIcon />}
          title="No partners yet"
          description="Add one by hand. The sponsor-discovery agent adds intro-stage candidates every Tuesday."
        />
      ) : (
        // One stage under the other on a phone; five columns side by side (scrolling if need be) from md.
        <div className="md:-mx-6 md:overflow-x-auto md:px-6 md:pb-2">
          <div className="grid gap-3 md:min-w-[1000px] md:grid-cols-5">
            {PARTNER_STAGES.map((stage) => {
              const inStage = data.filter((p) => p.stage === stage)
              return (
                <section key={stage} aria-label={stage} className="flex min-w-0 flex-col gap-2 rounded-xl bg-muted/40 p-2">
                  <header className="flex items-center justify-between gap-2 px-1 pt-1">
                    <StatusBadge kind="partner" status={stage} />
                    <span className="text-xs text-muted-foreground tabular-nums">{isPending ? "" : inStage.length}</span>
                  </header>
                  <p className="px-1 text-xs text-muted-foreground">{STAGE_HINTS[stage]}</p>
                  {isPending ? (
                    <Skeleton className="h-20 w-full rounded-lg" />
                  ) : (
                    inStage.map((partner) => (
                      <PartnerCard
                        key={partner.id}
                        partner={partner}
                        members={members}
                        onOpen={() => void navigate({ search: { id: partner.id } })}
                      />
                    ))
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}
      {adding && <PartnerDialog members={members} onClose={() => setAdding(false)} />}
      {editing && (
        <PartnerDialog
          key={editing.id}
          partner={editing}
          members={members}
          onClose={() => void navigate({ search: {} })}
        />
      )}
    </Page>
  )
}

function PartnerCard({ partner, members, onOpen }: { partner: Partner; members: MemberSummary[]; onOpen: () => void }) {
  const owner = partner.owner ? (members.find((m) => m.id === partner.owner)?.displayName ?? partner.owner) : null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5 text-left text-sm shadow-xs outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="font-medium">{partner.name}</span>
      {partner.primaryContact && <span className="text-xs text-muted-foreground">{partner.primaryContact}</span>}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {owner && (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3" /> {owner}
          </span>
        )}
        <span>{partner.lastTouchAt ? `Last touch ${formatRelative(partner.lastTouchAt)}` : "No contact yet"}</span>
      </span>
    </button>
  )
}

/** Add (no `partner`) or edit a partner. Mounted only while open, so each one starts fresh. */
function PartnerDialog({
  partner,
  members,
  onClose,
}: {
  partner?: Partner
  members: MemberSummary[]
  onClose: () => void
}) {
  const save = useSavePartner()
  const remove = useDeletePartner()
  const [name, setName] = React.useState(partner?.name ?? "")
  const [id, setId] = React.useState(partner?.id ?? "")
  const [idTouched, setIdTouched] = React.useState(Boolean(partner))
  const [stage, setStage] = React.useState<PartnerStage>(partner?.stage ?? "intro")
  const [contact, setContact] = React.useState(partner?.primaryContact ?? "")
  const [email, setEmail] = React.useState(partner?.primaryEmail ?? "")
  const [owner, setOwner] = React.useState<string | null>(partner?.owner ?? null)
  const [lastTouch, setLastTouch] = React.useState(partner?.lastTouchAt?.slice(0, 10) ?? "")

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    // A date input gives a day; store it as midday UTC so no time zone moves it to another day.
    const lastTouchAt = lastTouch ? `${lastTouch}T12:00:00.000Z` : null
    const fields = { name, stage, primaryContact: contact, primaryEmail: email, owner, lastTouchAt }
    save.mutate(partner ? { id: partner.id, patch: fields } : { input: { id, ...fields } }, {
      onSuccess: (saved) => {
        toast.success(partner ? `Saved ${saved.name}` : `Added ${saved.name}`)
        onClose()
      },
      onError: (err) => {
        const known = ["id", "name", "primaryContact", "primaryEmail", "owner", "lastTouchAt"]
        if (!known.some((f) => issueFor(err, f))) toast.error("We couldn't save that", { description: errorMessage(err) })
      },
    })
  }

  const onDelete = () => {
    if (!partner) return
    remove.mutate(partner.id, {
      onSuccess: () => {
        toast.success(`Deleted ${partner.name}`, { description: "Ledger entries keep their amounts and lose the link." })
        onClose()
      },
      onError: (err) => toast.error("We couldn't delete it", { description: errorMessage(err) }),
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{partner ? partner.name : "Add a partner"}</DialogTitle>
            <DialogDescription>
              {partner ? (
                <>
                  Record: <code className="font-mono text-xs">records/partners/{partner.id}.md</code>
                </>
              ) : (
                "A sponsor, a funder or anyone we work with."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="partner-name" error={issueFor(save.error, "name")}>
              <Input
                id="partner-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!idTouched) setId(toHandle(e.target.value, 80))
                }}
                required
                autoFocus={!partner}
              />
            </FormField>
            {!partner && (
              <FormField
                label="Id"
                htmlFor="partner-id"
                error={issueFor(save.error, "id")}
                hint="Matches its record file name, e.g. acme-foundation. It can't change later."
              >
                <Input
                  id="partner-id"
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value)
                    setIdTouched(true)
                  }}
                  className="font-mono"
                  required
                />
              </FormField>
            )}
            <div className="flex flex-wrap gap-3">
              <StatusSelect
                id="partner-stage"
                kind="partner"
                label="Stage"
                statuses={PARTNER_STAGES}
                value={stage}
                onChange={setStage}
              />
              <MemberSelect id="partner-owner" label="Owner" members={members} value={owner} onChange={setOwner} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Contact person" htmlFor="partner-contact" error={issueFor(save.error, "primaryContact")}>
                <Input id="partner-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
              </FormField>
              <FormField label="Contact email" htmlFor="partner-email" error={issueFor(save.error, "primaryEmail")}>
                <Input id="partner-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
            </div>
            <FormField
              label="Last touch"
              htmlFor="partner-touch"
              error={issueFor(save.error, "lastTouchAt")}
              hint="Moves by itself when an approved email to them goes out."
            >
              <Input id="partner-touch" type="date" value={lastTouch} onChange={(e) => setLastTouch(e.target.value)} />
            </FormField>
            {partner && <RelatedEmails table="partners" id={partner.id} />}
          </div>
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {partner && (
                <ConfirmAction
                  trigger={
                    <Button type="button" variant="destructive" disabled={remove.isPending}>
                      <Trash2Icon /> Delete
                    </Button>
                  }
                  variant="destructive"
                  title={`Delete ${partner.name}?`}
                  description="The partner row goes. Its record file and ledger entries stay."
                  confirmLabel="Delete"
                  onConfirm={onDelete}
                />
              )}
              {partner?.primaryEmail && (
                <DraftReplyDialog
                  triggerLabel="Draft email"
                  to={partner.primaryEmail}
                  subject={`Novawerk and ${partner.name}`}
                  body={`Hi ${partner.primaryContact?.split(/\s+/)[0] ?? "there"},\n\n[What we want to say.]\n\nAll the best,\nNovawerk`}
                  related={{ table: "partners", id: partner.id }}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : partner ? "Save" : "Add partner"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
