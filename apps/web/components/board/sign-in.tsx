"use client";

import { emailStartInput, emailVerifyInput, profileUpdateInput, type AccountMe, type ContributorMe } from "@nw/contracts";
import Link from "next/link";
import { createContext, useContext, useEffect, useId, useState } from "react";

import { sendForm } from "@/lib/api";
import { track } from "@/lib/analytics";
import { api, githubStartUrl } from "@/lib/contrib-api";
import { usePassiveSession, useToast } from "@/lib/session";

import { buttonInk, buttonOutline, field, fieldHint, fieldLabel, textLink } from "../ui";
import { Dialog, dialogButton, dialogButtonAccent, dialogField } from "./dialog";
import { GoogleButton, googleClientId } from "./google-button";

// ─── The pledge ──────────────────────────────────────────────────────────────

const PledgeContext = createContext<{ lines: string[]; open: () => void }>({ lines: [], open: () => {} });
export const usePledge = () => useContext(PledgeContext);

/** The community pledge from knowledge/, and a dialog that shows it from anywhere. */
export function PledgeProvider({ lines, children }: { lines: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <PledgeContext.Provider value={{ lines, open: () => setOpen(true) }}>
      {children}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Community pledge"
        meta="Four lines on how we show up for each other. Everyone on the task board works by them."
        width="sm:max-w-[520px]"
        footer={
          <button type="button" className={dialogButton} onClick={() => setOpen(false)}>
            Close
          </button>
        }
      >
        <ol className="grid gap-3">
          {lines.map((line, i) => (
            <li key={line} className="grid grid-cols-[2rem_1fr] gap-2 text-[15px]">
              <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Dialog>
    </PledgeContext.Provider>
  );
}

export function PledgeLink({ children = "community pledge" }: { children?: React.ReactNode }) {
  const { open } = usePledge();
  return (
    <button type="button" className={textLink} onClick={open}>
      {children}
    </button>
  );
}

// ─── Signing in ──────────────────────────────────────────────────────────────

const GITHUB_ERRORS: Record<string, string> = {
  github: "Signing in with GitHub didn't work. Please try again, or use Google or an email code.",
  inactive: "This account is closed. Write to info@novawerk.io if that's a mistake.",
};

/**
 * One Novawerk account for everything (NB-ADR-0014): the task board, the admin panel and the
 * chat. GitHub first (it matches pull requests to tasks), then Google, then an emailed code.
 * With `link`, Google or a code adds an address to the signed-in account instead.
 */
export function SignInPanel({
  returnTo,
  heading = true,
  error,
  link = false,
  onSignedIn,
}: {
  returnTo: string;
  heading?: boolean;
  /** `?error=` from the API's GitHub callback. */
  error?: string | null;
  link?: boolean;
  onSignedIn?: (me: AccountMe) => void;
}) {
  const { setMe } = usePassiveSession();
  const github = link ? null : githubStartUrl(returnTo);
  const google = googleClientId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(error ? (GITHUB_ERRORS[error] ?? GITHUB_ERRORS.github) : null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const codeId = useId();

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = emailStartInput.safeParse({ email });
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? "Enter your email address");
    setBusy(true);
    setProblem(null);
    track("sign_in_start", { method: "email" });
    const res = await api("/auth/email/start", { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return setProblem(res.issues.email?.[0] ?? res.error);
    setStep("code");
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = emailVerifyInput.safeParse({ email, code, ...(link ? { link } : {}) });
    if (!parsed.success) return setProblem("Enter the six digits from the email");
    setBusy(true);
    setProblem(null);
    const res = await api<AccountMe>("/auth/email/verify", { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return setProblem(res.issues.code?.[0] ?? res.issues.email?.[0] ?? res.error);
    done("email", res.data);
  };

  const withGoogle = async (credential: string) => {
    setBusy(true);
    setProblem(null);
    track("sign_in_start", { method: "google" });
    const res = await api<AccountMe>("/auth/google", { method: "POST", body: { credential, ...(link ? { link } : {}) } });
    setBusy(false);
    if (!res.ok) return setProblem(res.issues.email?.[0] ?? res.error);
    done("google", res.data);
  };

  const done = (method: "email" | "google", me: AccountMe) => {
    track("sign_in_done", { method, firstRun: me.defaultHandle || !me.pledgeAccepted });
    setMe(me);
    onSignedIn?.(me);
  };

  return (
    <div className="grid gap-4">
      {heading ? (
        <div className="grid gap-2">
          <p className="font-mono text-xs text-muted sm:text-sm">Novawerk</p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        </div>
      ) : null}
      {link ? null : (
        <p className="text-sm text-muted">One account for the task board, the admin panel and the team chat. The first sign-in creates it.</p>
      )}

      {github ? (
        <>
          <a href={github} className={`${buttonInk} w-full`} onClick={() => track("sign_in_start", { method: "github" })}>
            <GitHubMark />
            Continue with GitHub
          </a>
          <p className="text-[13px] text-muted">We use GitHub to match your merged pull requests to tasks. We only read your public profile.</p>
        </>
      ) : null}
      {google ? (
        <GoogleButton clientId={google} onCredential={(c) => void withGoogle(c)} onError={setProblem} />
      ) : null}

      {github || google ? (
        <div className="flex items-center gap-3 text-[13px] text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}

      {step === "email" ? (
        <form onSubmit={sendCode} noValidate className="grid gap-3">
          <label htmlFor={emailId} className={fieldLabel}>
            Email me a code
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${field} h-11`}
          />
          <button type="submit" disabled={busy} className={buttonOutline}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} noValidate className="grid gap-3">
          <label htmlFor={codeId} className={fieldLabel}>
            The six digits we sent to {email}
            <span className={`mt-1 block ${fieldHint}`}>It works for 10 minutes. Check your spam folder if it isn&apos;t there.</span>
          </label>
          <input
            id={codeId}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${field} h-11 font-mono tracking-[0.3em]`}
            autoFocus
          />
          <button type="submit" disabled={busy} className={buttonInk}>
            {busy ? "Checking…" : link ? "Add this address" : "Sign in"}
          </button>
          <button type="button" className={`${textLink} justify-self-start text-sm`} onClick={() => setStep("email")}>
            Use another address
          </button>
        </form>
      )}

      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      {link ? null : (
        <p className="text-[13px] text-muted">With Google or email you can browse, discuss and suggest. Link GitHub before you propose or open a pull request.</p>
      )}
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** The sign-in dialog, for "Propose a plan" and other actions a visitor tries. */
export function SignInDialog({
  open,
  onClose,
  title = "Sign in",
  returnTo,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  returnTo: string;
  /** false: only × or Escape close it (the confirm-link prompt, which is the point of the visit). */
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (open) track("sign_in_open", { placement: "dialog" });
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} width="sm:max-w-[440px]" closeOnBackdrop={closeOnBackdrop}>
      <SignInPanel returnTo={returnTo} heading={false} onSignedIn={onClose} />
    </Dialog>
  );
}

// ─── First run ───────────────────────────────────────────────────────────────

/** Needs the first-run setup: a neutral handle from an email sign-up, or the pledge not yet accepted. */
export const needsSetup = (me: Pick<ContributorMe, "defaultHandle" | "pledgeAccepted">) => me.defaultHandle || !me.pledgeAccepted;

/**
 * After the first sign-in: handle (from GitHub, or picked now), display name, public profile (off by
 * default), the monthly newsletter (off by default, double opt-in), and the pledge + DCO tick.
 */
export function FirstRunDialog() {
  const { session, setMe, signOut } = usePassiveSession();
  const toast = useToast();
  const me = session.status === "signed-in" ? session.me : null;
  const open = !!me && needsSetup(me);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [isPublic, setPublic] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Prefill once per account: adjusting state during render, not in an effect.
  if (me && seededFor !== me.id) {
    setSeededFor(me.id);
    setHandle(me.handle);
    setName(me.defaultHandle ? "" : me.displayName);
    setPublic(me.public);
  }

  if (!me) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const patch = {
      ...(handle.trim() && handle.trim() !== me.handle ? { handle: handle.trim().toLowerCase() } : {}),
      displayName: name.trim() || handle.trim() || me.handle,
      public: isPublic,
      acceptPledge: pledge ? (true as const) : undefined,
    };
    const local: Record<string, string> = {};
    if (!handle.trim()) local.handle = "Pick a handle";
    else if (me.defaultHandle && handle.trim().toLowerCase() === me.handle) local.handle = "Pick a handle of your own";
    if (!pledge) local.acceptPledge = "Please agree to the pledge to continue";
    const parsed = profileUpdateInput.safeParse(patch);
    if (!parsed.success) for (const issue of parsed.error.issues) local[String(issue.path[0] ?? "form")] ??= issue.message;
    setIssues(local);
    if (Object.keys(local).length > 0 || !parsed.success) return;

    setBusy(true);
    const res = await api<ContributorMe>("/contrib/me/profile", { method: "PATCH", body: parsed.data });
    setBusy(false);
    if (!res.ok) {
      setIssues(Object.fromEntries(Object.entries(res.issues).map(([k, v]) => [k, v[0] ?? ""])));
      if (Object.keys(res.issues).length === 0) toast(res.error);
      return;
    }
    if (newsletter && me.email) {
      const sub = await sendForm("newsletter", { email: me.email, website: "" });
      toast(sub.ok ? "Welcome. Check your inbox to confirm the newsletter." : "Welcome. The newsletter signup didn't go through; try again in Settings.");
    } else {
      toast(`Welcome, @${res.data.handle}.`);
    }
    setMe(res.data);
  };

  return (
    <Dialog
      open={open}
      // Required: Escape and the backdrop don't close it. "Sign out" in the footer is the way out
      // (it ends every session, so it must never happen by accident).
      onClose={() => {}}
      dismissible={false}
      title="Set up your Novawerk account"
      meta="One step. You can change all of this later in Settings."
      width="sm:max-w-[520px]"
      as="form"
      onSubmit={save}
      footer={
        <>
          <button type="button" className={dialogButton} onClick={() => void signOut()}>
            Sign out
          </button>
          <button type="submit" disabled={busy} className={dialogButtonAccent}>
            {busy ? "Saving…" : "Continue"}
          </button>
        </>
      }
    >
      <DialogInput
        id="fr-handle"
        label="Handle"
        hint={
          me.github?.login
            ? "Shown on tasks you take. From GitHub; you can change it."
            : me.defaultHandle
              ? `We picked @${me.handle} for now; change it here. Lowercase letters, digits and hyphens.`
              : "Shown on tasks you take. Lowercase letters, digits and hyphens."
        }
        value={handle}
        onChange={setHandle}
        mono
        error={issues.handle}
        placeholder="your-handle"
      />
      <DialogInput id="fr-name" label="Display name" value={name} onChange={setName} error={issues.displayName} placeholder="Your name" />
      <Check checked={isPublic} onChange={setPublic}>
        Show my profile publicly <span className="text-muted">(off by default; tasks still show your handle)</span>
      </Check>
      {me.email ? (
        <Check checked={newsletter} onChange={setNewsletter}>
          Send me the monthly newsletter <span className="text-muted">(we ask you to confirm by email)</span>
        </Check>
      ) : null}
      <div className="grid gap-1">
        <Check checked={pledge} onChange={setPledge}>
          I agree to the <PledgeLink /> and sign off my commits (DCO).
        </Check>
        {issues.acceptPledge ? <p className="text-sm text-danger">{issues.acceptPledge}</p> : null}
      </div>
      <p className="text-[13px] text-muted">
        We never show your email. You can delete your account any time in{" "}
        <Link href="/settings" className={textLink}>
          Settings
        </Link>
        .
      </p>
    </Dialog>
  );
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span>{children}</span>
    </label>
  );
}

function DialogInput({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  mono,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={fieldLabel}>
        {label}
        {hint ? <span className={`ml-1.5 ${fieldHint}`}>{hint}</span> : null}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${dialogField} ${mono ? "font-mono" : ""}`}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
