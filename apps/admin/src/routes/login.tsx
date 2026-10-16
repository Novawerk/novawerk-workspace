import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react"

import { NovaStar } from "@nw/ui/compound/nova-star"
import { Button } from "@nw/ui/core/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nw/ui/core/components/ui/card"
import { Input } from "@nw/ui/core/components/ui/input"

import { dataSource } from "@/lib/data-source"
import { DEV_LOGIN, DEV_LOGIN_EMAIL, USE_SAMPLE_DATA, WEB_URL } from "@/lib/env"
import { queryKeys } from "@/lib/queries"

/**
 * One sign-in for everyone, on novawerk.io (NB-ADR-0014): GitHub, Google or an emailed code. The
 * session cookie is the API's, so the panel opens as soon as the site has signed you in. `denied`:
 * signed in, but the panel doesn't open for this account.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { denied?: boolean } =>
    search.denied === true || search.denied === "true" ? { denied: true } : {},
  component: LoginPage,
})

/** novawerk.io/sign-in, sending people back here afterwards. */
const signInUrl = () => `${WEB_URL}/sign-in?returnTo=${encodeURIComponent(`${window.location.origin}/projects`)}`

function LoginPage() {
  const { denied } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [devEmail, setDevEmail] = React.useState(DEV_LOGIN_EMAIL)

  const signOut = async () => {
    await dataSource.signOut().catch(() => undefined)
    queryClient.clear()
    await navigate({ to: "/login" })
  }

  const signInDev = async () => {
    setBusy(true)
    setError(null)
    try {
      await dataSource.signInDev(devEmail)
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      await navigate({ to: "/projects" })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "We couldn't sign you in.")
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <NovaStar className="mx-auto mb-2 size-12" title="Novawerk" />
          <CardTitle className="text-xl">{denied ? "Not for this account" : "Sign in to Novawerk"}</CardTitle>
          <CardDescription>
            {denied
              ? "The admin panel opens for maintainers and for the members of a project's team. Your account is neither yet."
              : "One Novawerk account for the site, this panel and the team chat. You sign in on novawerk.io."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {denied ? (
            <>
              <Button className="w-full max-w-72" nativeButton={false} render={<a href={`${WEB_URL}/settings`} />}>
                <ExternalLinkIcon /> Your account on novawerk.io
              </Button>
              <Button variant="ghost" className="w-full max-w-72" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <Button size="lg" className="w-full max-w-72" nativeButton={false} render={<a href={signInUrl()} />}>
              Sign in on novawerk.io
            </Button>
          )}
          {DEV_LOGIN && (
            <form
              className="flex w-full max-w-72 flex-col gap-2 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void signInDev()
              }}
            >
              <label htmlFor="dev-email" className="text-xs font-medium text-muted-foreground">
                Local dev sign-in (no Google)
              </label>
              <Input
                id="dev-email"
                type="email"
                value={devEmail}
                onChange={(event) => setDevEmail(event.target.value)}
                placeholder="admin@novawerk.io"
                required
              />
              <Button type="submit" variant="secondary" disabled={busy}>
                Sign in as this member
              </Button>
            </form>
          )}
          {error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        {USE_SAMPLE_DATA && (
          <CardFooter className="flex-col gap-2 border-t text-center">
            <p className="text-xs text-muted-foreground">Sample-data mode is on. No sign-in needed.</p>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/projects" />}>
              <FlaskConicalIcon /> Browse sample data
            </Button>
          </CardFooter>
        )}
      </Card>
    </main>
  )
}
