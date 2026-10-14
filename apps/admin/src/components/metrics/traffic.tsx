import * as React from "react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@nw/ui/core/components/ui/table"
import { cn } from "@nw/ui/lib/utils"

import { formatCount, formatDate, formatDayLabel, formatShortDate } from "@/lib/format"
import { countryName, regionLabel } from "@/lib/labels"
import type { AdminMetrics } from "@/lib/types"

import { BarList, Panel, SERIES_FILL, Section } from "./parts"

type Traffic = AdminMetrics["traffic"]
type Day = Traffic["daily"][number]

export function TrafficSection({ traffic }: { traffic: Traffic }) {
  const devices = traffic.devices.mobile + traffic.devices.desktop
  return (
    <Section
      id="metrics-traffic"
      title="Traffic"
      description="A visit is one page load and what follows it. No cookies, so one person on two days is two visits."
    >
      <Panel title="Visits per day" description="Hover or tap a day for its page views.">
        <DailyChart daily={traffic.daily} />
      </Panel>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Top pages" description="Share of page views">
          <BarList
            total={traffic.pageViews}
            empty="No page views in this range."
            rows={traffic.topPages.map((p) => ({
              key: p.path,
              label: <span className="font-mono text-xs">{p.path}</span>,
              value: p.views,
            }))}
          />
        </Panel>
        <Panel title="Top referrers" description="Other sites that sent visits">
          <BarList
            total={traffic.visits}
            empty="No visits from other sites yet."
            rows={traffic.topReferrers.map((r) => ({ key: r.host, label: r.host, value: r.visits }))}
          />
        </Panel>
        <Panel title="Campaigns" description="Visits with a utm_source">
          <BarList
            total={traffic.visits}
            empty="No campaign links used in this range."
            rows={traffic.topCampaigns.map((c) => ({ key: c.source, label: c.source, value: c.visits }))}
          />
        </Panel>
        <Panel title="Devices" description="Share of visits">
          <BarList
            total={devices}
            empty="No visits in this range."
            rows={[
              { key: "mobile", label: "Phone", value: traffic.devices.mobile },
              { key: "desktop", label: "Desktop", value: traffic.devices.desktop },
            ]}
          />
        </Panel>
      </div>
      <LocationPanel traffic={traffic} />
    </Section>
  )
}

