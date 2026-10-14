import type * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { cn } from "@nw/ui/lib/utils"

import { formatCount, formatPercent, ratio } from "@/lib/format"

/**
 * One series, one hue: the theme's first chart step. In dark mode the next step down, so the
 * bars sit in the same lightness band as in light mode (checked with the dataviz validator).
 */
export const SERIES_FILL = "bg-chart-1 dark:bg-chart-2"

/** A width for a share bar: 0–100%, never NaN. */
export const barWidth = (share: number | null) => `${Math.min(100, Math.max(0, (share ?? 0) * 100))}%`

/** A titled block of the page: an h2, one line under it, then its cards. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="font-heading text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** A flat card with a small title, for one table or list. */
export function Panel({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card size="sm" className={cn("shadow-none", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  )
}

/** One headline number: a label, the value, a muted line of context. */
export function StatTile({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <Card size="sm" className="gap-1 shadow-none">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

export type BarRow = { key: string; label: React.ReactNode; value: number }

/** Rows with a count, a share of `total` and a thin share bar. */
export function BarList({ rows, total, empty }: { rows: BarRow[]; total: number; empty: string }) {
  if (rows.length === 0 || total === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const share = ratio(row.value, total)
        return (
          <li key={row.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              <Figure value={row.value} share={share} />
            </div>
            <div aria-hidden className="h-1.5">
              <div className={cn("h-full rounded-r-[3px]", SERIES_FILL)} style={{ width: barWidth(share) }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** "412  44%": a count and its share, aligned for a column of rows. */
export function Figure({ value, share }: { value: number; share: number | null }) {
  return (
    <span className="shrink-0 whitespace-nowrap tabular-nums">
      <span className="font-medium">{formatCount(value)}</span>
      <span className="ml-2 inline-block w-9 text-right text-xs text-muted-foreground">{formatPercent(share)}</span>
    </span>
  )
}
