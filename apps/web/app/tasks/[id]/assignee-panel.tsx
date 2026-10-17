"use client";

import { prLinkInput, releaseInput, TASK_LIMITS, type PublicTaskDetail, type TaskGuide } from "@nw/contracts";
import { useEffect, useId, useState } from "react";

import { Markdown, Note } from "@/components/board/bits";
import { buttonSmallDanger, buttonSmallOutline, eyebrow, field, textLink } from "@/components/ui";
import { api } from "@/lib/contrib-api";
import { useToast } from "@/lib/session";
import { CHAT_URL } from "@/lib/site";

/**
 * What the person who holds the task sees: the inactivity reminder, the contribution guide (with
 * "Copy as Markdown" for agents), linking a pull request by hand, and releasing the task.
 */
export function AssigneePanel({
  task,
  onChanged,
  onPostUpdate,
}: {
  task: PublicTaskDetail;
  onChanged: () => Promise<void>;
  onPostUpdate: () => void;
}) {
  const toast = useToast();
  const [guide, setGuide] = useState<string | null>(null);
  const [guideFailed, setGuideFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<TaskGuide>(`/contrib/tasks/${task.id}/guide`).then((res) => {
      if (cancelled) return;
      if (res.ok) setGuide(res.data.markdown);
      else setGuideFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // The latest reminder since the task was assigned or extended, from the public timeline.
  const sinceAssigned = task.events.slice(task.events.map((e) => e.kind).lastIndexOf("assigned") + 1);
  const lastExtended = sinceAssigned.map((e) => e.kind).lastIndexOf("extended");
  const reminder = sinceAssigned.slice(lastExtended + 1).findLast((e) => e.kind === "inactivity_reminder");
  const extended = lastExtended >= 0;

  const extend = async () => {
    const res = await api(`/contrib/tasks/${task.id}/extend`, { method: "POST", body: {} });
    if (!res.ok) return toast(res.error);
    toast(`Done. You have ${TASK_LIMITS.extensionDays} more days.`);
    await onChanged();
  };

  const copy = async () => {
    if (!guide) return;
    try {
      await navigator.clipboard.writeText(guide);
      toast("Guide copied as Markdown.");
    } catch {
      toast("Couldn't copy. Select the text and copy it instead.");
    }
  };

  return (
    <div className="mt-6 grid gap-5">
      {reminder ? (
        <Note tone="warn">
          <b>No activity for a while.</b> Push a commit, post an update, or release the task.
          {reminder.note ? ` ${reminder.note}` : ` We release it after ${TASK_LIMITS.idleReleaseDays} days without activity.`}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className={buttonSmallOutline} onClick={onPostUpdate}>
              Post an update
            </button>
            {!extended ? (
              <button type="button" className={buttonSmallOutline} onClick={extend}>
                I need a week more
              </button>
            ) : null}
          </div>
        </Note>
      ) : null}

      <section aria-labelledby="guide-title" className="border border-ink bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-[22px]">
          <div>
            <p className={eyebrow}>Contribution guide · {task.id}</p>
            <h2 id="guide-title" className="mt-1 text-lg font-semibold tracking-tight">
              How to ship this
            </h2>
          </div>
          <button type="button" className={buttonSmallOutline} onClick={copy} disabled={!guide}>
            Copy as Markdown
          </button>
        </div>
        <div className="grid gap-5 px-5 py-5 sm:px-[22px]">
          {guide ? (
            <Markdown className="text-[15px]">{guide}</Markdown>
          ) : guideFailed ? (
            <p className="text-sm text-muted">
              We couldn&apos;t load the guide. Reload the page, or ask in the discussion below. Put a <code className="font-mono">Task: {task.id}</code> line in your
              pull request so it links to this task.
            </p>
          ) : (
            <p className="text-sm text-muted">Loading the guide…</p>
          )}
          <p className="text-sm text-muted">
            Stuck on this task? Ask in the discussion below, so the answer stays with the task. For everything else, the{" "}
            <a className={textLink} href={CHAT_URL}>
              team chat
            </a>{" "}
            signs you in with this account.
          </p>
          <LinkPr task={task} onChanged={onChanged} />
          <Release task={task} onChanged={onChanged} />
        </div>
      </section>
    </div>
  );
}

function LinkPr({ task, onChanged }: { task: PublicTaskDetail; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const link = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = prLinkInput.safeParse({ url });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "A pull request link");
    setBusy(true);
    setError(null);
    const res = await api(`/contrib/tasks/${task.id}/pr`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return setError(res.issues.url?.[0] ?? res.error);
    setUrl("");
    toast("Pull request linked.");
    await onChanged();
  };

  return (
    <form onSubmit={link} noValidate className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <div className="grid min-w-0 flex-[1_1_240px] gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          Link a PR by hand <span className="text-[13px] font-normal text-muted">if it doesn&apos;t show up within a minute</span>
        </label>
        <input
          id={id}
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={`https://github.com/${task.repo || "Novawerk/novawerk-workspace"}/pull/231`}
          aria-invalid={error ? true : undefined}
          className={`${field} h-10`}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
      <button type="submit" disabled={busy} className={`${buttonSmallOutline} h-10`}>
        {busy ? "Linking…" : "Link PR"}
      </button>
    </form>
  );
}

function Release({ task, onChanged }: { task: PublicTaskDetail; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  if (task.status === "in_review") {
    return (
      <p className="border-t border-line pt-4 text-[13px] text-muted">
        Your pull request is in review, so the task can&apos;t be released now. Close the pull request first if you need to stop.
      </p>
    );
  }

  const release = async () => {
    const parsed = releaseInput.safeParse({ reason: reason || undefined });
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? "Keep it short");
    setBusy(true);
    const res = await api(`/contrib/tasks/${task.id}/release`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast(`${task.id} is back on the board. Thank you for saying so.`);
    await onChanged();
  };

  return (
    <div className="grid gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[48ch] text-[13px] text-muted">
          Can&apos;t finish? Release the task. It goes back to open, your plan stays visible, and nothing counts against you.
        </p>
        {!asking ? (
          <button type="button" className={buttonSmallDanger} onClick={() => setAsking(true)}>
            Release task
          </button>
        ) : null}
      </div>
      {asking ? (
        <div className="grid gap-2">
          <label htmlFor={id} className="text-sm font-medium">
            Why, in a few words <span className="text-[13px] font-normal text-muted">optional · shows on the timeline</span>
          </label>
          <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="No time this month" className={`${field} h-10 max-w-[420px]`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonSmallDanger} disabled={busy} onClick={release}>
              {busy ? "Releasing…" : `Release ${task.id}`}
            </button>
            <button type="button" className={buttonSmallOutline} onClick={() => setAsking(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