function LocationPanel({ traffic }: { traffic: Traffic }) {
  return (
    <Panel
      title="Where visitors are"
      description="Country and region from the IP address, which we don't store. Share of visits."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Countries</h3>
          <BarList
            total={traffic.visits}
            empty="No visits we could place."
            rows={traffic.topCountries.map((c) => ({ key: c.country, label: countryName(c.country), value: c.visits }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Regions</h3>
          <BarList
            total={traffic.visits}
            empty="No visits we could place."
            rows={traffic.topRegions.map((r) => ({ key: r.region, label: regionLabel(r.region), value: r.visits }))}
          />
        </div>
      </div>
      {traffic.unknownLocation > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatCount(traffic.unknownLocation)} {traffic.unknownLocation === 1 ? "visit" : "visits"} we couldn't place.
        </p>
      )}
    </Panel>
  )
}

/** 0 and round steps (1, 2 or 5 × 10ⁿ) up to at least `max`. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0]
  const rough = max / 3
  const pow = 10 ** Math.floor(Math.log10(rough))
  const unit = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow)
  const ticks = [0]
  while (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + unit)
  return ticks
}

/** Visits per day as columns, one hue. Page views show on hover, tap or arrow keys. */
function DailyChart({ daily }: { daily: Day[] }) {
  const [active, setActive] = React.useState<number | null>(null)
  const n = daily.length
  const max = daily.reduce((m, d) => Math.max(m, d.visits), 0)
  const ticks = niceTicks(max)
  const top = Math.max(1, ticks[ticks.length - 1] ?? 1)
  // About six date labels, always including the newest day.
  const labelEvery = n <= 8 ? 1 : Math.ceil(n / 6)
  const current = active === null ? undefined : daily[active]
  const peak = daily.find((d) => d.visits === max)

  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || n === 0) return
    const index = Math.floor(((event.clientX - rect.left) / rect.width) * n)
    setActive(Math.min(n - 1, Math.max(0, index)))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (n === 0) return
    const last = n - 1
    const next: Record<string, () => number | null> = {
      ArrowLeft: () => (active === null ? last : Math.max(0, active - 1)),
      ArrowRight: () => (active === null ? 0 : Math.min(last, active + 1)),
      Home: () => 0,
      End: () => last,
      Escape: () => null,
    }
    const move = next[event.key]
    if (!move) return
    event.preventDefault()
    setActive(move())
  }

  const summary =
    n === 0
      ? "No days in this range."
      : `Visits per day from ${formatDate(daily[0]!.date)} to ${formatDate(daily[n - 1]!.date)}.` +
        (peak && max > 0 ? ` Busiest day: ${formatDayLabel(peak.date)} with ${formatCount(max)} visits.` : "") +
        " Use the arrow keys to read each day."

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div aria-hidden className="relative h-40 w-8 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(tick / top) * 100}%` }}>
              {formatCount(tick)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="group"
            aria-roledescription="chart"
            aria-label={summary}
            tabIndex={0}
            className="relative h-40 touch-pan-y rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(event) => event.pointerType === "mouse" && setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKeyDown}
          >
            {ticks.map((tick) => (
              <div
                key={tick}
                aria-hidden
                className="absolute inset-x-0 border-t border-border"
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
            <div aria-hidden className="absolute inset-0 flex">
              {daily.map((day, i) => (
                <div
                  key={day.date}
                  className={cn(
                    "flex flex-1 items-end justify-center rounded-t-sm",
                    n > 45 ? "px-[0.5px]" : "px-px",
                    active === i && "bg-muted",
                  )}
                >
                  <div
                    className={cn("w-full max-w-6 rounded-t-[4px]", SERIES_FILL)}
                    style={{ height: `${(day.visits / top) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            {max === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                No visits in this range.
              </p>
            )}
            {current && active !== null && <DayTooltip day={current} index={active} count={n} />}
          </div>
          <div aria-hidden className="relative mt-1.5 h-4 text-[11px] text-muted-foreground tabular-nums">
            {daily.map((day, i) =>
              (n - 1 - i) % labelEvery === 0 ? (
                <span
                  key={day.date}
                  className="absolute whitespace-nowrap"
                  style={i === n - 1 ? { right: 0 } : { left: `${((i + 0.5) / n) * 100}%`, transform: "translateX(-50%)" }}
                >
                  {formatShortDate(day.date)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {current
          ? `${formatDayLabel(current.date)}: ${formatCount(current.visits)} visits, ${formatCount(current.pageViews)} page views`
          : ""}
      </p>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Show the numbers
        </summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Page views</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...daily].reverse().map((day) => (
                <TableRow key={day.date}>
                  <TableCell>{formatDayLabel(day.date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(day.visits)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCount(day.pageViews)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  )
}

/** The readout for one day, kept inside the plot so the card never clips it. */
function DayTooltip({ day, index, count }: { day: Day; index: number; count: number }) {
  const center = (index + 0.5) / count
  const style: React.CSSProperties =
    center < 0.2
      ? { left: `${(index / count) * 100}%` }
      : center > 0.8
        ? { right: `${((count - index - 1) / count) * 100}%` }
        : { left: `${center * 100}%`, transform: "translateX(-50%)" }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={style}
    >
      <p className="text-muted-foreground">{formatDayLabel(day.date)}</p>
      <p>
        <span className="font-semibold tabular-nums">{formatCount(day.visits)}</span> visits
      </p>
      <p>
        <span className="font-semibold tabular-nums">{formatCount(day.pageViews)}</span> page views
      </p>
    </div>
  )
}
