// Small pieces the Contributors pages share: labels, the size control, a person chip, and a
// dialog that asks for a reason before it acts.

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react"

import {
  TASK_AREAS,
  TASK_SIZES,
  TASK_SIZE_HINTS,
  TASK_SIZE_WERK,
  type ProposalEta,
  type SuggestionWhere,
  type TaskArea,
  type TaskEventKind,
  type TaskSize,
} from "@nw/contracts"
import { StatusBadge, type TaskStatus } from "@nw/ui/compound/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@nw/ui/core/components/ui/avatar"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { ButtonGroup } from "@nw/ui/core/components/ui/button-group"
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
import { Textarea } from "@nw/ui/core/components/ui/textarea"
import { cn } from "@nw/ui/lib/utils"

import { FormField } from "@/components/form-field"
import { suggestionScreenshotQueryOptions } from "@/lib/board-queries"
import { errorMessage, issueFor } from "@/lib/errors"
import { initials } from "@/lib/format"
import type { AdminPerson } from "@/lib/types"

export const AREA_LABELS: Record<TaskArea, string> = {
  web: "Website",
  admin: "Admin panel",
  api: "API",
  agents: "Agents",
  docs: "Docs",
  ci: "CI",
  posts: "Posts tooling",
}

export const WHERE_LABELS: Record<SuggestionWhere, string> = {
  site: "Website",
  admin: "Admin panel",
  api: "API",
  agents: "Agents",
  posts: "Posts tooling",
  videos: "Videos",
  unsure: "Not sure",
}

export const ETA_LABELS: Record<ProposalEta, string> = {
  days: "A few days",
  week: "About a week",
  two_weeks: "Two weeks",
}

export const EVENT_LABELS: Record<TaskEventKind, string> = {
  created: "Created",
  published: "Published",
  suggested: "Suggested",
  info_requested: "Asked for more info",
  accepted: "Accepted",
  declined: "Declined",
  duplicate: "Marked as a duplicate",
  assigned: "Assigned",
  released: "Released",
  pr_linked: "Pull request linked",
  pr_closed: "Pull request closed",
  merged: "Merged",
  closed: "Closed",
  inactivity_reminder: "Reminded: no activity for a week",
  extended: "Got a week more",
  reopened: "Reopened",
  thread_locked: "Thread locked",
  thread_unlocked: "Thread unlocked",
  member_posted: "A maintainer posted",
  edited: "Edited",
  proposal_declined: "A plan was declined",
  post_hidden: "A post was hidden",
  post_unhidden: "A post was shown again",
  reports_dismissed: "Reports on a post looked at, post kept",
  werk_adjusted: "Werk adjusted",
}

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <StatusBadge kind="task" status={status} className={className} />
}

/** "M · 3 Werk", or a dash for a suggestion without a size yet. */
export function SizeLabel({ size }: { size: TaskSize | null }) {
  if (!size) return <span className="text-muted-foreground">—</span>
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="font-medium">{size}</span>
      <span className="text-muted-foreground"> · {TASK_SIZE_WERK[size]} Werk</span>
    </span>
  )
}

/** S / M / L / XL as one segmented control, with the chosen size's hint under it. */
export function SizeControl({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: TaskSize | null
  onChange: (size: TaskSize) => void
  error?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={`${id}-label`}>Size</Label>
      <ButtonGroup aria-labelledby={`${id}-label`} className="w-full">
        {TASK_SIZES.map((size) => (
          <Button
            key={size}
            type="button"
            variant={value === size ? "default" : "outline"}
            aria-pressed={value === size}
            className="flex-1 tabular-nums"
            onClick={() => onChange(size)}
          >
            {size}
            <span className={cn("text-xs", value === size ? "opacity-80" : "text-muted-foreground")}>{TASK_SIZE_WERK[size]}</span>
          </Button>
        ))}
      </ButtonGroup>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{value ? TASK_SIZE_HINTS[value] : "Pick how big it is. The number is its Werk."}</p>
      )}
    </div>
  )
}

