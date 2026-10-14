import { FlaskConicalIcon } from "lucide-react"

import { Badge } from "@nw/ui/core/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@nw/ui/core/components/ui/tooltip"

import { USE_SAMPLE_DATA } from "@/lib/env"

/** Shown in the top bar while VITE_USE_SAMPLE_DATA is on, so nobody mistakes demo rows for real ones. */
export function SampleDataBadge() {
  if (!USE_SAMPLE_DATA) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="outline" className="gap-1.5 border-warning/30 bg-warning/10 text-warning">
            <FlaskConicalIcon />
            <span className="hidden sm:inline">Sample data</span>
            <span className="sr-only sm:hidden">Sample data</span>
          </Badge>
        }
      />
      <TooltipContent side="bottom" className="max-w-64">
        Fictional data, kept in memory. Changes reset on reload. Unset VITE_USE_SAMPLE_DATA to use the
        API.
      </TooltipContent>
    </Tooltip>
  )
}
