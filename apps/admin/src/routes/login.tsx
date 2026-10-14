import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { FlaskConicalIcon, Loader2Icon } from "lucide-react"

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

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { dataSource } from "@/lib/data-source"
import { DEV_LOGIN, DEV_LOGIN_EMAIL, GOOGLE_CLIENT_ID, USE_SAMPLE_DATA } from "@/lib/env"
import { queryKeys } from "@/lib/queries"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = React.useState<"idle" | "signing-in">("idle")
  const [error, setError] = React.useState<string | null>(null)

  const [devEmail, setDevEmail] = React.useState(DEV_LOGIN_EMAIL)

  const signIn = async (attempt: () => Promise<void>) => {
    setStatus("signing-in")
    setError(null)
    try {
      await attempt()
      await queryClient.invalidateQueries({ queryKey: queryKeys.me })
      await navigate({ to: "/projects" })
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : "We couldn't sign you in. Only Novawerk members can sign in here.",
      )
      setStatus("idle")
    }
  }

  // POST {API}/auth/google { credential } — the API checks the ID token and sets the session cookie.
  const handleCredential = (credential: string) => signIn(() => dataSource.signInWithGoogle(credential))

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <NovaStar className="mx-auto mb-2 size-12" title="Novawerk" />
          <CardTitle className="text-xl">Sign in to Novawerk</CardTitle>
          <CardDescription>
            For members: your projects, posts and files. Use Google, or get a code by email.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          {GOOGLE_CLIENT_ID ? (
            <GoogleSignInButton
              clientId={GOOGLE_CLIENT_ID}
              onCredential={(credential) => void handleCredential(credential)}
              onError={setError}
            />
          ) : (
            <Button variant="outline" size="lg" disabled className="w-full max-w-72">
              Sign in with Google
            </Button>
          )}
          {!GOOGLE_CLIENT_ID && (
            <p className="text-center text-xs text-muted-foreground">
              Google sign-in needs <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code>.
            </p>
          )}
          <div className="flex w-full max-w-72 items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <EmailCodeForm busy={status === "signing-in"} onSignIn={(attempt) => void signIn(attempt)} />
          {status === "signing-in" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" /> Signing you in…
            </p>
          )}
          {DEV_LOGIN && (
            <form
              className="flex w-full max-w-72 flex-col gap-2 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void signIn(() => dataSource.signInDev(devEmail))
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
              <Button type="submit" variant="secondary" disabled={status === "signing-in"}>
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

/**
 * Sign in by email: we send a 6-digit code to the address (if it belongs to a member) and the
 * member types it back. For anyone without a Google account.
 */
function EmailCodeForm({ busy, onSignIn }: { busy: boolean; onSignIn: (attempt: () => Promise<void>) => void }) {
  const [email, setEmail] = React.useState("")
  const [code, setCode] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      await dataSource.requestSignInCode(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send a code.")
    } finally {
      setSending(false)
    }
  }

  if (!sent) {
    return (
      <form className="flex w-full max-w-72 flex-col gap-2" onSubmit={(e) => void send(e)}>
        <label htmlFor="sign-in-email" className="text-xs font-medium text-muted-foreground">
          Email
        </label>
        <Input
          id="sign-in-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <Button type="submit" variant="outline" disabled={sending || busy}>
          {sending ? "Sending…" : "Email me a code"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    )
  }

  return (
    <form
      className="flex w-full max-w-72 flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSignIn(() => dataSource.signInWithCode(email, code))
      }}
    >
      <p className="text-xs text-muted-foreground">
        If <span className="font-medium text-foreground">{email}</span> belongs to a member, a 6-digit code is on its
        way. It works for 10 minutes.
      </p>
      <Input
        aria-label="Sign-in code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        placeholder="123456"
        className="text-center font-mono tracking-[0.4em]"
        autoFocus
        required
      />
      <Button type="submit" disabled={busy || code.length !== 6}>
        Sign in
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setSent(false)
          setCode("")
        }}
      >
        Use another email
      </Button>
    </form>
  )
}