export function AreaSelect({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: TaskArea | null
  onChange: (area: TaskArea) => void
  error?: string
}) {
  const items = TASK_AREAS.map((a) => ({ value: a, label: AREA_LABELS[a] }))
  return (
    <FormField label="Area" htmlFor={id} error={error}>
      <Select items={items} value={value} onValueChange={(next) => next && onChange(next as TaskArea)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Pick an area" />
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
  )
}

/** @handle with an avatar. Suspended people get a mark. */
export function PersonChip({ person, className }: { person: AdminPerson | null; className?: string }) {
  if (!person) return <span className={cn("text-muted-foreground", className)}>—</span>
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)} title={person.displayName}>
      <Avatar className="size-5">
        {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
        <AvatarFallback className="text-[10px]">{initials(person.displayName)}</AvatarFallback>
      </Avatar>
      <span className="truncate">@{person.handle}</span>
      {person.suspended && (
        <Badge variant="outline" className="border-destructive/25 bg-destructive/10 text-destructive">
          Suspended
        </Badge>
      )}
    </span>
  )
}

export function StaleBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-warning/25 bg-warning/10 text-warning" title="No activity for a week: the reminder went out">
      <TriangleAlertIcon className="size-3" /> Stale
    </Badge>
  )
}

export function TaskLink({ id, children }: { id: string; children?: React.ReactNode }) {
  return (
    <Link to="/tasks/$taskId" params={{ taskId: id }} className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline">
      {children ?? id}
    </Link>
  )
}

/** A task's screenshot, framed; a click opens it full size in a new tab. */
export function ScreenshotLink({ id, src }: { id: string; src: string }) {
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Open ${id} screenshot at full size`}
      className="block overflow-hidden rounded-md border bg-muted/30"
    >
      <div className="flex h-64 items-center justify-center p-3">
        <img
          src={src}
          alt={`Screenshot attached to ${id}`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <span className="flex items-center gap-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <ExternalLinkIcon className="size-3" />
        Open full size
      </span>
    </a>
  )
}

/** Loads a private screenshot when no public URL is available. */
export function Screenshot({
  id,
  attached,
  publicUrl,
}: {
  id: string
  attached: boolean
  publicUrl: string | null
}) {
  const { data: blob, isPending, isError, error, refetch } = useQuery({
    ...suggestionScreenshotQueryOptions(id),
    enabled: attached && !publicUrl,
  })

  const [url, setUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  if (publicUrl) {
    return <ScreenshotLink id={id} src={publicUrl} />
  }

  if (!attached) {
    return null
  }

  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
        <span className="text-destructive">
          We couldn’t load the screenshot: {errorMessage(error)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (isPending || !url) {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Loading screenshot…
      </p>
    )
  }

  return <ScreenshotLink id={id} src={url} />
}

/**
 * Asks for a reason (or a note, a question) and then acts. Mounted only while open, so each one
 * starts empty. `onSubmit` returns the mutation's promise: errors show under the field.
 */
export function ReasonDialog({
  title,
  description,
  label,
  placeholder,
  initial = "",
  confirmLabel,
  destructive,
  field = "reason",
  onSubmit,
  onClose,
  children,
}: {
  title: string
  description: React.ReactNode
  label: string
  placeholder?: string
  initial?: string
  confirmLabel: string
  destructive?: boolean
  /** The API's field name for this text, so its error shows here. */
  field?: string
  onSubmit: (text: string) => Promise<unknown>
  onClose: () => void
  children?: React.ReactNode
}) {
  const [text, setText] = React.useState(initial)
  const [error, setError] = React.useState<unknown>(null)
  const [pending, setPending] = React.useState(false)
  const id = React.useId()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit(text.trim())
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  const fieldError = issueFor(error, field)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <FormField label={label} htmlFor={id} error={fieldError}>
            <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} rows={4} autoFocus />
          </FormField>
          {error !== null && !fieldError && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || !text.trim()}>
              {pending ? "Saving…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Done-when lines: one input per line, add and remove. */
export function CriteriaEditor({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string[]
  onChange: (lines: string[]) => void
  error?: string
}) {
  const lines = value.length ? value : [""]
  const set = (i: number, text: string) => onChange(lines.map((l, j) => (j === i ? text : l)))
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-0`}>Done when</Label>
      <ol className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <Input
              id={`${id}-${i}`}
              value={line}
              onChange={(e) => set(i, e.target.value)}
              placeholder={i === 0 ? "e.g. The list shows six skeleton rows while it loads" : "Another line"}
              aria-label={`Done-when line ${i + 1}`}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove line ${i + 1}`}
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              disabled={lines.length === 1 && !line}
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, ""])} disabled={lines.length >= 12}>
          Add a line
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">How a reviewer knows it's done. One check per line.</p>
      )}
    </div>
  )
}

/** Drop empty done-when lines before saving. */
export const cleanLines = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean)
