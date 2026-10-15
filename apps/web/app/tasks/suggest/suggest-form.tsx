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
import { useEffect, useId, useRef, useState } from "react";

import { Pills } from "@/components/board/dialog";
import { WHERE_LABELS } from "@/components/board/labels";
import { Check, SignInPanel } from "@/components/board/sign-in";
import { buttonAccent, buttonGhost, buttonSmallOutline, container, eyebrow, field, fieldHint, fieldLabel, textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { SCREENSHOT_ACCEPT, screenshotProblem, UploadError, uploadSuggestionScreenshot } from "@/lib/uploads";
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
  const [screenshot, setScreenshot] = useState<Shot | null>(null);
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

  const uploading = screenshot?.state === "uploading";
  const canSend = title.trim().length > 0 && body.trim().length > 0 && !busy && !uploading;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    const shot = screenshot?.state === "done" ? { pathname: screenshot.pathname } : undefined;
    const parsed = suggestionInput.safeParse({ title, kind, body, where: where || undefined, path: path || undefined, doItMyself, screenshot: shot });
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
    toast(shot ? "Thanks. Your suggestion is on the board; the screenshot shows once a member accepts it." : "Thanks. Your suggestion is on the board.");
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

        <ScreenshotField value={screenshot} onChange={setScreenshot} error={issues.screenshot} />

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

type Shot =
  | { state: "uploading"; name: string; preview: string; percent: number }
  | { state: "done"; name: string; preview: string; pathname: string }
  | { state: "failed"; name: string; message: string };

/**
 * The optional screenshot: PNG or JPEG, up to 2 MB. It uploads as soon as it's picked (to our
 * private store), and shows on the task only once a member accepts the suggestion.
 */
function ScreenshotField({ value, onChange, error }: { value: Shot | null; onChange: (shot: Shot | null) => void; error?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [input, setInput] = useState(0);
  /** Which pick is current: an upload that finishes after Remove or a newer pick is ignored. */
  const current = useRef(0);

  // The local preview's object URL is freed when the picture changes or the form goes away.
  const preview = value && value.state !== "failed" ? value.preview : null;
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const mine = ++current.current;
    const update = (shot: Shot) => {
      if (current.current === mine) onChange(shot);
    };
    const problem = screenshotProblem(file);
    if (problem) return update({ state: "failed", name: file.name, message: problem });
    const shot = URL.createObjectURL(file);
    update({ state: "uploading", name: file.name, preview: shot, percent: 0 });
    try {
      const { pathname } = await uploadSuggestionScreenshot(file, (percent) =>
        update({ state: "uploading", name: file.name, preview: shot, percent: Math.round(percent) }),
      );
      update({ state: "done", name: file.name, preview: shot, pathname });
    } catch (err) {
      update({ state: "failed", name: file.name, message: err instanceof UploadError ? err.message : "The upload didn't work. Please try again." });
    }
  };

  const clear = () => {
    current.current++;
    onChange(null);
    setInput((n) => n + 1); // a fresh <input type=file>, so the same file can be picked again
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={fieldLabel}>
        Screenshot <span className={fieldHint}>optional</span>
      </label>
      <p id={hintId} className="text-[13px] text-muted">
        PNG or JPEG, up to 2 MB. No personal data, please: it becomes public once a member accepts the suggestion, without its metadata.
      </p>
      {value && value.state !== "failed" ? (
        <div className="flex items-center gap-3 border border-line bg-paper p-2.5">
          {/* A local preview of the file just picked (an object URL), not a remote image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.preview} alt="" className="size-16 shrink-0 border border-line object-cover" />
          <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
            <span className="truncate">{value.name}</span>
            <span className="text-[13px] text-muted" role="status">
              {value.state === "uploading" ? `Uploading… ${value.percent}%` : "Attached"}
            </span>
          </div>
          <button type="button" className={buttonSmallOutline} onClick={clear}>
            Remove
          </button>
        </div>
      ) : (
        <input
          key={input}
          id={id}
          type="file"
          accept={SCREENSHOT_ACCEPT}
          aria-describedby={hintId}
          aria-invalid={value?.state === "failed" || error ? true : undefined}
          onChange={(e) => void pick(e.target.files?.[0])}
          className={`${field} py-1.5 text-sm file:mr-3 file:border file:border-line-strong file:bg-paper file:px-3 file:py-1 file:text-sm`}
        />
      )}
      {value?.state === "failed" ? <p className="text-sm text-danger">{value.message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
