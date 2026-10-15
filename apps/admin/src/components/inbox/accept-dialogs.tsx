import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CheckIcon } from "lucide-react"
import { toast } from "sonner"

import { toHandle } from "@nw/contracts"
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

import { FormField, SwitchRow } from "@/components/form-field"
import { errorMessage, issueFor } from "@/lib/errors"
import { firstName } from "@/lib/format"
import { useAcceptApplication, useAcceptSubmission } from "@/lib/queries"
import type { MemberApplication, ProjectSubmission } from "@/lib/types"

const fieldErrors = ["slug", "title", "memberId", "displayName"]
const hasFieldError = (err: unknown) => fieldErrors.some((f) => issueFor(err, f))

/** "Accept and create project": a draft project linked to the pitch, in one step. */
export function AcceptSubmissionDialog({ submission }: { submission: ProjectSubmission }) {
  const navigate = useNavigate()
  const accept = useAcceptSubmission()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [email, setEmail] = React.useState(true)
  const accepted = submission.status === "accepted"

  const onOpenChange = (next: boolean) => {
    if (next) {
      setTitle(submission.projectName)
      setSlug(toHandle(submission.projectName, 80))
      accept.reset()
    }
    setOpen(next)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    accept.mutate(
      { id: submission.id, input: { title: title.trim(), email, ...(slug.trim() ? { slug: slug.trim() } : {}) } },
      {
        onSuccess: (result) => {
          setOpen(false)
          toast.success(result.projectCreated ? "Pitch accepted. We started the project." : "Pitch accepted again.", {
            description: [
              result.memberCreated
                ? `${result.initiator.displayName} is a Member now (handle ${result.initiator.id}) and its Initiator.`
                : `${result.initiator.displayName} is its Initiator.`,
              result.emailQueued ? `The email to ${firstName(submission.name)} waits in the Outbox for approval.` : "",
            ]
              .filter(Boolean)
              .join(" "),
            action: {
              label: "Open project",
              onClick: () => void navigate({ to: "/projects/$projectId", params: { projectId: result.project.id } }),
            },
          })
        },
        onError: (err) => {
          if (!hasFieldError(err)) toast.error("We couldn't accept the pitch", { description: errorMessage(err) })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button disabled={accepted} />}>
        <CheckIcon /> Accept and create project
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Accept this pitch?</DialogTitle>
            <DialogDescription>
              We mark it accepted and start the project (Accepted, not on the website yet), linked to this pitch. Nothing goes
              public until you publish it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Project title" htmlFor="accept-title" error={issueFor(accept.error, "title")}>
              <Input id="accept-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </FormField>
            <FormField
              label="Slug"
              htmlFor="accept-slug"
              error={issueFor(accept.error, "slug")}
              hint="The web address name. Lowercase letters, digits and hyphens."
            >
              <Input
                id="accept-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="kiez-pantry"
                className="font-mono"
              />
            </FormField>
            <p className="text-xs text-muted-foreground">
              {firstName(submission.name)} pitched it, so they become a Member and the project's Initiator, and can
              sign in with this email ({submission.email}). They see their own projects, not the rest of the admin
              panel.
            </p>
            <SwitchRow
              label={`Email ${firstName(submission.name)}`}
              htmlFor="accept-email"
              description="Our acceptance note: what happens next (a call, a small first step) and how we work. It waits in the Outbox until a member approves it."
            >
              <Switch id="accept-email" checked={email} onCheckedChange={setEmail} />
            </SwitchRow>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={accept.isPending}>
              {accept.isPending ? "Accepting…" : "Accept"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Accept as member": creates the Member (or links the one with this email), in one step. */
export function AcceptApplicationDialog({ application }: { application: MemberApplication }) {
  const navigate = useNavigate()
  const accept = useAcceptApplication()
  const [open, setOpen] = React.useState(false)
  const [displayName, setDisplayName] = React.useState("")
  const [memberId, setMemberId] = React.useState("")
  const accepted = application.status === "accepted"

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDisplayName(application.name)
      setMemberId(toHandle(application.name))
      accept.reset()
    }
    setOpen(next)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    accept.mutate(
      {
        id: application.id,
        input: { displayName: displayName.trim(), ...(memberId.trim() ? { memberId: memberId.trim() } : {}) },
      },
      {
        onSuccess: (result) => {
          setOpen(false)
          const initiator = result.initiatorOf.length
            ? ` They are now the Initiator of ${result.initiatorOf.length === 1 ? "the project they pitched" : `${result.initiatorOf.length} projects they pitched`}.`
            : ""
          toast.success(`${result.member.displayName} is a Member now`, {
            description: result.memberCreated
              ? `Handle: ${result.member.id}.${initiator}`
              : `We linked the existing member ${result.member.id}.${initiator}`,
            action: { label: "Members", onClick: () => void navigate({ to: "/members" }) },
          })
        },
        onError: (err) => {
          if (!hasFieldError(err)) toast.error("We couldn't accept the application", { description: errorMessage(err) })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button disabled={accepted} />}>
        <CheckIcon /> Accept as member
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Accept {firstName(application.name)} as a Member?</DialogTitle>
            <DialogDescription>
              We add them to Members (without admin access) and mark the application accepted. If a member already
              uses {application.email}, we link that member instead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Name" htmlFor="accept-name" error={issueFor(accept.error, "displayName")}>
              <Input id="accept-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </FormField>
            <FormField
              label="Handle"
              htmlFor="accept-handle"
              error={issueFor(accept.error, "memberId")}
              hint="Their id everywhere in Novawerk. Lowercase letters, digits and hyphens."
            >
              <Input
                id="accept-handle"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                placeholder="ada-lovelace"
                className="font-mono"
              />
            </FormField>
            <p className="text-xs text-muted-foreground">
              No email goes out by itself. Draft a welcome note afterwards; it waits in the outbox for approval.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={accept.isPending}>
              {accept.isPending ? "Accepting…" : "Accept"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
