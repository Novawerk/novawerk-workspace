import { ExternalLinkIcon, FileTextIcon } from "lucide-react"

import { Button } from "@nw/ui/core/components/ui/button"

import { dataSource } from "@/lib/data-source"

/** The CV a visitor attached to a pitch or an application. The API checks the session when it opens. */
export function ResumeCard({
  kind,
  id,
  name,
}: {
  kind: "submission" | "application"
  id: string
  name: string | null
}) {
  if (!name) return null
  const url = dataSource.resumeFileUrl(kind, id)
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-sm font-medium">CV</h3>
        <p className="truncate text-sm text-muted-foreground" title={name}>
          {name}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={!url}
        nativeButton={false}
        render={url ? <a href={url} target="_blank" rel="noreferrer noopener" /> : <span />}
      >
        <ExternalLinkIcon /> Open
      </Button>
    </div>
  )
}
