import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CircleCheckIcon, CircleIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { deliverableInput } from "@nw/contracts"
import { statusLabel } from "@nw/ui/compound/status-badge"
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

import { FormField } from "@/components/form-field"
import { MemberSelect } from "@/components/inbox/review-fields"
import { AddPostButton } from "@/components/posts/add-post"
import { COLUMNS, ColumnHeads, Columns, momentLabel } from "@/components/posts/board"
import { errorMessage, issueFor, issuesFromParse } from "@/lib/errors"
import { formatDate, formatDateTime, todayIso } from "@/lib/format"
import {
  deliverablesQueryOptions,
  membersQueryOptions,
  postsQueryOptions,
  projectHistoryQueryOptions,
  useSaveDeliverable,
} from "@/lib/queries"
import type { Deliverable, Project } from "@/lib/types"

// ─── Deliverables ────────────────────────────────────────────────────────────

/** The Deliverables tab: one artifact, one owner, what "done" means, a date. */
export function Deliverables({ projectId }: { projectId: string }) {
  const { data = [], isPending } = useQuery(deliverablesQueryOptions(projectId))
  const save = useSaveDeliverable(projectId)
  const [editing, setEditing] = React.useState<Deliverable | "new" | null>(null)

  const toggle = (d: Deliverable) =>
    save.mutate(
      { id: d.id, patch: { doneOn: d.doneOn ? null : todayIso() } },
      { onError: (err) => toast.error("We couldn't save it", { description: errorMessage(err) }) },
    )

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Deliverables</CardTitle>
          <CardDescription>One artifact, one owner, what “done” means, a date. The posts are written from these.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing("new")}>
          <PlusIcon /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. A project counts as started once its first deliverable has an owner and a date.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.map((d) => (
              <li key={d.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <button
                  type="button"
                  onClick={() => toggle(d)}
                  disabled={save.isPending}
                  aria-label={d.doneOn ? `Mark “${d.title}” open again` : `Mark “${d.title}” done`}
                  className="mt-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {d.doneOn ? <CircleCheckIcon className="size-5 text-success" /> : <CircleIcon className="size-5" />}
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={d.doneOn ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
                    {d.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      d.ownerName ?? "No owner",
                      d.doneOn ? `done ${formatDate(d.doneOn)}` : d.dueOn ? `due ${formatDate(d.dueOn)}` : "no date",
                      d.doneWhen && `done when: ${d.doneWhen}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit “${d.title}”`}
                  onClick={() => setEditing(d)}
                >
                  <PencilIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && (
        <DeliverableDialog
          projectId={projectId}
          deliverable={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function DeliverableDialog({
  projectId,
  deliverable,
  onClose,
}: {
  projectId: string
  deliverable?: Deliverable
  onClose: () => void
}) {
  const { data: members = [] } = useQuery(membersQueryOptions)
  const save = useSaveDeliverable(projectId)
  const [title, setTitle] = React.useState(deliverable?.title ?? "")
  const [ownerId, setOwnerId] = React.useState<string | null>(deliverable?.ownerId ?? null)
  const [doneWhen, setDoneWhen] = React.useState(deliverable?.doneWhen ?? "")
  const [dueOn, setDueOn] = React.useState(deliverable?.dueOn ?? "")
  const [doneOn, setDoneOn] = React.useState(deliverable?.doneOn ?? "")
  const [issues, setIssues] = React.useState<Record<string, string[]>>({})
  const errorOf = (field: string) => issues[field]?.[0] ?? issueFor(save.error, field)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const input = { title, ownerId, doneWhen, dueOn: dueOn || null, doneOn: doneOn || null }
    const parsed = deliverableInput.safeParse(input)
    if (!parsed.success) return setIssues(issuesFromParse(parsed.error))
    setIssues({})
    save.mutate(deliverable ? { id: deliverable.id, patch: input } : { input }, {
      onSuccess: () => {
        toast.success(deliverable ? "Saved" : "Deliverable added")
        onClose()
      },
      onError: (err) => toast.error("We couldn't save it", { description: errorMessage(err) }),
    })
  }

  const remove = () =>
    deliverable &&
    save.mutate(
      { id: deliverable.id, remove: true },
      {
        onSuccess: () => {
          toast.success(`Deleted “${deliverable.title}”`)
          onClose()
        },
        onError: (err) => toast.error("We couldn't delete it", { description: errorMessage(err) }),
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{deliverable ? "Edit deliverable" : "Add a deliverable"}</DialogTitle>
            <DialogDescription>Small enough to ship by the date. One named owner.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Artifact" htmlFor="deliverable-title" error={errorOf("title")}>
              <Input
                id="deliverable-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Seed list of 20 restaurants"
                required
              />
            </FormField>
            <MemberSelect id="deliverable-owner" label="Owner" members={members} value={ownerId} onChange={setOwnerId} emptyLabel="No owner yet" />
            <FormField label="Done when" htmlFor="deliverable-done-when" error={errorOf("doneWhen")}>
              <Input
                id="deliverable-done-when"
                value={doneWhen}
                onChange={(e) => setDoneWhen(e.target.value)}
                placeholder="Public on Notion, one line per place"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Due" htmlFor="deliverable-due" error={errorOf("dueOn")}>
                <Input id="deliverable-due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
              </FormField>
              <FormField label="Done on" htmlFor="deliverable-done" error={errorOf("doneOn")} hint="Empty while open.">
                <Input id="deliverable-done" type="date" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} />
              </FormField>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            {deliverable ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={remove} disabled={save.isPending}>
                <Trash2Icon /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Posts ───────────────────────────────────────────────────────────────────

/** The Posts tab: this project's posts by status, and what comes up next. */
export function ProjectPosts({ project }: { project: Project }) {
  const { data = [], isPending } = useQuery(postsQueryOptions({ projectId: project.id }))
  const skipped = data.filter((p) => p.status === "skipped")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Lifecycle posts are planned from the stage and the launch date, and the promo agent drafts them. Add anything
          else by hand. Open one to edit, approve and mark it posted.
        </p>
        <AddPostButton projectId={project.id} variant="outline" size="sm" />
      </div>
      <ColumnHeads posts={data} columns={COLUMNS} />
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Columns posts={data} columns={COLUMNS} today={todayIso()} />
      )}
      {skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Skipped:{" "}
          {skipped.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && ", "}
              <Link to="/posts/$postId" params={{ postId: p.id }} className="underline-offset-4 hover:underline">
                {momentLabel(p.kind, p.seq, p.label)}
              </Link>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────

/** The Timeline tab: every status change, who made it, when. */
export function Timeline({ projectId }: { projectId: string }) {
  const { data = [] } = useQuery(projectHistoryQueryOptions(projectId))
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No status changes recorded yet. The timeline starts with the next one.</p>
  }
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3 border-l pl-4">
          {data.map((change) => (
            <li key={change.id} className="relative flex flex-col gap-0.5 text-sm">
              <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-border" />
              <span>
                {change.fromStatus ? (
                  <>
                    {statusLabel(change.fromStatus)} → <span className="font-medium">{statusLabel(change.toStatus)}</span>
                  </>
                ) : (
                  <>
                    Created as <span className="font-medium">{statusLabel(change.toStatus)}</span>
                  </>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {[change.changedByName, formatDateTime(change.changedAt)].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
