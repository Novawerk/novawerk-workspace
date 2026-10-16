import { createFileRoute } from "@tanstack/react-router"
import { ExternalLinkIcon } from "lucide-react"

import { PageHeader } from "@nw/ui/compound/page-header"
import { Button } from "@nw/ui/core/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@nw/ui/core/components/ui/card"

import { Page } from "@/components/page"
import { WEB_URL } from "@/lib/env"

/**
 * One account, one profile (NB-ADR-0014): name, handle, picture, bio and whether it is public are
 * edited in one place, novawerk.io/settings. The admin panel, the site and the chat show it.
 */
export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
})

function ProfilePage() {
  const { me } = Route.useRouteContext()
  const handle = me.profileHandle

  return (
    <Page
      header={
        <PageHeader
          eyebrow="You"
          title="Your profile"
          description="One Novawerk account for the site, this panel and the team chat. You edit it on novawerk.io."
        />
      }
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{me.displayName}</CardTitle>
          <CardDescription>
            {handle ? <span className="font-mono">@{handle}</span> : null}
            {handle ? " · " : null}
            {me.role === "maintainer" ? "Maintainer" : "Member"} ·{" "}
            {me.publicProfile ? "Public profile" : "Private profile"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<a href={`${WEB_URL}/settings`} />}>
            <ExternalLinkIcon /> Account and sign-in
          </Button>
          {handle && (
            <Button variant="outline" nativeButton={false} render={<a href={`${WEB_URL}/u/${handle}/edit`} />}>
              <ExternalLinkIcon /> Edit your profile
            </Button>
          )}
          {me.publicProfile && handle && (
            <Button variant="ghost" nativeButton={false} render={<a href={`${WEB_URL}/u/${handle}`} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon /> See it on the site
            </Button>
          )}
        </CardContent>
      </Card>
    </Page>
  )
}
