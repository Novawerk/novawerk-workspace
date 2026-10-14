import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FileIcon, ImageIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@nw/ui/compound/empty-state"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"

import { FileButton } from "@/components/file-button"
import { ConfirmAction } from "@/components/inbox/confirm-action"
import { dataSource } from "@/lib/data-source"
import { errorMessage } from "@/lib/errors"
import { formatRelative } from "@/lib/format"
import { projectFilesQueryOptions, useProjectFiles } from "@/lib/queries"
import type { Me, ProjectFile } from "@/lib/types"
import { PROJECT_FILE_ACCEPT, titleFromFilename, uploadProjectFile } from "@/lib/uploads"

/**
 * The Files tab: whatever the team needs to keep with the project (designs, decks, notes,
 * screenshots). Private: only the team and admins can open them.
 */
export function ProjectFiles({ projectId, me, canManage }: { projectId: string; me: Me; canManage: boolean }) {
  const { data = [], isPending } = useQuery(projectFilesQueryOptions(projectId))
  const { add, remove } = useProjectFiles(projectId)
  const [progress, setProgress] = React.useState<string | null>(null)

  const upload = async (files: File[]) => {
    for (const [i, file] of files.entries()) {
      const label = files.length > 1 ? `${i + 1} of ${files.length}` : file.name
      setProgress(`Uploading ${label}…`)
      try {
        const pathname = await uploadProjectFile(projectId, file, (pct) => setProgress(`Uploading ${label}… ${Math.round(pct)}%`))
        await add.mutateAsync({ pathname, title: titleFromFilename(file.name) })
      } catch (err) {
        toast.error(`We couldn't upload ${file.name}`, { description: errorMessage(err) })
      }
    }
    setProgress(null)
  }

  const uploadsOff = dataSource.isSample

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Files</CardTitle>
          <CardDescription>
            {progress ?? "Designs, decks, notes, screenshots: anything the team needs. Only the team and admins can open them."}
          </CardDescription>
        </div>
        <FileButton
          accept={PROJECT_FILE_ACCEPT}
          multiple
          disabled={Boolean(progress) || uploadsOff}
          title={uploadsOff ? "Uploads are off in sample mode" : undefined}
          onFiles={(files) => void upload(files)}
        >
          Upload files
        </FileButton>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <EmptyState
            variant="plain"
            icon={<FileIcon />}
            title="No files yet"
            description="Up to 25 MB each: PDF, images, Word, Excel, PowerPoint, text, Markdown or zip."
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {data.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                url={dataSource.projectFileUrl(projectId, file.id)}
                canDelete={canManage || file.owner === me.id}
                deleting={remove.isPending}
                onDelete={() =>
                  remove.mutate(file.id, {
                    onSuccess: () => toast.success(`Deleted “${file.title}”`),
                    onError: (err) => toast.error("We couldn't delete it", { description: errorMessage(err) }),
                  })
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function FileRow({
  file,
  url,
  canDelete,
  deleting,
  onDelete,
}: {
  file: ProjectFile
  url: string | null
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
}) {
  const Icon = file.kind === "image" ? ImageIcon : FileIcon
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium underline-offset-4 hover:underline">
            {file.title}
          </a>
        ) : (
          <span className="truncate text-sm font-medium">{file.title}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {file.ownerName ?? "Someone"} · {formatRelative(file.createdAt)}
        </span>
      </div>
      {canDelete && (
        <ConfirmAction
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${file.title}`} disabled={deleting}>
              <Trash2Icon />
            </Button>
          }
          disabled={deleting}
          variant="destructive"
          title={`Delete “${file.title}”?`}
          description="The file is gone for the whole team. This can't be undone."
          confirmLabel="Delete"
          onConfirm={onDelete}
        />
      )}
    </li>
  )
}
