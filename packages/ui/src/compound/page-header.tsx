import type * as React from "react"

import { cn } from "@nw/ui/lib/utils"

export type PageHeaderProps = {
  title: React.ReactNode
  description?: React.ReactNode
  /** Small line above the title, e.g. the sidebar group ("Inbox"). */
  eyebrow?: React.ReactNode
  /** Buttons or filters on the right. */
  actions?: React.ReactNode
  className?: string
}

/** The title block at the top of every admin page. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && (
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
