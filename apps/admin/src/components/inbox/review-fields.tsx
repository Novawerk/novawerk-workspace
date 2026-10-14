import * as React from "react"

import { StatusBadge, type StatusKind, type StatusOf } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Label } from "@nw/ui/core/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nw/ui/core/components/ui/select"
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import type { MemberSummary } from "@/lib/types"

/** Status picker that shows each option as its badge. */
export function StatusSelect<K extends StatusKind>({
  id,
  kind,
  statuses,
  value,
  onChange,
  disabled,
  lockedStatuses = [],
  label = "Status",
}: {
  id: string
  kind: K
  statuses: readonly StatusOf<K>[]
  value: StatusOf<K>
  onChange: (value: StatusOf<K>) => void
  disabled?: boolean
  /** Statuses only a dedicated action may set (e.g. "accepted"); shown but not pickable. */
  lockedStatuses?: readonly StatusOf<K>[]
  label?: string
}) {
  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(next) => next && onChange(next as StatusOf<K>)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(current: string) => <StatusBadge kind={kind} status={current as StatusOf<K>} />}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {statuses.map((status) => (
            <SelectItem key={status} value={status} disabled={status !== value && lockedStatuses.includes(status)}>
              <StatusBadge kind={kind} status={status} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const NOBODY = "__nobody__"

/**
 * Pick one member, or nobody. Lists active members; the current value still shows (by name, or
 * by id if it isn't in the list) so an inactive reviewer or owner never disappears silently.
 */
export function MemberSelect({
  id,
  label,
  members,
  value,
  onChange,
  disabled,
  emptyLabel = "Unassigned",
}: {
  id: string
  label: string
  members: MemberSummary[]
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  emptyLabel?: string
}) {
  const options = React.useMemo(() => {
    const list = members
      .filter((m) => m.active || m.id === value)
      .map((m) => ({ value: m.id, label: m.active ? m.displayName : `${m.displayName} (inactive)` }))
    if (value && !list.some((m) => m.value === value)) list.push({ value, label: value })
    return [{ value: NOBODY, label: emptyLabel }, ...list]
  }, [members, value, emptyLabel])

  return (
    <div className="flex min-w-40 flex-1 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={options}
        value={value ?? NOBODY}
        onValueChange={(next) => onChange(!next || next === NOBODY ? null : String(next))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Reviewer picker for pitches and applications. */
export function ReviewerSelect(props: Omit<React.ComponentProps<typeof MemberSelect>, "label">) {
  return <MemberSelect label="Reviewer" {...props} />
}

/** Internal notes with an explicit save, so half-typed notes don't hit the API. */
export function NotesField({
  id,
  value,
  onSave,
  saving,
}: {
  id: string
  value: string | null
  onSave: (value: string | null) => void
  saving?: boolean
}) {
  const [draft, setDraft] = React.useState(value ?? "")
  const saved = value ?? ""
  // Follow the server value when it changes underneath us (e.g. after a save).
  React.useEffect(() => setDraft(value ?? ""), [value])

  const dirty = draft.trim() !== saved.trim()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Notes</Label>
      <Textarea
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Only members see these notes."
        className="min-h-24"
      />
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={saving}>
            Discard
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSave(draft.trim() ? draft.trim() : null)}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </div>
  )
}
