import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CopyIcon, MailIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@nw/ui/core/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@nw/ui/core/components/ui/dialog"
import { Input } from "@nw/ui/core/components/ui/input"
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import { FormField } from "@/components/form-field"
import { errorMessage, issueFor } from "@/lib/errors"
import { useDraftEmail } from "@/lib/queries"
import type { OutboxRelatedTable } from "@/lib/types"

/**
 * Write an email to someone outside Novawerk. Outbound email is gated: "Send to outbox" queues
 * it as pending, and it leaves only after a member approves it on the Outbox page.
 */
export function DraftReplyDialog({
  to: initialTo,
  subject: initialSubject,
  body: initialBody,
  related,
  triggerLabel = "Draft reply",
  triggerVariant = "outline",
}: {
  to: string
  subject: string
  body: string
  /** The record this email is about; the outbox links back to it. */
  related?: { table: OutboxRelatedTable; id: string }
  triggerLabel?: string
  triggerVariant?: "outline" | "ghost" | "secondary"
}) {
  const navigate = useNavigate()
  const draft = useDraftEmail()
  const [open, setOpen] = React.useState(false)
  const [to, setTo] = React.useState(initialTo)
  const [subject, setSubject] = React.useState(initialSubject)
  const [body, setBody] = React.useState(initialBody)

  // Start from the template each time the dialog opens.
  const onOpenChange = (next: boolean) => {
    if (next) {
      setTo(initialTo)
      setSubject(initialSubject)
      setBody(initialBody)
      draft.reset()
    }
    setOpen(next)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      toast.success("Draft copied")
    } catch {
      toast.error("Your browser blocked the clipboard")
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    draft.mutate(
      {
        to,
        subject,
        body,
        ...(related ? { relatedTable: related.table, relatedId: related.id } : {}),
      },
      {
        onSuccess: (email) => {
          setOpen(false)
          toast.success("Saved to the outbox", {
            description: "It goes out once a member approves it.",
            action: { label: "Open", onClick: () => void navigate({ to: "/outbox", search: { id: email.id } }) },
          })
        },
        onError: (err) => {
          if (!issueFor(err, "to") && !issueFor(err, "subject") && !issueFor(err, "body")) {
            toast.error("We couldn't save the draft", { description: errorMessage(err) })
          }
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant={triggerVariant} />}>
        <MailIcon /> {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Draft an email</DialogTitle>
            <DialogDescription>
              It waits in the outbox until a member approves it. Nothing leaves before that.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="To" htmlFor="reply-to" error={issueFor(draft.error, "to")}>
              <Input id="reply-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
            </FormField>
            <FormField label="Subject" htmlFor="reply-subject" error={issueFor(draft.error, "subject")}>
              <Input id="reply-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </FormField>
            <FormField label="Message" htmlFor="reply-body" error={issueFor(draft.error, "body")}>
              <Textarea
                id="reply-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="max-h-80 min-h-48"
                required
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => void copy()}>
              <CopyIcon /> Copy
            </Button>
            <Button type="submit" disabled={draft.isPending}>
              <SendIcon /> {draft.isPending ? "Saving…" : "Send to outbox"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
