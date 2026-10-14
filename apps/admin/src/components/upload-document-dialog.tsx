import * as React from "react"
import { FileTextIcon } from "lucide-react"
import { toast } from "sonner"

import { DOCUMENT_KINDS, type DocumentKind } from "@nw/contracts"
import { Button } from "@nw/ui/core/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nw/ui/core/components/ui/dialog"
import { Input } from "@nw/ui/core/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@nw/ui/core/components/ui/select"

import { FileButton } from "@/components/file-button"
import { FormField } from "@/components/form-field"
import { errorMessage, issueFor } from "@/lib/errors"
import { DOCUMENT_KIND_LABELS } from "@/lib/labels"
import { useCreateDocument } from "@/lib/queries"
import type { DocumentRow } from "@/lib/types"
import { DOCUMENT_ACCEPT, titleFromFilename, uploadDocument } from "@/lib/uploads"

/** Upload one private document and record it. Mount it only while open. */
export function UploadDocumentDialog({
  onClose,
  onUploaded,
  defaultKind = "contract",
}: {
  onClose: () => void
  onUploaded?: (doc: DocumentRow) => void
  defaultKind?: DocumentKind
}) {
  const create = useCreateDocument()
  const [file, setFile] = React.useState<File | null>(null)
  const [kind, setKind] = React.useState<DocumentKind>(defaultKind)
  const [title, setTitle] = React.useState("")
  const [counterparty, setCounterparty] = React.useState("")
  const [signedOn, setSignedOn] = React.useState("")
  const [progress, setProgress] = React.useState<string | null>(null)
  const busy = progress !== null || create.isPending

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    // This dialog can open inside another form (Finance → Add entry). React bubbles portal
    // events up the component tree, so stop here or the outer form submits too.
    event.stopPropagation()
    if (!file) return
    try {
      setProgress("Uploading…")
      const pathname = await uploadDocument(file, (pct) => setProgress(`Uploading… ${Math.round(pct)}%`))
      setProgress("Saving…")
      const doc = await create.mutateAsync({
        pathname,
        kind,
        title: title.trim() || titleFromFilename(file.name),
        counterparty,
        signedOn: signedOn || null,
      })
      toast.success(`Uploaded ${doc.title}`)
      onUploaded?.(doc)
      onClose()
    } catch (err) {
      if (!issueFor(err, "title")) toast.error("We couldn't upload it", { description: errorMessage(err) })
    } finally {
      setProgress(null)
    }
  }

  const kinds = DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="contents">
          <DialogHeader>
            <DialogTitle>Upload a document</DialogTitle>
            <DialogDescription>
              Private: only you can open it. PDF, images, Word or Excel, up to 25 MB.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-3">
              <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{file ? file.name : "No file chosen"}</span>
              <FileButton
                accept={DOCUMENT_ACCEPT}
                disabled={busy}
                onFiles={([picked]) => {
                  if (!picked) return
                  setFile(picked)
                  if (!title) setTitle(titleFromFilename(picked.name))
                }}
              >
                {file ? "Change" : "Choose file"}
              </FileButton>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Kind" htmlFor="doc-kind">
                <Select items={kinds} value={kind} onValueChange={(v) => v && setKind(v as DocumentKind)}>
                  <SelectTrigger id="doc-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Signed on" htmlFor="doc-signed" hint="If it has a date.">
                <Input id="doc-signed" type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
              </FormField>
            </div>
            <FormField label="Title" htmlFor="doc-title" error={issueFor(create.error, "title")}>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </FormField>
            <FormField label="With" htmlFor="doc-counterparty" hint="Who it is with, e.g. Kiez Fonds.">
              <Input id="doc-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file || busy}>
              {progress ?? "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
