"use client";

// "Continue with Google": Google's own button (Google Identity Services). It hands us an ID token,
// which the API checks (POST /auth/google) before it signs anyone in. Needs
// NEXT_PUBLIC_GOOGLE_CLIENT_ID; without it there is no button.

import { useEffect, useRef } from "react";

const GIS_SRC = "https://accounts.google.com/gsi/client";

type GoogleAccountsId = {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: "popup" | "redirect";
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
      locale?: string;
    },
  ): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

/** Must be referenced literally so Next inlines it into the client bundle. */
export const googleClientId = (): string | null => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;

let gisPromise: Promise<void> | null = null;

/** Load the GIS script once per page. */
function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisPromise = null;
      reject(new Error("Couldn't load Google sign-in. Check your connection or content blocker."));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

export function GoogleButton({
  clientId,
  onCredential,
  onError,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest callbacks, without initialising GIS again on every render.
  const callbacks = useRef({ onCredential, onError });
  useEffect(() => {
    callbacks.current = { onCredential, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentityServices()
      .then(() => {
        const gis = window.google?.accounts.id;
        if (cancelled || !gis || !ref.current) return;
        gis.initialize({
          client_id: clientId,
          callback: (response) => callbacks.current.onCredential(response.credential),
          ux_mode: "popup",
          cancel_on_tap_outside: true,
        });
        ref.current.replaceChildren();
        gis.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.min(ref.current.clientWidth || 396, 400),
          // The site is in English; Google would follow the browser.
          locale: "en",
        });
      })
      .catch((error: Error) => callbacks.current.onError(error.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <div ref={ref} className="flex min-h-11 w-full justify-center" />;
}
