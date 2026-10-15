"use client";

// Who is signed in, for the browser. The contributor session is an httpOnly cookie on the API's
// domain, so the website can't read it on the server: every page prerenders for a visitor, and the
// browser asks GET /auth/contributor/me after load, then the viewer's controls appear.
//
// It asks only when it matters: on task board pages (whatever calls useSession()), or anywhere
// when this browser signed in before (a "nw:contributor" flag in localStorage, no personal data).
// The header and the other always-there parts read the session passively and never trigger it.
// Members don't sign in here; their session (admin panel) never opens /contrib.

import type { ContributorMe } from "@nw/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api, SIGNED_OUT_EVENT } from "./contrib-api";

export type Session =
  /** Nobody asked yet (a page outside the task board, never signed in here). Shown as a visitor. */
  | { status: "idle" }
  | { status: "loading" }
  | { status: "signed-out" }
  /** The API isn't configured or can't be reached: show public pages, hide account controls. */
  | { status: "unavailable" }
  | { status: "signed-in"; me: ContributorMe };

type SessionContextValue = {
  session: Session;
  /** Ask the API once, if nobody has yet. */
  ensure: () => void;
  /** Ask the API again (after signing in, linking GitHub, saving the profile). */
  refresh: () => Promise<Session>;
  /** Replace the signed-in contributor with what an API call just returned. */
  setMe: (me: ContributorMe) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const HINT_KEY = "nw:contributor";
function hint(on?: boolean): boolean {
  try {
    if (on === true) window.localStorage.setItem(HINT_KEY, "1");
    else if (on === false) window.localStorage.removeItem(HINT_KEY);
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session>({ status: "idle" });
  const asked = useRef(false);

  const setSession = useCallback((next: Session) => {
    if (next.status === "signed-in") hint(true);
    if (next.status === "signed-out") hint(false);
    setSessionState(next);
  }, []);

  const refresh = useCallback(async (): Promise<Session> => {
    asked.current = true;
    const res = await api<ContributorMe>("/auth/contributor/me");
    const next: Session = res.ok
      ? { status: "signed-in", me: res.data }
      : res.status === 401
        ? { status: "signed-out" }
        : { status: "unavailable" };
    setSession(next);
    return next;
  }, [setSession]);

  const ensure = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    setSessionState((s) => (s.status === "idle" ? { status: "loading" } : s));
    void refresh();
  }, [refresh]);

  // Signed in here before: ask on every page, so the header shows the account.
  useEffect(() => {
    if (hint()) ensure();
  }, [ensure]);

  // Any /contrib call that comes back 401 means the session ended (expired, signed out elsewhere).
  useEffect(() => {
    const onSignedOut = () => setSession({ status: "signed-out" });
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [setSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      ensure,
      refresh,
      setMe: (me) => setSession({ status: "signed-in", me }),
      signOut: async () => {
        await api("/auth/contributor/logout", { method: "POST" });
        setSession({ status: "signed-out" });
      },
    }),
    [session, ensure, refresh, setSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession needs <SessionProvider>");
  return value;
}

/** The session, for task board pages: asks the API if nobody has yet ("idle" reads as loading). */
export function useSession(): SessionContextValue {
  const value = useSessionContext();
  const { ensure } = value;
  useEffect(() => ensure(), [ensure]);
  return value.session.status === "idle" ? { ...value, session: { status: "loading" } } : value;
}

/** The session as it is, without asking: for the header and other parts on every page. */
export function usePassiveSession(): SessionContextValue {
  return useSessionContext();
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
