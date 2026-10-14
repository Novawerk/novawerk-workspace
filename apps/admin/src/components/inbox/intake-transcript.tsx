import type * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronDownIcon, MessagesSquareIcon } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@nw/ui/core/components/ui/collapsible"
import { cn } from "@nw/ui/lib/utils"

import { formatDateTime } from "@/lib/format"
import { transcriptQueryOptions } from "@/lib/queries"

/**
 * The Intake Agent chat that produced a pitch or application, read-only. Only what the visitor
 * typed and what the assistant said; tool calls stay out. Hidden for plain-form submissions.
 */
export function IntakeTranscriptCard({ kind, id }: { kind: "submission" | "application"; id: string }) {
  const { data: transcript } = useQuery(transcriptQueryOptions(kind, id))
  if (!transcript || transcript.messages.length === 0) return null
  const visitorTurns = transcript.messages.filter((m) => m.role === "user").length

  return (
    <Collapsible className="group/transcript rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        <MessagesSquareIcon className="size-4 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">Intake conversation</span>
          <span className="text-xs text-muted-foreground">
            {visitorTurns} {visitorTurns === 1 ? "message" : "messages"} from the visitor · started{" "}
            {formatDateTime(transcript.startedAt)}
          </span>
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-open/transcript:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        <ol className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto border-t px-4 py-4">
          {transcript.messages.map((message) => (
            <Bubble key={message.id} role={message.role}>
              {message.text}
            </Bubble>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <li className={cn("flex flex-col gap-1", role === "user" ? "items-end" : "items-start")}>
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {role === "user" ? "Visitor" : "Intake Agent"}
      </span>
      <p
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-line",
          role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {children}
      </p>
    </li>
  )
}
