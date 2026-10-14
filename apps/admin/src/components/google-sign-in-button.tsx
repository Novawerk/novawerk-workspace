import * as React from "react"
import { useTheme } from "@nw/ui/compound/theme-provider"

const GIS_SRC = "https://accounts.google.com/gsi/client"

// The slice of the Google Identity Services API we use.
type CredentialResponse = { credential: string }
type GoogleAccountsId = {
  initialize(config: {
    client_id: string
    callback: (response: CredentialResponse) => void
    ux_mode?: "popup" | "redirect"
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon"
      theme?: "outline" | "filled_blue" | "filled_black"
      size?: "large" | "medium" | "small"
      text?: "signin_with" | "signup_with" | "continue_with" | "signin"
      shape?: "rectangular" | "pill" | "circle" | "square"
      logo_alignment?: "left" | "center"
      width?: number
    },
  ): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

let gisPromise: Promise<void> | null = null

/** Load the GIS script once per page. */
function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisPromise = null
      reject(new Error("Couldn't load Google sign-in. Check your connection or content blocker."))
    }
    document.head.appendChild(script)
  })
  return gisPromise
}

/**
 * Google's own "Sign in with Google" button (Google Identity Services).
 * Calls `onCredential` with the ID token; the caller sends it to POST /auth/google.
 */
export function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
}: {
  clientId: string
  onCredential: (credential: string) => void
  onError: (message: string) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  // Keep the latest callbacks without re-initialising GIS on every render.
  const callbacks = React.useRef({ onCredential, onError })
  callbacks.current = { onCredential, onError }

  React.useEffect(() => {
    let cancelled = false
    loadGoogleIdentityServices()
      .then(() => {
        const gis = window.google?.accounts.id
        if (cancelled || !gis || !ref.current) return
        gis.initialize({
          client_id: clientId,
          callback: (response) => callbacks.current.onCredential(response.credential),
          ux_mode: "popup",
          cancel_on_tap_outside: true,
        })
        ref.current.replaceChildren()
        gis.renderButton(ref.current, {
          type: "standard",
          theme: resolvedTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          logo_alignment: "left",
          width: 280,
        })
      })
      .catch((error: Error) => callbacks.current.onError(error.message))
    return () => {
      cancelled = true
    }
  }, [clientId, resolvedTheme])

  return <div ref={ref} className="flex min-h-11 justify-center" />
}
