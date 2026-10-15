import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@nw/ui/compound/page-header"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@nw/ui/core/components/ui/input-group"
import { Switch } from "@nw/ui/core/components/ui/switch"
import { Textarea } from "@nw/ui/core/components/ui/textarea"

import { FormField, SwitchRow } from "@/components/form-field"
import { Page } from "@/components/page"
import { WEB_URL } from "@/lib/env"
import { errorMessage, issueFor } from "@/lib/errors"
import { meQueryOptions, useUpdateMe } from "@/lib/queries"

const BIO_MAX = 160
const HANDLE_MAX = 39
const NO_REMOVING = "You can change your handle, not remove it"

/** Every member's own page: the opt-in public profile (NB-ADR-0013). Off until they switch it on. */
export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
})

function ProfilePage() {
  // The query, not the route context: a save updates it at once.
  const { me: initial } = Route.useRouteContext()
  const { data: me = initial } = useQuery(meQueryOptions)
  const save = useUpdateMe()
  const [publicProfile, setPublicProfile] = React.useState(me.publicProfile)
  const [handle, setHandle] = React.useState(me.profileHandle ?? "")
  const [bio, setBio] = React.useState(me.profileBio ?? "")

  // Errors show until the field they belong to is edited.
  const [edited, setEdited] = React.useState<Set<string>>(new Set())
  const fieldError = (field: string) => (edited.has(field) ? undefined : issueFor(save.error, field))
  const touch = (field: string) => setEdited((s) => new Set(s).add(field))

  const savedHandle = me.profileHandle ?? ""
  // A saved handle can change, never go: the API has no way to remove one.
  const handleError = savedHandle && !handle.trim() ? NO_REMOVING : fieldError("profileHandle")
  const dirty = publicProfile !== me.publicProfile || handle.trim() !== savedHandle || bio.trim() !== (me.profileBio ?? "")

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (savedHandle && !handle.trim()) return
    setEdited(new Set())
    save.mutate(
      {
        publicProfile,
        ...(handle.trim() && handle.trim() !== savedHandle ? { profileHandle: handle.trim() } : {}),
        profileBio: bio,
      },
      {
        onSuccess: (saved) => {
          // What's stored now, so the form never shows something the server didn't keep.
          setPublicProfile(saved.publicProfile)
          setHandle(saved.profileHandle ?? "")
          setBio(saved.profileBio ?? "")
          toast.success(saved.publicProfile ? "Your profile is public" : "Saved. Your profile stays private.")
        },
        onError: (err) => {
          if (!["profileHandle", "profileBio", "publicProfile"].some((f) => issueFor(err, f))) {
            toast.error("We couldn't save it", { description: errorMessage(err) })
          }
        },
      },
    )
  }

  return (
    <Page
      header={
        <PageHeader
          eyebrow="You"
          title="Your public profile"
          description="Off unless you switch it on. Only you can change it; no admin can do it for you."
        />
      }
    >
      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>On novawerk.io</CardTitle>
            <CardDescription>
              With a public profile you stand on the contributors wall as the Initiator of your public projects, and{" "}
              <code className="font-mono text-xs">/u/{handle.trim() || "your-handle"}</code> shows your page. Your email never shows.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              label="Handle"
              htmlFor="profile-handle"
              error={handleError}
              hint="Lowercase letters, digits and hyphens. Contributors use the same names, so it must be free."
            >
              <InputGroup>
                <InputGroupAddon className="font-mono text-xs">{WEB_URL.replace(/^https?:\/\//, "")}/u/</InputGroupAddon>
                <InputGroupInput
                  id="profile-handle"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value.toLowerCase())
                    touch("profileHandle")
                  }}
                  maxLength={HANDLE_MAX}
                  aria-invalid={Boolean(handleError)}
                  placeholder="your-name"
                  className="font-mono"
                  autoComplete="off"
                />
              </InputGroup>
            </FormField>
            <div className="flex flex-col gap-1">
              <FormField label="One line about you" htmlFor="profile-bio" error={fieldError("profileBio")}>
                <Textarea
                  id="profile-bio"
                  rows={2}
                  maxLength={BIO_MAX}
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value)
                    touch("profileBio")
                  }}
                  placeholder="What you build at Novawerk, in one line."
                />
              </FormField>
              {/* Always visible, error or not. */}
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {bio.length} / {BIO_MAX}
              </p>
            </div>
            <SwitchRow
              htmlFor="profile-public"
              label="Public profile"
              description={handle.trim() || savedHandle ? "Anyone can see your name, handle, line and public projects." : "Choose a handle first."}
            >
              <Switch
                id="profile-public"
                checked={publicProfile}
                onCheckedChange={setPublicProfile}
                disabled={!handle.trim() && !savedHandle && !publicProfile}
              />
            </SwitchRow>
            {fieldError("publicProfile") && (
              <p role="alert" className="text-xs text-destructive">
                {fieldError("publicProfile")}
              </p>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {me.publicProfile && me.profileHandle && (
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={<a href={`${WEB_URL}/u/${me.profileHandle}`} target="_blank" rel="noreferrer" />}
            >
              <ExternalLinkIcon /> See it on the site
            </Button>
          )}
          <Button type="submit" disabled={!dirty || Boolean(savedHandle && !handle.trim()) || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Page>
  )
}
