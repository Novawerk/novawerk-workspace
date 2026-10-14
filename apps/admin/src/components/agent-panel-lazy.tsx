import * as React from "react"

import { Skeleton } from "@nw/ui/core/components/ui/skeleton"
import { cn } from "@nw/ui/lib/utils"

import type { AgentSubject } from "./agent-panel"

export type { AgentSubject }

// The chat UI pulls in Streamdown, Shiki and Mermaid. Load it only when the panel shows.
const AgentPanel = React.lazy(() => import("./agent-panel").then((m) => ({ default: m.AgentPanel })))

export function LazyAgentPanel(props: { subject: AgentSubject; className?: string }) {
  return (
    <React.Suspense
      fallback={
        <div className={cn("flex flex-col gap-3 p-4", props.className)}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16 w-3/4 self-end" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <AgentPanel {...props} />
    </React.Suspense>
  )
}
