import * as React from "react"
import { ArrowLeftIcon, CalendarPlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { inviteDraftInput } from "@nw/contracts"
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
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@nw/ui/core/components/ui/tabs"
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import { FormField, SwitchRow } from "@/components/form-field"
import { dataSource } from "@/lib/data-source"
import { errorMessage, issueFor } from "@/lib/errors"
import { firstName } from "@/lib/format"
import { useDeclineSubmission, useDraftEmail, useUpdateSubmission } from "@/lib/queries"
import type { InviteDraft, ProjectSubmission } from "@/lib/types"

/** "Decline", with our short "not now" email unless the member turns it off. */
export function DeclinePitchDialog({ submission }: { submission: ProjectSubmission }) {
  const decline = useDeclineSubmission()
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState(true)
  const name = firstName(submission.name)
  const declined = submission.status === "declined"

  const confirm = () =>
    decline.mutate(
      { id: submission.id, email },
      {
        onSuccess: ({ emailQueued }) => {
          setOpen(false)
          toast.success("Pitch declined", {
            description: emailQueued ? `The email to ${name} waits in the Outbox for approval.` : undefined,
          })
        },
        onError: (err) => toast.error("We couldn't decline it", { description: errorMessage(err) }),
      },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="text-destructive" disabled={declined} />}>
        <XIcon /> Decline
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline this pitch?</DialogTitle>
          <DialogDescription>It moves to Closed on the Projects board. You can change the status back later.</DialogDescription>
        </DialogHeader>
        <SwitchRow
          label={`Email ${name}`}
          htmlFor="decline-email"
          description="A short, kind no, with an invitation to pitch again or help on the task board. It waits in the Outbox until a member approves it."
        >
          <Switch id="decline-email" checked={email} onCheckedChange={setEmail} />
        </SwitchRow>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={decline.isPending}>
            {decline.isPending ? "Declining…" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const MINUTES = ["30", "45", "60"] as const
const SLOTS = 3

/** Chinese if the pitch is written in Chinese (the API answers in the same language). */
const isChinese = (s: ProjectSubmission) => /[㐀-鿿]/.test(`${s.projectName} ${s.product} ${s.userJourney}`)

/** "2026-10-08T18:00" → "Wed 8 Oct, 18:00 (Berlin time)" / "10月8日 周三 18:00（柏林时间）". */
function formatSlot(value: string, zh: boolean): string {
  const date = new Date(value)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const berlin = zone === "Europe/Berlin"
  if (zh) {
    const text = new Intl.DateTimeFormat("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
    return `${text}（${berlin ? "柏林时间" : zone}）`
  }
  const text = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
  return `${text} (${berlin ? "Berlin time" : zone})`
}

/**
 * "Invite to a call": the member offers a few times; the API's language model writes the email
 * from the pitch; the member edits it and sends it to the Outbox, where it waits for approval.
 */
export function InviteCallDialog({ submission }: { submission: ProjectSubmission }) {
  const queue = useDraftEmail()
  const update = useUpdateSubmission()
  const [open, setOpen] = React.useState(false)
  const [slots, setSlots] = React.useState<string[]>(() => Array(SLOTS).fill(""))
  const [minutes, setMinutes] = React.useState<(typeof MINUTES)[number]>("30")
  const [where, setWhere] = React.useState("")
  const [note, setNote] = React.useState("")
  const [drafting, setDrafting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<InviteDraft | null>(null)
  const [subject, setSubject] = React.useState("")
  const [body, setBody] = React.useState("")
  const name = firstName(submission.name)
  const zh = isChinese(submission)

  const reset = () => {
    setDraft(null)
    setError(null)
  }

  const write = async (event: React.FormEvent) => {
    event.preventDefault()
    const input = {
      times: slots.filter(Boolean).map((s) => formatSlot(s, zh)),
      minutes: Number(minutes),
      ...(where.trim() ? { where: where.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }
    const parsed = inviteDraftInput.safeParse(input)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the fields")
    setDrafting(true)
    setError(null)
    try {
      const result = await dataSource.draftInvite(submission.id, parsed.data)
      setDraft(result)
      setSubject(result.subject)
      setBody(result.body)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDrafting(false)
    }
  }

  const send = () =>
    queue.mutate(
      { to: submission.email, subject, body, relatedTable: "project_submissions", relatedId: submission.id },
      {
        onSuccess: () => {
          if (submission.status === "new") update.mutate({ id: submission.id, patch: { status: "discussing" } })
          setOpen(false)
          reset()
          toast.success("The invite waits in the Outbox", { description: "A member approves it before it goes out." })
        },
        onError: (err) => {
          if (!["subject", "body"].some((f) => issueFor(err, f))) {
            toast.error("We couldn't queue it", { description: errorMessage(err) })
          }
        },
      },
    )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <CalendarPlusIcon /> Invite to a call
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        {!draft ? (
          <form onSubmit={(e) => void write(e)} className="contents">
            <DialogHeader>
              <DialogTitle>Invite {name} to a call</DialogTitle>
              <DialogDescription>
                Offer a few times. We write the email from the pitch{zh ? " in Chinese" : ""}; you read it before it goes
                to the Outbox.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Times</span>
                {slots.map((value, i) => (
                  <Input
                    key={i}
                    type="datetime-local"
                    aria-label={`Time ${i + 1}`}
                    value={value}
                    required={i === 0}
                    onChange={(e) => setSlots((all) => all.map((s, j) => (j === i ? e.target.value : s)))}
                  />
                ))}
                <span className="text-xs text-muted-foreground">One is enough; two or three make it easier to say yes.</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Length</span>
                  <Tabs value={minutes} onValueChange={(v) => setMinutes(v as (typeof MINUTES)[number])}>
                    <TabsList>
                      {MINUTES.map((m) => (
                        <TabsTrigger key={m} value={m}>
                          {m} min
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
                <FormField label="Where" htmlFor="invite-where">
                  <Input
                    id="invite-where"
                    value={where}
                    onChange={(e) => setWhere(e.target.value)}
                    placeholder={zh ? "线上视频，我们发链接给你" : "A video call, we send the link"}
                  />
                </FormField>
              </div>
              <FormField label="Anything to add" htmlFor="invite-note" hint="Optional: what you'd like to talk about, or what to bring.">
                <Textarea id="invite-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
              </FormField>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={drafting || !slots[0]}>
                <SparklesIcon /> {drafting ? "Writing…" : "Write the email"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Read it, then send it to the Outbox</DialogTitle>
              <DialogDescription>
                {draft.by === "ai" ? "Written from the pitch. Check every line." : `From our template. ${draft.note ?? ""}`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                To <span className="font-medium text-foreground">{draft.to}</span>
              </p>
              <FormField label="Subject" htmlFor="invite-subject" error={issueFor(queue.error, "subject")}>
                <Input id="invite-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </FormField>
              <FormField label="Message" htmlFor="invite-body" error={issueFor(queue.error, "body")}>
                <Textarea id="invite-body" value={body} onChange={(e) => setBody(e.target.value)} className="max-h-96 min-h-64" />
              </FormField>
            </div>
            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={reset}>
                <ArrowLeftIcon /> Change the times
              </Button>
              <Button onClick={send} disabled={queue.isPending || !subject.trim() || !body.trim()}>
                {queue.isPending ? "Sending…" : "Send to the Outbox"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
