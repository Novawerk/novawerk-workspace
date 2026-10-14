import type * as React from "react"

import { Label } from "@nw/ui/core/components/ui/label"
import { cn } from "@nw/ui/lib/utils"

/** Label, control, then either the error or a hint. Pass the control's `id` as `htmlFor`. */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor: string
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** A labelled switch row: the text on the left, the control on the right. */
export function SwitchRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  )
}
