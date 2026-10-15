// The pieces of a task the detail page and the queues show: a proposal with its actions, the
// "choose this plan" dialog, the thread with moderation and a member's reply, and the timeline.

import * as React from "react"
import { BanIcon, CheckIcon, EyeIcon, EyeOffIcon, FlagIcon, LockIcon, LockOpenIcon, MessageSquareIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { MEMBER_ONLY_EVENT_KINDS } from "@nw/contracts"
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
import { Label } from "@nw/ui/core/components/ui/label"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Textarea } from "@nw/ui/core/components/ui/textarea"
import { cn } from "@nw/ui/lib/utils"

import { ETA_LABELS, EVENT_LABELS, PersonChip, ReasonDialog, TaskLink } from "@/components/board/parts"
import {
  useChooseProposal,
  useDeclineProposal,
  useKeepPost,
  usePostOnTask,
  useSetPostHidden,
  useSetSuspended,
  useSetThreadLocked,
} from "@/lib/board-queries"
import { errorMessage } from "@/lib/errors"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { AdminPost, AdminProposal, AdminTaskEvent } from "@/lib/types"

const NOT_CHOSEN_NOTE = "Thanks for the plan. We picked another one this time."

/** One plan: who, their record, what they'll change and test, and (while pending) the actions. */
export function ProposalCard({
  proposal,
  others,
  onAsk,
  showTask,
}: {
  proposal: AdminProposal
  /** The other pending plans on the task: they get notes when this one is chosen. */
  others: AdminProposal[]
  /** "Ask in the thread": opens the composer for this task. */
  onAsk?: () => void
  showTask?: boolean
}) {
  const [choosing, setChoosing] = React.useState(false)
  const [declining, setDeclining] = React.useState(false)
  const decline = useDeclineProposal()
  const p = proposal
  const pending = p.status === "pending"

  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PersonChip person={p.author} className="font-medium" />
          <span className="text-xs text-muted-foreground">
            {p.record.done} done · {p.record.inProgress} in progress
          </span>
          {showTask && <TaskLink id={p.taskId} />}
        </div>
        <div className="flex items-center gap-2">
          {!pending && <StatusBadge kind="proposal" status={p.status} />}
          <span className="text-xs text-muted-foreground" title={formatDateTime(p.createdAt)}>
            {formatRelative(p.createdAt)}
          </span>
        </div>
      </header>
      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">What they'll change</h4>
        <p className="whitespace-pre-wrap">{p.approach}</p>
      </div>
      {p.testing && (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">How they'll test it</h4>
          <p className="whitespace-pre-wrap">{p.testing}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Timeline: {ETA_LABELS[p.eta]}</p>
      {p.declineNote && (
        <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
          Note to them (private): {p.declineNote}
        </p>
      )}
      {pending && (
        <footer className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setChoosing(true)} disabled={p.author.suspended}>
            <CheckIcon /> Choose this plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDeclining(true)}>
            <XIcon /> Decline
          </Button>
          {onAsk && (
            <Button size="sm" variant="ghost" onClick={onAsk}>
              <MessageSquareIcon /> Ask in the thread
            </Button>
          )}
        </footer>
      )}
      {choosing && <ChooseDialog proposal={p} others={others} onClose={() => setChoosing(false)} />}
      {declining && (
        <ReasonDialog
          title={`Decline @${p.author.handle}'s plan?`}
          description="The task stays open for other plans. Only they read the note."
          label="Note to them"
          field="note"
          initial={NOT_CHOSEN_NOTE}
          confirmLabel="Decline"
          onSubmit={(note) =>
            decline.mutateAsync({ id: p.id, note }).then(() => toast.success(`Declined @${p.author.handle}'s plan`))
          }
          onClose={() => setDeclining(false)}
        />
      )}
    </article>
  )
}

