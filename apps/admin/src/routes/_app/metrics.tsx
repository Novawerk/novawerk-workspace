import type * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { TriangleAlertIcon } from "lucide-react"

import { METRICS_RANGES } from "@nw/contracts"
import { EmptyState } from "@nw/ui/compound/empty-state"
import { PageHeader } from "@nw/ui/compound/page-header"
import { Button } from "@nw/ui/core/components/ui/button"
import { Skeleton } from "@nw/ui/core/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"
import { cn } from "@nw/ui/lib/utils"

import { InboxNowSection } from "@/components/metrics/inbox-now"
import { IntakeSection } from "@/components/metrics/intake"
import { StatTile } from "@/components/metrics/parts"
import { TrafficSection } from "@/components/metrics/traffic"
import { AgentsSection, CtaSection, FormsSection } from "@/components/metrics/usage"
import { Page } from "@/components/page"
import { errorMessage } from "@/lib/errors"
import { formatCount, formatDate, formatPercent, ratio } from "@/lib/format"
import { metricsQueryOptions } from "@/lib/queries"
import type { AdminMetrics } from "@/lib/types"

type Range = (typeof METRICS_RANGES)[number]
const DEFAULT_RANGE: Range = 30

/** `days` is left out of the URL for the default range. */
type Search = { days?: Range }

export const Route = createFileRoute("/_app/metrics")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const days = METRICS_RANGES.find((r) => r === Number(search.days))
    return { days: days === DEFAULT_RANGE ? undefined : days }
  },
  loaderDeps: ({ search }) => ({ days: search.days ?? DEFAULT_RANGE }),
  loader: async ({ context, deps, cause }) => {
    const options = metricsQueryOptions(deps.days)
    // A new range keeps the page up, dimmed, while its numbers load (see MetricsPage).
    if (cause === "stay") void context.queryClient.prefetchQuery(options)
    else await context.queryClient.ensureQueryData(options)
  },
  pendingComponent: MetricsPending,
  errorComponent: MetricsLoadError,
  component: MetricsPage,
})

function MetricsPage() {
  const { days = DEFAULT_RANGE } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data, error, isError, isPlaceholderData, refetch } = useQuery({
    ...metricsQueryOptions(days),
    placeholderData: keepPreviousData,
  })

  const setDays = (next: Range) =>
    void navigate({ search: { days: next === DEFAULT_RANGE ? undefined : next }, replace: true })

  return (
    <Page width="wide" header={<Header actions={<RangePicker days={days} onChange={setDays} />} />}>
      {data ? (
        <div
          aria-busy={isPlaceholderData}
          className={cn("flex flex-col gap-8 transition-opacity", isPlaceholderData && "opacity-60")}
        >
          <Overview metrics={data} />
          <TrafficSection traffic={data.traffic} />
          <IntakeSection intake={data.intake} />
          <CtaSection traffic={data.traffic} />
          <AgentsSection agents={data.agents} intake={data.intake} />
          <div className="grid gap-8 lg:grid-cols-2">
            <FormsSection forms={data.forms} />
            <InboxNowSection inbox={data.inbox} />
          </div>
        </div>
      ) : isError ? (
        <MetricsError error={error} onRetry={() => void refetch()} />
      ) : (
        <MetricsSkeleton />
      )}
    </Page>
  )
}

function Header({ actions }: { actions?: React.ReactNode }) {
  return (
    <PageHeader
      eyebrow="Overview"
      title="Metrics"
      description="How people find us and how the intake goes. Counted without cookies; see the privacy notice."
      actions={actions}
    />
  )
}

function RangePicker({ days, onChange }: { days: Range; onChange: (days: Range) => void }) {
  return (
    <Tabs value={days} onValueChange={(value) => onChange(value as Range)}>
      <TabsList aria-label="Date range">
        {METRICS_RANGES.map((range) => (
          <TabsTrigger key={range} value={range} className="px-3">
            {range} days
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** The range and the five numbers we look at first. */
function Overview({ metrics }: { metrics: AdminMetrics }) {
  const { traffic, intake, received, range } = metrics
  const devices = traffic.devices.mobile + traffic.devices.desktop
  const started = intake.chats.pitch.started + intake.chats.join.started
  const sentViaChat = intake.chats.pitch.submitted + intake.chats.join.submitted
  const viewsPerVisit = ratio(traffic.pageViews, traffic.visits)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {formatDate(range.from)} – {formatDate(range.to)}, Berlin time
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Visits"
          value={formatCount(traffic.visits)}
          detail={devices ? `${formatPercent(ratio(traffic.devices.mobile, devices))} on a phone` : "No visits in this range"}
        />
        <StatTile
          label="Page views"
          value={formatCount(traffic.pageViews)}
          detail={viewsPerVisit === null ? "No visits in this range" : `${viewsPerVisit.toFixed(1)} per visit`}
        />
        <StatTile
          label="Chats started"
          value={formatCount(started)}
          detail={`${formatCount(intake.chats.pitch.started)} pitch · ${formatCount(intake.chats.join.started)} join`}
        />
        <StatTile
          label="Received"
          value={formatCount(received.pitches + received.applications)}
          detail={`${formatCount(received.pitches)} ${received.pitches === 1 ? "pitch" : "pitches"} · ${formatCount(received.applications)} ${received.applications === 1 ? "application" : "applications"}`}
        />
        <StatTile
          label="Chat to sent"
          value={formatPercent(ratio(sentViaChat, started))}
          detail={`${formatCount(sentViaChat)} of ${formatCount(started)} chats`}
        />
      </div>
    </div>
  )
}

function MetricsPending() {
  return (
    <Page width="wide" header={<Header />}>
      <MetricsSkeleton />
    </Page>
  )
}

function MetricsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy aria-label="Loading metrics">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}

function MetricsError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      title="We couldn't load the metrics"
      description={<code className="font-mono text-xs">{errorMessage(error)}</code>}
    >
      <Button onClick={onRetry}>Try again</Button>
    </EmptyState>
  )
}

function MetricsLoadError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <Page width="wide" header={<Header />}>
      <MetricsError
        error={error}
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
      />
    </Page>
  )
}
