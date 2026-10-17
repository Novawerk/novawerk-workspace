"use client";

import { accountDeleteInput, type AccountMe, type ContributorTokenInfo, type MyProposal } from "@nw/contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";

import { Note } from "@/components/board/bits";
import { maskEmail } from "@/components/board/labels";
import { Check, SignInPanel } from "@/components/board/sign-in";
import { NewsletterForm } from "@/components/newsletter-form";
import { buttonOutline, buttonSmallDanger, buttonSmallOutline, field, textLink } from "@/components/ui";
import { sendForm } from "@/lib/api";
import { track } from "@/lib/analytics";
import { api, githubStartUrl } from "@/lib/contrib-api";
import { useSession, useToast } from "@/lib/session";
import { CHAT_URL } from "@/lib/site";

const card = "grid gap-4 border border-line bg-paper p-5 sm:p-6";

/** The admin panel, for maintainers and project teams (NB-ADR-0014). */
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL?.trim() || "https://admin.novawerk.io";

/** `?error=chat-…` from GET /auth/chat: why the chat didn't open. */
const CHAT_ERRORS: Record<string, string> = {
  "chat-no-email": "The team chat needs an email address on your account. Add one below, then open the chat again.",
  "chat-suspended": "This account is suspended, so the team chat is closed to it too.",
  "chat-closed": "This account is closed, so the team chat is closed to it too.",
};

export function AccountSettings() {
  const { session } = useSession();
  if (session.status === "loading") return <p className="text-sm text-muted">Loading…</p>;
  if (session.status !== "signed-in") {
    return (
      <div className="max-w-[460px] border border-line bg-paper p-6">
        <SignInPanel returnTo="/settings" heading={false} />
      </div>
    );
  }
  return <Account me={session.me} />;
}