/** One confirm assigns the task; each other plan gets an editable private note. */
function ChooseDialog({ proposal, others, onClose }: { proposal: AdminProposal; others: AdminProposal[]; onClose: () => void }) {
  const choose = useChooseProposal()
  const [notes, setNotes] = React.useState<Record<string, string>>(() => Object.fromEntries(others.map((o) => [o.id, NOT_CHOSEN_NOTE])))

  const confirm = () =>
    choose.mutate(
      { id: proposal.id, notes },
      {
        onSuccess: (task) => {
          toast.success(`${task.id} is @${proposal.author.handle}'s now`)
          onClose()
        },
      },
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Give {proposal.taskId} to @{proposal.author.handle}?</DialogTitle>
          <DialogDescription>
            They get the task and its contribution guide.
            {others.length > 0 ? " The other plans are declined with these notes; only each author reads theirs." : ""}
          </DialogDescription>
        </DialogHeader>
        {others.length > 0 && (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {others.map((o) => (
              <div key={o.id} className="flex flex-col gap-1.5">
                <Label htmlFor={`note-${o.id}`}>Note to @{o.author.handle}</Label>
                <Textarea
                  id={`note-${o.id}`}
                  rows={2}
                  value={notes[o.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}
        {choose.error && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(choose.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={choose.isPending}>
            {choose.isPending ? "Assigning…" : "Choose this plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function authorLabel(author: AdminPost["author"]) {
  if (author.kind === "contributor") return `@${author.person.handle}`
  if (author.kind === "member") return `${author.name} · Novawerk`
  return "A former contributor"
}

/** One post with its hide / show action. */
export function PostItem({
  post,
  showTask,
  onReply,
  moderation,
}: {
  post: AdminPost
  showTask?: boolean
  onReply?: () => void
  /** The Reported queue: also lock the thread or suspend the author from here. */
  moderation?: boolean
}) {
  const [dialog, setDialog] = React.useState<"hide" | "keep" | "lock" | "suspend" | null>(null)
  const setHidden = useSetPostHidden()
  const keep = useKeepPost()
  const lock = useSetThreadLocked()
  const suspend = useSetSuspended()
  const author = post.author.kind === "contributor" ? post.author.person : null
  return (
    <li className={cn("flex flex-col gap-1.5 rounded-lg border p-3 text-sm", post.parentId && "ml-6", post.hidden && "border-dashed bg-muted/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {post.author.kind === "contributor" ? (
            <PersonChip person={post.author.person} className="font-medium" />
          ) : (
            <span className="font-medium">{authorLabel(post.author)}</span>
          )}
          {showTask && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              on <TaskLink id={post.taskId} /> <span className="truncate">{post.taskTitle}</span>
            </span>
          )}
          {post.hidden && (
            <Badge variant="outline" className="text-muted-foreground">
              Hidden
            </Badge>
          )}
        </span>
        <span className="text-xs text-muted-foreground" title={formatDateTime(post.createdAt)}>
          {formatRelative(post.createdAt)}
        </span>
      </div>
      <p className={cn("whitespace-pre-wrap", post.hidden && "text-muted-foreground")}>{post.body}</p>
      {post.reports.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-warning/25 bg-warning/10 px-2.5 py-1.5 text-xs">
          <span className="flex items-center gap-1 font-medium text-warning">
            <FlagIcon className="size-3" /> Reported {post.reports.length === 1 ? "once" : `${post.reports.length} times`}
          </span>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {post.reports.map((r, i) => (
              <li key={i}>
                @{r.by}
                {r.reason ? `: ${r.reason}` : ""} · {formatRelative(r.createdAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {post.hidden && post.hiddenReason && (
        <p className="text-xs text-muted-foreground">
          Why it's hidden (members only): {post.hiddenReason}. The public sees “Hidden by Novawerk: off-topic or spam”.
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {onReply && !post.parentId && (
          <Button size="xs" variant="ghost" onClick={onReply}>
            Reply
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => setDialog("hide")}>
          {post.hidden ? <EyeIcon /> : <EyeOffIcon />} {post.hidden ? "Show again" : "Hide"}
        </Button>
        {post.reports.length > 0 && !post.hidden && (
          <Button size="xs" variant="ghost" onClick={() => setDialog("keep")}>
            <CheckIcon /> Keep
          </Button>
        )}
        {moderation && (
          <Button size="xs" variant="ghost" onClick={() => setDialog("lock")}>
            {post.threadLocked ? <LockOpenIcon /> : <LockIcon />} {post.threadLocked ? "Unlock thread" : "Lock thread"}
          </Button>
        )}
        {moderation && author && !author.suspended && (
          <Button size="xs" variant="ghost" onClick={() => setDialog("suspend")}>
            <BanIcon /> Suspend @{author.handle}
          </Button>
        )}
      </div>
      {dialog === "lock" && (
        <ReasonDialog
          title={post.threadLocked ? `Unlock the thread on ${post.taskId}?` : `Lock the thread on ${post.taskId}?`}
          description={
            post.threadLocked
              ? "Contributors can post on the task again."
              : "No new posts from contributors until you unlock it. The timeline shows it, with your reason."
          }
          label="Public reason"
          placeholder={post.threadLocked ? "Calm again" : "Heated; we pick it up again on Monday"}
          confirmLabel={post.threadLocked ? "Unlock" : "Lock thread"}
          onSubmit={(reason) =>
            lock
              .mutateAsync({ id: post.taskId, locked: !post.threadLocked, reason })
              .then(() => toast.success(post.threadLocked ? "Thread open again" : "Thread locked"))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "suspend" && author && (
        <ReasonDialog
          title={`Suspend @${author.handle}?`}
          description="They can still sign in and read, but not propose, post, suggest or vote. They leave the wall."
          label="Reason (members only)"
          confirmLabel="Suspend"
          destructive
          onSubmit={(reason) =>
            suspend.mutateAsync({ id: author.id, suspended: true, reason }).then(() => toast.success(`@${author.handle} is suspended`))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "keep" && (
        <ReasonDialog
          title="Keep this post?"
          description="It stays as it is. Its reports leave the Reported list; a new report brings it back."
          label="Reason (members only)"
          placeholder="Fine in context"
          confirmLabel="Keep post"
          onSubmit={(reason) => keep.mutateAsync({ id: post.id, reason }).then(() => toast.success("Post kept"))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "hide" && (
        <ReasonDialog
          title={post.hidden ? "Show this post again?" : "Hide this post?"}
          description={
            post.hidden
              ? "It shows on the task again, with its author."
              : "It keeps its place on the task without its text or author. A security report? Hide it and email it to security@novawerk.io."
          }
          label="Reason (members only)"
          placeholder={post.hidden ? "Not spam after all" : "Off-topic, spam…"}
          confirmLabel={post.hidden ? "Show again" : "Hide post"}
          destructive={!post.hidden}
          onSubmit={(reason) =>
            setHidden
              .mutateAsync({ id: post.id, hidden: !post.hidden, reason })
              .then(() => toast.success(post.hidden ? "The post shows again" : "Post hidden"))
          }
          onClose={() => setDialog(null)}
        />
      )}
    </li>
  )
}

/** The thread on one task, with a member's post or reply at the bottom. */
export function Thread({
  taskId,
  posts,
  canPost,
  composerRef,
}: {
  taskId: string
  posts: AdminPost[]
  canPost: boolean
  composerRef?: React.RefObject<HTMLTextAreaElement | null>
}) {
  const send = usePostOnTask()
  const [body, setBody] = React.useState("")
  const [replyTo, setReplyTo] = React.useState<AdminPost | null>(null)
  const ordered = posts
    .filter((p) => !p.parentId)
    .flatMap((p) => [p, ...posts.filter((r) => r.parentId === p.id)])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    send.mutate(
      { id: taskId, body: body.trim(), ...(replyTo ? { replyTo: replyTo.id } : {}) },
      {
        onSuccess: () => {
          setBody("")
          setReplyTo(null)
          toast.success("Posted as Novawerk")
        },
        onError: (err) => toast.error("We couldn't post it", { description: errorMessage(err) }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((p) => (
            <PostItem
              key={p.id}
              post={p}
              onReply={
                canPost
                  ? () => {
                      setReplyTo(p)
                      composerRef?.current?.focus()
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      {canPost && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Label htmlFor={`compose-${taskId}`}>
            {replyTo ? `Reply to ${authorLabel(replyTo.author)}` : "Post as Novawerk"}
          </Label>
          <Textarea
            ref={composerRef}
            id={`compose-${taskId}`}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A question, a pointer, an answer. Everyone can read it."
          />
          <div className="flex justify-end gap-2">
            {replyTo && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                Cancel reply
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!body.trim() || send.isPending}>
              {send.isPending ? "Posting…" : "Post"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Every event, newest last. Members-only kinds are marked. */
export function Timeline({ events }: { events: AdminTaskEvent[] }) {
  const memberOnly = new Set<string>(MEMBER_ONLY_EVENT_KINDS)
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>
  return (
    <ol className="flex flex-col gap-2.5 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative flex flex-col gap-0.5 text-sm">
          <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full border bg-background" />
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-medium">{EVENT_LABELS[e.kind] ?? e.kind}</span>
            {memberOnly.has(e.kind) && <span className="text-xs text-muted-foreground">members only</span>}
          </span>
          <span className="text-xs text-muted-foreground">
            {e.actor ? (e.actor.kind === "member" ? e.actor.name : `@${e.actor.handle}`) : "GitHub"} · {formatDateTime(e.createdAt)}
          </span>
          {e.note && <span className="text-xs whitespace-pre-wrap text-muted-foreground">{e.note}</span>}
        </li>
      ))}
    </ol>
  )
}
