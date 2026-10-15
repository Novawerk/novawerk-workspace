"use client";

// Who is signed in, for the browser. The contributor session is an httpOnly cookie on the API's
// domain, so the website can't read it on the server: every page prerenders for a visitor and this
// provider asks GET /auth/contributor/me after load, then the viewer's controls appear.
// Members don't sign in here; their session (admin panel) never opens /contrib.

import type { ContributorMe } from "@nw/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./contrib-api";

export type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  /** The API isn't configured or can't be reached: show public pages, hide account controls. */
  | { status: "unavailable" }
  | { status: "signed-in"; me: ContributorMe };

type SessionContextValue = {
  session: Session;
  /** Ask the API again (after signing in, linking GitHub, saving the profile). */
  refresh: () => Promise<Session>;
  /** Replace the signed-in contributor with what an API call just returned. */
  setMe: (me: ContributorMe) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const started = useRef(false);

  const refresh = useCallback(async (): Promise<Session> => {
    const res = await api<ContributorMe>("/auth/contributor/me");
    const next: Session = res.ok
      ? { status: "signed-in", me: res.data }
      : res.status === 401
        ? { status: "signed-out" }
        : { status: "unavailable" };
    setSession(next);
    return next;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      refresh,
      setMe: (me) => setSession({ status: "signed-in", me }),
      signOut: async () => {
        await api("/auth/contributor/logout", { method: "POST" });
        setSession({ status: "signed-out" });
      },
    }),
    [session, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs <SessionProvider>");
  return value;
}

/** The signed-in contributor, or null (loading, signed out, or unavailable). */
export function useMe(): ContributorMe | null {
  const { session } = useSession();
  return session.status === "signed-in" ? session.me : null;
}

// ─── Toasts ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<(message: string) => void>(() => {});

/** One short message at the bottom of the screen, read out by screen readers. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {message ? <p className="bg-ink px-4 py-2.5 text-sm text-paper shadow-lg">{message}</p> : null}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
