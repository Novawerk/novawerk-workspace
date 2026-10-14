import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { toast } from "sonner"

import { SUBMISSION_STATUSES } from "@nw/contracts"
import { PageHeader } from "@nw/ui/compound/page-header"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@nw/ui/core/components/ui/tooltip"

import { LazyAgentPanel, type AgentSubject } from "@/components/agent-panel-lazy"
import { AgentRailContent } from "@/components/agent-rail"
import { AcceptSubmissionDialog } from "@/components/inbox/accept-dialogs"
import { AiSummaryCard } from "@/components/inbox/ai-summary-card"
import { DetailSkeleton } from "@/components/inbox/detail-skeleton"
import { IntakeTranscriptCard } from "@/components/inbox/intake-transcript"
import { DeclinePitchDialog, InviteCallDialog } from "@/components/inbox/pitch-dialogs"
import { RelatedEmails } from "@/components/inbox/related-emails"
import { ResumeCard } from "@/components/inbox/resume-card"
import { NotesField, ReviewerSelect, StatusSelect } from "@/components/inbox/review-fields"
import { Page } from "@/components/page"
import { errorMessage } from "@/lib/errors"
import { firstName, formatDateTime, formatRelative, splitLinks } from "@/lib/format"
import { membersQueryOptions, submissionQueryOptions, useUpdateSubmission } from "@/lib/queries"
import type { ProjectSubmission, SubmissionPatch } from "@/lib/types"

const SECTIONS = [
  { key: "product", title: "Product" },
  { key: "userJourney", title: "User journey" },
  { key: "referencesAndInnovation", title: "References and what's new" },
  { key: "team", title: "Team" },
  { key: "timeline", title: "Timeline" },
] as const satisfies readonly { key: keyof ProjectSubmission; title: string }[]

/**
 * One pitch: its own page before it is accepted (review, reply, accept or decline), or the
 * Pitch tab of the project it became (`embedded`).
 */
export function SubmissionDetail({ id, embedded }: { id: string; embedded?: boolean }) {
  const { data: submission, isPending, error } = useQuery(submissionQueryOptions(id))

  if (isPending) return <DetailSkeleton />
  if (error || !submission) {
    return <p className="p-6 text-sm text-destructive">{error?.message ?? "We can't find this pitch."}</p>
  }

  const subject: AgentSubject = { kind: "pitch", id: submission.id, title: submission.projectName, person: submission.name }
  const agent = (
    <AgentRailContent title="Ask the agent">
      <LazyAgentPanel key={submission.id} subject={subject} className="min-h-0 flex-1" />
    </AgentRailContent>
  )
  const body = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <AiSummaryCard summary={submission.aiSummary} />
        <PitchContent submission={submission} />
        <ResumeCard kind="submission" id={submission.id} name={submission.resumeName} />
        <IntakeTranscriptCard kind="submission" id={submission.id} />
      </div>
      <aside className="flex min-w-0 flex-col gap-6">
        <ReviewCard submission={submission} />
        <RelatedEmails table="project_submissions" id={submission.id} />
      </aside>
    </div>
  )

  if (embedded) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <Pitcher submission={submission} /> · accepted {formatRelative(submission.updatedAt)}
          </p>
          <PitchActions submission={submission} />
        </div>
        {body}
        {agent}
      </div>
    )
  }

  return (
    <Page
      width="wide"
      header={
        <div className="sticky -top-4 z-10 -mx-4 -mt-4 flex flex-col gap-2 border-b bg-background/95 px-4 pt-4 pb-3 backdrop-blur sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" nativeButton={false} render={<Link to="/projects" />}>
            <ArrowLeftIcon /> Projects
          </Button>
          <PageHeader
            eyebrow="Pitch"
            title={
              <span className="flex flex-wrap items-center gap-3">
                {submission.projectName}
                <StatusBadge kind="submission" status={submission.status} />
              </span>
            }
            description={<Pitcher submission={submission} />}
            actions={<PitchActions submission={submission} />}
          />
        </div>
      }
    >
      {body}
      {agent}
    </Page>
  )
}

/** "Tobias Krämer · tobias@example.com · yesterday" */
function Pitcher({ submission }: { submission: ProjectSubmission }) {
  return (
    <>
      {submission.name} ·{" "}
      <a href={`mailto:${submission.email}`} className="underline-offset-4 hover:text-foreground hover:underline">
        {submission.email}
      </a>{" "}
      ·{" "}
      <Tooltip>
        <TooltipTrigger render={<time dateTime={submission.createdAt} />}>{formatRelative(submission.createdAt)}</TooltipTrigger>
        <TooltipContent>{formatDateTime(submission.createdAt)}</TooltipContent>
      </Tooltip>
    </>
  )
}

/** Invite to a call, decline, accept. Accepting and declining email the sender too. */
function PitchActions({ submission }: { submission: ProjectSubmission }) {
  const accepted = submission.status === "accepted"
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InviteCallDialog submission={submission} />
      {!accepted && <DeclinePitchDialog submission={submission} />}
      {!accepted && <AcceptSubmissionDialog submission={submission} />}
    </div>
  )
}

/** The pitch in the sender's own words, as one card. */
function PitchContent({ submission }: { submission: ProjectSubmission }) {
  const links = splitLinks(submission.links)
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>The pitch</CardTitle>
        <CardDescription>In {firstName(submission.name)}'s own words, from novawerk.io/submit.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {SECTIONS.map((section) => (
          <section key={section.key} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.title}</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line">{submission[section.key]}</p>
          </section>
        ))}
        {links.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Links</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {links.map((url) => (
                <li key={url}>
                  <a
                    href={/^https?:\/\//.test(url) ? url : `https://${url}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline"
                  >
                    {url}
                    <ExternalLinkIcon className="size-3.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

/** Status, who reviews it, and notes only members see. */
function ReviewCard({ submission }: { submission: ProjectSubmission }) {
  const { data: members = [] } = useQuery(membersQueryOptions)
  const update = useUpdateSubmission()

  const save = (patch: SubmissionPatch, success: string) =>
    update.mutate(
      { id: submission.id, patch },
      {
        onSuccess: () => toast.success(success),
        onError: (err) => toast.error("We couldn't save that", { description: errorMessage(err) }),
      },
    )

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <StatusSelect
          id="pitch-status"
          kind="submission"
          statuses={SUBMISSION_STATUSES}
          value={submission.status}
          onChange={(status) => save({ status }, "Status updated")}
          disabled={update.isPending}
          lockedStatuses={submission.projectId ? [] : ["accepted"]}
        />
        <ReviewerSelect
          id="pitch-reviewer"
          members={members}
          value={submission.reviewerId}
          onChange={(reviewerId) => save({ reviewerId }, reviewerId ? "Reviewer assigned" : "Reviewer removed")}
          disabled={update.isPending}
        />
        <NotesField id="pitch-notes" value={submission.notes} saving={update.isPending} onSave={(notes) => save({ notes }, "Notes saved")} />
      </CardContent>
    </Card>
  )
}
