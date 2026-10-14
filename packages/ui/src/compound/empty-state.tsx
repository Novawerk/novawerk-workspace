import type * as React from "react"

import { Badge } from "@nw/ui/core/components/ui/badge"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@nw/ui/core/components/ui/empty"
import { cn } from "@nw/ui/lib/utils"

export type EmptyStateProps = {
  /** A lucide icon element, e.g. `<UsersIcon />`. */
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** A small pill above the title, e.g. "Coming next". */
  badge?: React.ReactNode
  /** Buttons or links under the text. */
  children?: React.ReactNode
  /** `card` draws a dashed frame; `plain` sits inside an existing surface. */
  variant?: "card" | "plain"
  className?: string
}

/** What a screen shows when there is nothing to list yet (or the feature isn't built yet). */
export function EmptyState({
  icon,
  title,
  description,
  badge,
  children,
  variant = "card",
  className,
}: EmptyStateProps) {
  return (
    <Empty
      className={cn(
        variant === "card" && "border border-dashed bg-muted/30",
        variant === "plain" && "p-6",
        className
      )}
    >
      <EmptyHeader>
        {icon && (
          <EmptyMedia
            variant="icon"
            className="size-12 rounded-xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-6"
          >
            {icon}
          </EmptyMedia>
        )}
        {badge && (
          <Badge variant="outline" className="text-muted-foreground">
            {badge}
          </Badge>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}
