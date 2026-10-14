import { SparklesIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"

/** The intake agent's short read of a pitch or application. */
export function AiSummaryCard({ summary }: { summary: string | null }) {
  return (
    <Card className="gap-3 border-primary/20 bg-primary/5 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SparklesIcon className="size-4 text-primary" />
          AI summary
        </CardTitle>
        {!summary && (
          <CardDescription>
            No summary yet. The intake agent writes one a few minutes after a form comes in.
          </CardDescription>
        )}
      </CardHeader>
      {summary && (
        <CardContent className="px-4 text-sm leading-relaxed">
          <p>{summary}</p>
        </CardContent>
      )}
    </Card>
  )
}
