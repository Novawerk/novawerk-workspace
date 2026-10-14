import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"

import { INITIATOR_ROLE } from "@nw/contracts"
import { Button } from "@nw/ui/core/components/ui/button"
import { Input } from "@nw/ui/core/components/ui/input"

import { MemberSelect } from "@/components/inbox/review-fields"
import type { MemberSummary } from "@/lib/types"

export type TeamRow = { memberId: string; role: string }

/** The project team as an editable list. Saved together with the project. */
export function TeamEditor({
  members,
  value,
  onChange,
  error,
}: {
  members: MemberSummary[]
  value: TeamRow[]
  onChange: (team: TeamRow[]) => void
  error?: string
}) {
  const [adding, setAdding] = React.useState<string | null>(null)
  const [role, setRole] = React.useState("")
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? id
  const available = members.filter((m) => !value.some((t) => t.memberId === m.id))

  const add = () => {
    if (!adding || !role.trim()) return
    onChange([...value, { memberId: adding, role: role.trim() }])
    setAdding(null)
    setRole("")
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {value.map((row, index) => (
            <li key={row.memberId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={row.memberId}>
                {nameOf(row.memberId)}
              </span>
              <Input
                aria-label={`Role of ${nameOf(row.memberId)}`}
                value={row.role}
                onChange={(e) => onChange(value.map((t, i) => (i === index ? { ...t, role: e.target.value } : t)))}
                className="h-8 w-32"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${nameOf(row.memberId)}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t pt-3">
        <MemberSelect
          id="team-add-member"
          label="Add someone"
          members={available}
          value={adding}
          onChange={setAdding}
          emptyLabel="Pick a member"
        />
        <div className="flex gap-2">
          <Input
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder={value.length === 0 ? INITIATOR_ROLE : "Developer, Design…"}
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={!adding || !role.trim()}>
            <PlusIcon /> Add
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
