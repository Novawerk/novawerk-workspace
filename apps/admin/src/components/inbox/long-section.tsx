import type * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@nw/ui/core/components/ui/collapsible"

/** One long free-text answer from a form, collapsible. */
export function LongSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section rounded-lg border bg-card">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
        {title}
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-data-open/section:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        <div className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
