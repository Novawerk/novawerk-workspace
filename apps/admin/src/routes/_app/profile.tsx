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
import { errorMessage, issueFor } from "@/lib/errors"
import { meQueryOptions, useUpdateMe } from "@/lib/queries"

const BIO_MAX = 160
const WEB_URL = "https://novawerk.io"

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

  const dirty =
    publicProfile !== me.publicProfile || handle.trim() !== (me.profileHandle ?? "") || bio.trim() !== (me.profileBio ?? "")

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    save.mutate(
      {
        publicProfile,
        ...(handle.trim() && handle.trim() !== me.profileHandle ? { profileHandle: handle.trim() } : {}),
        profileBio: bio,
      },
      {
        onSuccess: (saved) => toast.success(saved.publicProfile ? "Your profile is public" : "Saved. Your profile stays private."),
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
              error={issueFor(save.error, "profileHandle")}
              hint="Lowercase letters, digits and dashes. Contributors use the same names, so it must be free."
            >
              <InputGroup>
                <InputGroupAddon className="font-mono text-xs">novawerk.io/u/</InputGroupAddon>
                <InputGroupInput
                  id="profile-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  placeholder="your-name"
                  className="font-mono"
                  autoComplete="off"
                />
              </InputGroup>
            </FormField>
            <FormField
              label="One line about you"
              htmlFor="profile-bio"
              error={issueFor(save.error, "profileBio")}
              hint={`${bio.length} / ${BIO_MAX}`}
            >
              <Textarea
                id="profile-bio"
                rows={2}
                maxLength={BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What you build at Novawerk, in one line."
              />
            </FormField>
            <SwitchRow
              htmlFor="profile-public"
              label="Public profile"
              description={handle.trim() ? "Anyone can see your name, handle, line and public projects." : "Pick a handle first."}
            >
              <Switch
                id="profile-public"
                checked={publicProfile}
                onCheckedChange={setPublicProfile}
                disabled={!handle.trim() && !publicProfile}
              />
            </SwitchRow>
            {issueFor(save.error, "publicProfile") && (
              <p role="alert" className="text-xs text-destructive">
                {issueFor(save.error, "publicProfile")}
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
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Page>
  )
}
