"use client";

import {
  SUGGESTION_WHERE,
  TASK_LIMITS,
  suggestionInput,
  type PublicTaskPage,
  type SuggestionKind,
  type SuggestionWhere,
} from "@nw/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Pills } from "@/components/board/dialog";
import { WHERE_LABELS } from "@/components/board/labels";
import { Check, SignInPanel } from "@/components/board/sign-in";
import { buttonAccent, buttonGhost, container, eyebrow, field, fieldHint, fieldLabel, textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { useSession, useToast } from "@/lib/session";

const SECURITY_EMAIL = "security@novawerk.io";

/** An improvement or a bug in our own tools. Suggesting needs a contributor account. */
export function SuggestForm() {
  const { session } = useSession();
  const me = session.status === "signed-in" ? session.me : null;

  if (session.status === "loading") {
    return <div className={`${container} py-16 text-sm text-muted`}>Loading…</div>;
  }
  if (!me) {
    return (
      <div className={`${container} grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:items-start`}>
        <div className="grid max-w-[60ch] gap-3">
          <p className={eyebrow}>Suggest a task</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sign in to suggest a task</h1>
          <p className="text-lg text-muted">Anyone can read the board. Suggesting needs a contributor account.</p>
          <Boundaries />
        </div>
        <div className="border border-line bg-paper p-6">
          <SignInPanel returnTo="/tasks/suggest" heading={false} />
        </div>
      </div>
    );
  }
  return <Form handle={me.handle} />;
}

function Form({ handle }: { handle: string }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<SuggestionKind>("improvement");
  const [body, setBody] = useState("");
  const [where, setWhere] = useState<SuggestionWhere | "">("");
  const [path, setPath] = useState("");
  const [doItMyself, setDoItMyself] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const ids = { title: useId(), body: useId(), where: useId(), path: useId() };

  // "You have N of 3 open suggestions": my suggestions still waiting on the board.
  useEffect(() => {
    let cancelled = false;
    void api<PublicTaskPage>("/public/tasks?status=suggested&limit=100").then((res) => {
      if (cancelled || !res.ok) return;
      setOpenCount(res.data.tasks.filter((t) => t.suggestedBy?.kind === "contributor" && t.suggestedBy.handle === handle).length);
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !busy;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    const parsed = suggestionInput.safeParse({ title, kind, body, where: where || undefined, path: path || undefined, doItMyself });
    if (!parsed.success) {
      setIssues(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
      return;
    }
    setIssues({});
    setProblem(null);
    setBusy(true);
    const res = await api<{ id: string }>("/contrib/suggestions", { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) {
      setIssues(Object.fromEntries(Object.entries(res.issues).map(([k, v]) => [k, v[0] ?? ""])));
      setProblem(res.error);
      return;
    }
    track("suggestion_sent", { kind });
    toast("Thanks. Your suggestion is on the board.");
    router.push(`/tasks/${res.data.id}`);
  };

  const err = (k: string) =>
    issues[k] ? (
      <p id={`${k}-error`} className="text-sm text-danger">
        {issues[k]}
      </p>
    ) : null;

  return (
    <div className={`${container} grid items-start gap-8 pt-5 pb-16 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:gap-12`}>
      <form onSubmit={send} noValidate className="grid gap-5">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Suggest a task</h1>
          <p className="text-[17px] text-muted">An improvement or a bug in our own tools: this site, the admin panel, the API or the agents.</p>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={ids.title} className={fieldLabel}>
            Title
          </label>
          <input
            id={ids.title}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short and specific, e.g. Remember my filters on the task board"
            aria-invalid={issues.title ? true : undefined}
            className={`${field} h-11`}
          />
          {err("title")}
        </div>

        <Pills
          name="kind"
          legend="Type"
          options={[
            { value: "improvement", label: "Improvement" },
            { value: "bug", label: "Bug" },
          ]}
          value={kind}
          onChange={setKind}
        />

        <div className="grid gap-1.5">
          <label htmlFor={ids.body} className={fieldLabel}>
            What and why <span className={fieldHint}>Markdown works</span>
          </label>
          <textarea
            id={ids.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === "bug" ? "What happened, what you expected, and the steps to see it." : "What should change, and who it helps."}
            aria-invalid={issues.body ? true : undefined}
            className={`${field} min-h-36 resize-y`}
          />
          {err("body")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={ids.where} className={fieldLabel}>
              Where in the product
            </label>
            <select
              id={ids.where}
              value={where}
              onChange={(e) => setWhere(e.target.value as SuggestionWhere)}
              aria-invalid={issues.where ? true : undefined}
              className={`${field} h-11`}
            >
              <option value="" disabled>
                Pick one
              </option>
              {SUGGESTION_WHERE.map((w) => (
                <option key={w} value={w}>
                  {WHERE_LABELS[w]}
                </option>
              ))}
            </select>
            {err("where")}
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={ids.path} className={fieldLabel}>
              Page or path <span className={fieldHint}>optional</span>
            </label>
            <input id={ids.path} value={path} onChange={(e) => setPath(e.target.value)} placeholder="/tasks, or apps/web/…" className={`${field} h-11 font-mono text-sm`} />
            {err("path")}
          </div>
        </div>

        <Check checked={doItMyself} onChange={setDoItMyself}>
          I&apos;d like to do this myself. <span className="text-muted">A member may assign it to you directly when they accept it.</span>
        </Check>

        {problem ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!canSend} className={`${buttonAccent} disabled:border-line-strong disabled:bg-subtle disabled:text-muted disabled:opacity-100`}>
            {busy ? "Sending…" : "Send suggestion"}
          </button>
          <Link href="/tasks" className={buttonGhost}>
            Cancel
          </Link>
        </div>
      </form>

      <aside className="grid gap-3.5">
        <Boundaries />
        <div className="grid gap-2 border border-line bg-paper p-5">
          <h2 className="text-sm font-semibold">What happens next</h2>
          <p className="text-[13px] text-muted">
            A member accepts it (and sets the size and Werk), marks it a duplicate, asks you for more, or declines it with a note. Accepted tasks say
            &ldquo;Suggested by @{handle}&rdquo; for good.
          </p>
          <p className="text-[13px] text-muted">Ideas earn credit on your profile. Werk comes only from merged work.</p>
        </div>
        {openCount !== null ? (
          <p className="text-[13px] text-muted">
            You have <b className="text-ink">{openCount}</b> of {TASK_LIMITS.openSuggestions} open suggestions.
          </p>
        ) : null}
      </aside>
    </div>
  );
}

/** Where a suggestion doesn't belong. */
function Boundaries() {
  const item = "grid grid-cols-[18px_minmax(0,1fr)] gap-2 text-sm";
  const dot = <span aria-hidden="true" className="mt-[7px] size-2 bg-accent" />;
  return (
    <div className="grid gap-2.5 border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold">Before you send</h2>
      <ul className="grid gap-2">
        <li className={item}>
          {dot}
          <span>
            A new product idea?{" "}
            <Link className={textLink} href="/submit">
              Pitch it instead
            </Link>
            . This board is for our own tools.
          </span>
        </li>
        <li className={item}>
          {dot}
          <span>
            <b>Security issue?</b> Don&apos;t post it here. Email{" "}
            <a className={`${textLink} font-mono`} href={`mailto:${SECURITY_EMAIL}`}>
              {SECURITY_EMAIL}
            </a>
            .
          </span>
        </li>
        <li className={item}>
          {dot}
          <span>Suggestions are public. Anyone can comment; nobody can propose until a member accepts it.</span>
        </li>
      </ul>
    </div>
  );
}