function Account({ me }: { me: AccountMe }) {
  const params = useSearchParams();
  const linkError = params.get("error") === "github-linked-elsewhere";
  const chatError = CHAT_ERRORS[params.get("error") ?? ""];
  const github = githubStartUrl("/settings");
  const [addingEmail, setAddingEmail] = useState(false);
  const toast = useToast();

  return (
    <>
      <section aria-labelledby="signin" className={card}>
        <h2 id="signin" className="text-lg font-semibold tracking-tight">
          Sign-in
        </h2>
        {chatError ? <Note tone="danger">{chatError}</Note> : null}
        {linkError ? (
          <Note tone="danger">
            {me.github ? (
              <>
                <b>This account stays linked to {me.github.login ? `@${me.github.login}` : "its GitHub account"}.</b> We never swap one GitHub
                account for another, because merged pull requests are matched to tasks by it. To use a different GitHub account, sign out and
                continue with that one; it gets its own Novawerk account.
              </>
            ) : (
              <>
                <b>That GitHub account already belongs to another Novawerk account.</b> To use it, sign out and continue with GitHub. To link
                GitHub to this account instead, sign out of github.com, sign in there as a different user, then press Link GitHub again.
              </>
            )}
          </Note>
        ) : null}
        <dl className="grid gap-3 text-sm">
          <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
            <dt className="text-[13px] text-muted">Role</dt>
            <dd className="flex flex-wrap items-center justify-between gap-2">
              <span>{me.role === "maintainer" ? "Maintainer" : "Member"}</span>
              <span className="flex flex-wrap gap-2">
                <a className={buttonSmallOutline} href={CHAT_URL}>
                  Open the team chat
                </a>
                {me.adminPanel ? (
                  <a className={buttonSmallOutline} href={ADMIN_URL}>
                    Open the admin panel
                  </a>
                ) : null}
              </span>
            </dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
            <dt className="text-[13px] text-muted">GitHub</dt>
            <dd className="flex flex-wrap items-center justify-between gap-2">
              {me.github ? (
                <>
                  <span className="font-mono">{me.github.login ?? `GitHub #${me.github.id}`}</span>
                  <span className="text-[13px] text-muted">Linked · used to match pull requests</span>
                </>
              ) : (
                <>
                  <span className="text-muted">Not linked. You need it to propose and open pull requests.</span>
                  {github ? (
                    <a className={buttonSmallOutline} href={github} onClick={() => track("sign_in_start", { method: "github" })}>
                      Link GitHub
                    </a>
                  ) : null}
                </>
              )}
            </dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
            <dt className="text-[13px] text-muted">Email</dt>
            <dd className="flex flex-wrap items-center justify-between gap-2">
              {me.email ? (
                <>
                  <span>{maskEmail(me.email)}</span>
                  <span className="text-[13px] text-muted">Signs in with Google or an emailed code</span>
                </>
              ) : (
                <>
                  {me.notifyEmail ? (
                    <span>
                      Notices go to {me.notifyEmail} <span className="text-muted">(from GitHub)</span>
                    </span>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                  {addingEmail ? null : (
                    <button type="button" className={buttonSmallOutline} onClick={() => setAddingEmail(true)}>
                      Add an address
                    </button>
                  )}
                </>
              )}
            </dd>
          </div>
        </dl>
        {addingEmail && !me.email ? (
          <div className="grid max-w-[420px] gap-2 border-t border-line pt-4">
            <p className="text-sm">Sign in with Google or an emailed code as well. Your account stays the same.</p>
            <SignInPanel
              returnTo="/settings"
              heading={false}
              link
              onSignedIn={() => {
                setAddingEmail(false);
                toast("Address added.");
              }}
            />
          </div>
        ) : null}
        <p className="text-[13px] text-muted">One account for the task board, the admin panel and the team chat. Only you see your email.</p>
      </section>

      <Notifications me={me} />
      <Privacy me={me} />
      <DeleteAccount me={me} />
    </>
  );
}

function Notifications({ me }: { me: AccountMe }) {
  const { setMe } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (patch: { notifyReplies?: boolean; notifyReminders?: boolean }) => {
    setBusy(true);
    const res = await api<AccountMe>("/contrib/me/profile", { method: "PATCH", body: patch });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    setMe(res.data);
    toast("Saved.");
  };
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const subscribe = async () => {
    if (!me.email) return;
    setState("sending");
    const res = await sendForm("newsletter", { email: me.email, website: "" });
    setState(res.ok ? "sent" : "idle");
    if (!res.ok) toast("The signup didn't go through. Please try again.");
  };
  return (
    <section aria-labelledby="notifications" className={card}>
      <h2 id="notifications" className="text-lg font-semibold tracking-tight">
        Notifications
      </h2>
      <p className="text-sm">
        We email {me.email ? maskEmail(me.email) : me.notifyEmail ? `${me.notifyEmail} (from GitHub)` : "your address"} about your own account and
        tasks: sign-in codes, a maintainer&apos;s decision on your
        proposal, a task you hold being released or closed, what happened to a suggestion of yours, Werk you earn, and a goodbye when you delete the
        account. Pull request reviews come from GitHub, as usual.
      </p>
      <div className="grid gap-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">You can turn these off</h3>
        <Check checked={me.notifyReplies} disabled={busy} onChange={(v) => void save({ notifyReplies: v })}>
          Replies to your posts and on your tasks <span className="block text-[13px] text-muted">At most one email per task an hour.</span>
        </Check>
        <Check checked={me.notifyReminders} disabled={busy} onChange={(v) => void save({ notifyReminders: v })}>
          Reminders when a task you hold has had no activity for 7 days
          <span className="block text-[13px] text-muted">We still release it after 14 days without activity.</span>
        </Check>
        <p className="text-[13px] text-muted">Every reply and reminder email also has a one-click link to turn it off.</p>
      </div>
      <div className="grid gap-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Monthly newsletter</h3>
        <p className="text-[13px] text-muted">Posts, open tasks and who shipped what. We ask you to confirm by email first; every issue has a one-click unsubscribe.</p>
        {state === "sent" ? (
          <Note tone="ok">Check your inbox. Nothing arrives until you click the link.</Note>
        ) : me.email ? (
          <div>
            <button type="button" className={buttonSmallOutline} disabled={state === "sending"} onClick={subscribe}>
              {state === "sending" ? "Sending…" : `Subscribe ${maskEmail(me.email)}`}
            </button>
          </div>
        ) : (
          <NewsletterForm idPrefix="settings-newsletter" />
        )}
      </div>
    </section>
  );
}

function Privacy({ me }: { me: AccountMe }) {
  const { setMe } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const save = async (patch: { public?: boolean; onWall?: boolean }) => {
    setBusy(true);
    const res = await api<AccountMe>("/contrib/me/profile", { method: "PATCH", body: patch });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    setMe(res.data);
    toast("Saved.");
  };

  const download = async () => {
    // Everything kept about the account that only its owner can read. Posts, suggestions and the
    // tasks you worked on are public on the board already.
    const [mine, proposals, votes, tokens] = await Promise.all([
      api<AccountMe>("/auth/me"),
      api<MyProposal[]>("/contrib/me/proposals"),
      api<{ taskIds: string[] }>("/contrib/me/votes"),
      api<ContributorTokenInfo[]>("/contrib/tokens"),
    ]);
    if (!mine.ok) return toast(mine.error);
    const data = {
      exportedFrom: "novawerk.io",
      account: mine.data,
      proposals: proposals.ok ? proposals.data : [],
      votes: votes.ok ? votes.data.taskIds : [],
      tokens: tokens.ok ? tokens.data : [],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `novawerk-${me.handle}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="privacy" className={card}>
      <h2 id="privacy" className="text-lg font-semibold tracking-tight">
        Privacy
      </h2>
      <Check checked={me.public} disabled={busy} onChange={(v) => void save({ public: v })}>
        Public profile at{" "}
        <Link className={`${textLink} font-mono`} href={`/u/${me.handle}`}>
          /u/{me.handle}
        </Link>
        <span className="block text-[13px] text-muted">Off hides the page and takes you off the wall. Tasks still show your handle, unlinked.</span>
      </Check>
      <Check checked={me.public && me.onWall} disabled={busy || !me.public} onChange={(v) => void save({ onWall: v })}>
        Show me on the{" "}
        <Link className={textLink} href="/contributors">
          contributors wall
        </Link>{" "}
        and in the GitHub README
        {!me.public ? <span className="block text-[13px] text-muted">Needs a public profile.</span> : null}
      </Check>
      <p className="text-[13px] text-muted">We count page visits without cookies and never link them to you.</p>
      <div>
        <button type="button" className={buttonSmallOutline} onClick={download}>
          Download my data (JSON)
        </button>
      </div>
    </section>
  );
}

function DeleteAccount({ me }: { me: AccountMe }) {
  const { signOut } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const matches = typed.trim().toLowerCase() === me.handle;

  const remove = async () => {
    const parsed = accountDeleteInput.safeParse({ confirmHandle: typed });
    if (!parsed.success || !matches) return;
    setBusy(true);
    const res = await api("/contrib/me", { method: "DELETE", body: parsed.data });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    track("account_deleted", {});
    await signOut();
    toast("Your account is deleted. Thank you for the work you did with us.");
    router.push("/");
  };

  return (
    <section aria-labelledby="delete" className={`${card} border-danger/45`}>
      <h2 id="delete" className="text-lg font-semibold tracking-tight">
        Delete account
      </h2>
      <p className="text-sm text-muted">
        We remove your profile, proposals, votes and tokens, and a task you hold goes back on the board. Merged work stays in git history under your
        GitHub name; tasks show &ldquo;a former contributor&rdquo;.
      </p>
      {asking ? (
        <div className="grid gap-2">
          <label htmlFor={id} className="text-sm font-medium">
            Type your handle to confirm
          </label>
          <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={me.handle} autoComplete="off" className={`${field} h-10 max-w-[260px] font-mono`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!matches || busy} className={`${buttonSmallDanger} h-10 px-4`} onClick={remove}>
              {busy ? "Deleting…" : "Delete my account"}
            </button>
            <button type="button" className={`${buttonOutline} h-10`} onClick={() => setAsking(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className={buttonSmallDanger} onClick={() => setAsking(true)}>
            Delete account…
          </button>
        </div>
      )}
    </section>
  );
}
