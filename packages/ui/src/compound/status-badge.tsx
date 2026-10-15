import { cva, type VariantProps } from "class-variance-authority"

import { Badge } from "@nw/ui/core/components/ui/badge"
import { cn } from "@nw/ui/lib/utils"

/**
 * One badge for every status enum in packages/db/src/schema.ts.
 * Keep these lists in step with the pgEnums there.
 */
export const STATUS_TONES = {
  submission: {
    new: "info",
    discussing: "warning",
    accepted: "success",
    declined: "neutral",
  },
  application: {
    new: "info",
    reviewing: "warning",
    accepted: "success",
    declined: "neutral",
  },
  project: {
    draft: "neutral",
    planning: "info",
    building: "warning",
    launching: "warning",
    launched: "success",
    archived: "muted",
  },
  post: {
    planned: "neutral",
    drafted: "warning",
    approved: "info",
    published: "success",
    skipped: "muted",
  },
  outbox: {
    pending: "warning",
    approved: "info",
    sent: "success",
    rejected: "neutral",
    failed: "danger",
  },
  partner: {
    intro: "info",
    "follow-up": "warning",
    "grant-ask": "warning",
    renewal: "success",
    closed: "muted",
  },
  task: {
    draft: "neutral",
    suggested: "info",
    open: "info",
    assigned: "warning",
    in_review: "warning",
    done: "success",
    closed: "muted",
    declined: "muted",
    duplicate: "muted",
  },
  proposal: {
    /** An agent's proposal its person hasn't confirmed yet (never in the admin queue). */
    draft: "muted",
    pending: "warning",
    chosen: "success",
    not_chosen: "muted",
    withdrawn: "muted",
  },
} as const satisfies Record<string, Record<string, Tone>>

type Tone = NonNullable<VariantProps<typeof statusBadgeVariants>["tone"]>

export type StatusKind = keyof typeof STATUS_TONES
export type StatusOf<K extends StatusKind> = keyof (typeof STATUS_TONES)[K] & string

export type SubmissionStatus = StatusOf<"submission">
export type ApplicationStatus = StatusOf<"application">
export type ProjectStatus = StatusOf<"project">
export type OutboxStatus = StatusOf<"outbox">
export type PostStatus = StatusOf<"post">
export type PartnerStage = StatusOf<"partner">
export type TaskStatus = StatusOf<"task">

/** The statuses for a kind, in workflow order. Handy for filters and selects. */
export function statusesOf<K extends StatusKind>(kind: K): StatusOf<K>[] {
  return Object.keys(STATUS_TONES[kind]) as StatusOf<K>[]
}

/** Labels that aren't just the value capitalised. */
const LABELS: Record<string, string> = {
  "grant-ask": "Grant ask",
  drafted: "To review",
  in_review: "In review",
  not_chosen: "Not chosen",
}

export function statusLabel(status: string) {
  return LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1)
}

const statusBadgeVariants = cva("gap-1.5 border font-medium", {
  variants: {
    tone: {
      info: "border-info/25 bg-info/10 text-info",
      warning: "border-warning/25 bg-warning/10 text-warning",
      success: "border-success/25 bg-success/10 text-success",
      danger: "border-destructive/25 bg-destructive/10 text-destructive",
      neutral: "border-border bg-muted text-foreground",
      muted: "border-border bg-transparent text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
})

export type StatusBadgeProps<K extends StatusKind> = {
  kind: K
  status: StatusOf<K>
  /** Hide the leading dot, e.g. in dense tables. */
  hideDot?: boolean
  className?: string
}

export function StatusBadge<K extends StatusKind>({
  kind,
  status,
  hideDot,
  className,
}: StatusBadgeProps<K>) {
  const tones = STATUS_TONES[kind] as Record<string, Tone>
  const tone = tones[status] ?? "neutral"
  return (
    <Badge
      variant="outline"
      data-status={status}
      className={cn(statusBadgeVariants({ tone }), className)}
    >
      {!hideDot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {statusLabel(status)}
    </Badge>
  )
}
