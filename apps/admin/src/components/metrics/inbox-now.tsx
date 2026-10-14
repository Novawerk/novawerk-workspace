import type * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { APPLICATION_STATUSES, SUBMISSION_STATUSES } from "@nw/contracts"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent } from "@nw/ui/core/components/ui/card"
import { Separator } from "@nw/ui/core/components/ui/separator"

import { formatAge, formatCount, formatDateTime } from "@/lib/format"
import type { AdminMetrics } from "@/lib/types"

import { Section } from "./parts"

export function InboxNowSection({ inbox }: { inbox: AdminMetrics["inbox"] }) {
  return (
    <Section id="metrics-inbox" title="Inbox now" description="What waits for us right now, whatever the range.">
      <Card size="sm" className="shadow-none">
        <CardContent className="flex flex-col gap-4">
          <InboxBlock
            title="Project pitches"
            link={<Link to="/projects" />}
            oldest={inbox.oldestNewSubmissionAt}
            counts={SUBMISSION_STATUSES.map((status) => (
              <Count key={status} n={inbox.submissions[status]}>
                <StatusBadge kind="submission" status={status} />
              </Count>
            ))}
          />
          <Separator />
          <InboxBlock
            title="Applications"
            link={<Link to="/inbox/applications" search={{ status: "new" }} />}
            oldest={inbox.oldestNewApplicationAt}
            counts={APPLICATION_STATUSES.map((status) => (
              <Count key={status} n={inbox.applications[status]}>
                <StatusBadge kind="application" status={status} />
              </Count>
            ))}
          />
          <Separator />
          <InboxBlock
            title="Outbox"
            link={<Link to="/outbox" />}
            oldest={inbox.oldestPendingEmailAt}
            waiting="Oldest email waiting for approval"
            counts={[
              <Count key="pending" n={inbox.outboxPending}>
                <StatusBadge kind="outbox" status="pending" />
              </Count>,
            ]}
          />
        </CardContent>
      </Card>
    </Section>
  )
}

function Count({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span className="text-sm font-medium tabular-nums">{formatCount(n)}</span>
    </span>
  )
}

function InboxBlock({
  title,
  link,
  counts,
  oldest,
  waiting = "Oldest new one waiting",
}: {
  title: string
  /** A router <Link> (without children) to the list. */
  link: React.ReactElement
  counts: React.ReactNode[]
  oldest: string | null
  waiting?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button variant="ghost" size="sm" nativeButton={false} render={link} aria-label={`Open ${title.toLowerCase()}`}>
          Open <ArrowRightIcon />
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">{counts}</div>
      <p className="text-xs text-muted-foreground">
        {oldest ? (
          <>
            {waiting}: <span title={formatDateTime(oldest)}>{formatAge(oldest)}</span>
          </>
        ) : (
          "Nothing waiting."
        )}
      </p>
    </div>
  )
}
