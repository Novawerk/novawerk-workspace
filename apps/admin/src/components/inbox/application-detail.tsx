import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ClockIcon, MapPinIcon, UserIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { APPLICATION_STATUSES } from "@nw/contracts"
import { StatusBadge } from "@nw/ui/compound/status-badge"
import { Badge } from "@nw/ui/core/components/ui/badge"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent } from "@nw/ui/core/components/ui/card"
import { Separator } from "@nw/ui/core/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@nw/ui/core/components/ui/tooltip"

import { LazyAgentPanel, type AgentSubject } from "@/components/agent-panel-lazy"
import { AgentRailContent } from "@/components/agent-rail"
import { AcceptApplicationDialog } from "@/components/inbox/accept-dialogs"
import { AiSummaryCard } from "@/components/inbox/ai-summary-card"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { DetailSkeleton } from "@/components/inbox/detail-skeleton"
import { DraftReplyDialog } from "@/components/inbox/draft-reply-dialog"
import { IntakeTranscriptCard } from "@/components/inbox/intake-transcript"
import { LinksList } from "@/components/inbox/links-list"
import { LongSection } from "@/components/inbox/long-section"
import { RelatedEmails } from "@/components/inbox/related-emails"
import { ResumeCard } from "@/components/inbox/resume-card"
import { NotesField, ReviewerSelect, StatusSelect } from "@/components/inbox/review-fields"
import { errorMessage } from "@/lib/errors"
import { firstName, formatDateTime, formatRelative } from "@/lib/format"
import { availabilityLabel, functionLabel } from "@/lib/labels"
import {
  applicationQueryOptions,
  membersQueryOptions,
  useUpdateApplication,
} from "@/lib/queries"
import type { ApplicationPatch, MemberApplication } from "@/lib/types"


export function ApplicationDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: application, isPending, error } = useQuery(applicationQueryOptions(id))
  // Tailwind `2xl`: the agent sits in a side rail; below that it opens in a sheet.

  if (isPending) return <DetailSkeleton />
  if (error || !application) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
          <ArrowLeftIcon /> Back
        </Button>
        <p className="text-sm text-destructive">{error?.message ?? "We can't find this application."}</p>
      </div>
    )
  }

  const subject: AgentSubject = {
    kind: "application",
    id: application.id,
    title: application.name,
    person: application.name,
  }

  return (
    <div className="flex min-h-0 flex-1">
      <article className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 lg:hidden">
                <ArrowLeftIcon /> All applications
              </Button>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="font-heading text-2xl font-semibold tracking-tight break-words">{application.name}</h2>
                <p className="text-sm break-words text-muted-foreground">
                  <a
                    href={`mailto:${application.email}`}
                    className="underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {application.email}
                  </a>{" "}
                  ·{" "}
                  <Tooltip>
                    <TooltipTrigger render={<time dateTime={application.createdAt} />}>
                      {formatRelative(application.createdAt)}
                    </TooltipTrigger>
                    <TooltipContent>{formatDateTime(application.createdAt)}</TooltipContent>
                  </Tooltip>
                </p>
              </div>
              <StatusBadge kind="application" status={application.status} className="mt-1" />
            </div>
            <Facts application={application} />
          </header>

          <ReviewCard application={application} />
          <RelatedEmails table="member_applications" id={application.id} />
          <AiSummaryCard summary={application.aiSummary} />
          <div className="flex flex-col gap-3">
            <LongSection title="Background">{application.background}</LongSection>
            <LongSection title="Motivation">{application.motivation}</LongSection>
            <LinksList links={application.links} />
            <ResumeCard kind="application" id={application.id} name={application.resumeName} />
            <IntakeTranscriptCard kind="application" id={application.id} />
          </div>
        </div>
      </article>
      <AgentRailContent title="Ask the agent">
        <LazyAgentPanel key={application.id} subject={subject} className="min-h-0 flex-1" />
      </AgentRailContent>
    </div>
  )
}

function Facts({ application }: { application: MemberApplication }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {application.functions.map((fn) => (
          <Badge key={fn} variant="secondary">
            {functionLabel(fn)}
          </Badge>
        ))}
      </div>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <ClockIcon className="size-4" />
        {availabilityLabel(application.availability)}
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <MapPinIcon className="size-4" />
        {application.city || "No city given"}
      </span>
      {application.memberId && (
        <Link
          to="/members"
          search={{ id: application.memberId }}
          className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
        >
          <UserIcon className="size-4" /> Member {application.memberId}
        </Link>
      )}
    </div>
  )
}

function ReviewCard({ application }: { application: MemberApplication }) {
  const { data: members = [] } = useQuery(membersQueryOptions)
  const update = useUpdateApplication()

  const save = (patch: ApplicationPatch, success: string) =>
    update.mutate(
      { id: application.id, patch },
      {
        onSuccess: () => toast.success(success),
        onError: (err) => toast.error("We couldn't save that", { description: errorMessage(err) }),
      },
    )

  return (
    <Card className="py-4 shadow-none">
      <CardContent className="flex flex-col gap-4 px-4">
        <div className="flex flex-wrap gap-3">
          <StatusSelect
            id="application-status"
            kind="application"
            statuses={APPLICATION_STATUSES}
            value={application.status}
            onChange={(status) => save({ status }, "Status updated")}
            disabled={update.isPending}
            lockedStatuses={application.memberId ? [] : ["accepted"]}
          />
          <ReviewerSelect
            id="application-reviewer"
            members={members}
            value={application.reviewerId}
            onChange={(reviewerId) => save({ reviewerId }, reviewerId ? "Reviewer assigned" : "Reviewer removed")}
            disabled={update.isPending}
          />
        </div>
        <NotesField
          id="application-notes"
          value={application.notes}
          saving={update.isPending}
          onSave={(notes) => save({ notes }, "Notes saved")}
        />
        <Separator />
        <div className="flex flex-wrap items-center gap-2">
          <AcceptApplicationDialog application={application} />
          <DraftReplyDialog
            to={application.email}
            subject={application.status === "accepted" ? "Welcome to Novawerk" : "Your application to Novawerk"}
            body={replyTemplate(application)}
            related={{ table: "member_applications", id: application.id }}
          />
          <ConfirmAction
            trigger={
              <Button variant="destructive" disabled={application.status === "declined"}>
                <XIcon /> Decline
              </Button>
            }
            disabled={application.status === "declined"}
            variant="destructive"
            title="Decline this application?"
            description="We mark it as declined. Nobody gets an email until you draft a reply and a member approves it."
            confirmLabel="Decline"
            onConfirm={() => save({ status: "declined" }, "Application declined")}
          />
        </div>
      </CardContent>
    </Card>
  )
}


function replyTemplate(application: MemberApplication) {
  const first = firstName(application.name)
  if (application.status === "accepted") {
    return `Hi ${first},\n\nWelcome to Novawerk. We're glad you're here.\n\n[Next step: the all-hands date, the chat invite, who to talk to first.]\n\nSee you soon,\nNovawerk`
  }
  if (application.status === "declined") {
    return `Hi ${first},\n\nThank you for wanting to join Novawerk. We can't take you on right now.\n\n[Why, in one or two sentences.]\n\nWe'd be glad to hear from you again later.\n\nAll the best,\nNovawerk`
  }
  return `Hi ${first},\n\nThank you for wanting to join Novawerk. We'd love to meet you.\n\nCould you join a 20-minute intro call next week? Reply with a few times that work.\n\nAll the best,\nNovawerk`
}
