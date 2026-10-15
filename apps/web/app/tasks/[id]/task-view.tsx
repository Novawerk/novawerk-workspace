"use client";

import type { MyProposal, MyTasks, PublicPerson, PublicTask, PublicTaskDetail, PublicTaskEvent } from "@nw/contracts";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AreaChip, Chip, KindChip, Markdown, Note, Person, SizeBadge, StatusLabel } from "@/components/board/bits";
import {
  boardState,
  ETA_LABELS,
  formatDate,
  personLabel,
  plural,
  prLabel,
  safeHref,
  WHERE_LABELS,
  type BoardState,
} from "@/components/board/labels";
import { confirmPromptOpen } from "@/components/board/dialog-logic";
import { SignInDialog } from "@/components/board/sign-in";
import { buttonAccent, buttonOutline, buttonSmallDanger, buttonSmallOutline, container, textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/contrib-api";
import { useMe, useSession, useToast } from "@/lib/session";

import { AssigneePanel } from "./assignee-panel";
import { Discussion } from "./discussion";
import { ProposeDialog } from "./propose-dialog";

type Viewer = { task?: PublicTaskDetail; mine?: MyProposal | null; drafts?: MyProposal[]; held?: PublicTask[] };

/** The task from the API, and (`mine`) the signed-in contributor's side of it. */
async function fetchViewer(taskId: string, mine: boolean): Promise<Viewer> {
  const [t, p, h] = await Promise.all([
    api<PublicTaskDetail>(`/public/tasks/${taskId}`),
    mine ? api<MyProposal[]>("/contrib/me/proposals") : null,
    mine ? api<MyTasks>("/contrib/me/tasks") : null,
  ]);
  const v: Viewer = {};
  if (t.ok) v.task = t.data;
  if (p?.ok) {
    const here = p.data.filter((x) => x.taskId === taskId && !x.withdrawn);
    v.mine = here.find((x) => !x.draft) ?? null;
    v.drafts = here.filter((x) => x.draft);
  }
  if (h?.ok) v.held = h.data.held;
  return v;
}

const noSubscribe = () => () => {};
/** An agent's confirm link: /tasks/NW-42?confirm=<proposal id>. */
const confirmFromUrl = () => new URLSearchParams(window.location.search).get("confirm");

/** Is this public person the signed-in contributor? */
export const isMe = (person: PublicPerson | null, handle: string | undefined) =>
  !!handle && person?.kind === "contributor" && person.handle === handle;

export function TaskView({ initial }: { initial: PublicTaskDetail }) {
  const { session } = useSession();
  const me = useMe();
  const toast = useToast();
  const [task, setTask] = useState(initial);
  const [mine, setMine] = useState<MyProposal | null>(null);
  const [drafts, setDrafts] = useState<MyProposal[]>([]);
  const confirmId = useSyncExternalStore(noSubscribe, confirmFromUrl, () => null);
  const [confirmPromptClosed, setConfirmPromptClosed] = useState(false);
  const [held, setHeld] = useState<PublicTask[]>([]);
  const [proposing, setProposing] = useState(false);
  /** "Edit first" on an agent's draft: the Propose dialog edits that draft instead. */
  const [editingDraft, setEditingDraft] = useState<MyProposal | null>(null);
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const state = boardState(task);
  const myHandle = me?.handle;
  const amAssignee = isMe(task.assignee, myHandle) && (task.status === "assigned" || task.status === "in_review");
  const myPending = task.proposals.find((p) => isMe(p.author, myHandle) && p.status === "pending") ?? null;

  useEffect(() => {
    track("task_view", { status: initial.status });
  }, [initial.status]);

  const apply = useCallback((v: Viewer) => {
    if (v.task) setTask(v.task);
    if (v.mine !== undefined) setMine(v.mine);
    if (v.drafts) setDrafts(v.drafts);
    if (v.held) setHeld(v.held);
  }, []);

  /** The task as it is now (the cached page can be a minute old). */
  const reload = useCallback(async () => apply(await fetchViewer(task.id, false)), [task.id, apply]);
  const refreshAll = useCallback(async () => apply(await fetchViewer(task.id, true)), [task.id, apply]);

  // Signed in: the fresh task and my side of it (my proposals, an agent's drafts, what I hold).
  useEffect(() => {
    if (session.status !== "signed-in") return;
    let cancelled = false;
    void fetchViewer(task.id, true).then((v) => {
      if (!cancelled) apply(v);
    });
    return () => {
      cancelled = true;
    };
  }, [session.status, task.id, apply]);

  // A confirm link opened while signed out: ask to sign in, then the draft shows here. Only the
  // visitor closing the prompt turns it off; a note on the page can open it again.
  const confirmPrompt = confirmPromptOpen({ confirmId, status: session.status, closedByUser: confirmPromptClosed });
  const confirmWaiting = !!confirmId && session.status === "signed-out";

  const askSignIn = (title: string) => setSigningIn(title);
  const openPropose = () => {
    track("propose_open", { edit: !!myPending, signedIn: !!me });
    if (!me) return askSignIn("Sign in to propose");
    setEditingDraft(null);
    setProposing(true);
  };
  const editDraft = (draft: MyProposal) => {
    track("propose_open", { edit: true, signedIn: true });
    setEditingDraft(draft);
    setProposing(true);
  };
  const reviewDraft = () => {
    const card = document.getElementById("agent-draft");
    card?.scrollIntoView({ block: "center" });
    card?.focus();
  };
  const showCriteria = () => {
    const done = document.getElementById("done-when");
    done?.scrollIntoView({ block: "start" });
  };
  const focusThread = () => {
    setProposing(false);
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ block: "center" });
      composerRef.current?.focus();
    });
  };

  const withdraw = async () => {
    if (!myPending) return;
    const res = await api(`/contrib/proposals/${myPending.id}`, { method: "DELETE" });
    if (!res.ok) return toast(res.error);
    track("proposal_withdrawn", {});
    toast("Proposal withdrawn.");
    await refreshAll();
  };

  const action = (
    <ActionCard
      task={task}
      state={state}
      signedIn={!!me}
      myHandle={myHandle}
      myPending={!!myPending}
      draftWaiting={drafts.length > 0 && task.status === "open"}
      amAssignee={amAssignee}
      onPropose={openPropose}
      onReviewDraft={reviewDraft}
      onWithdraw={withdraw}
      onAskSignIn={askSignIn}
      onVoted={reload}
    />
  );

  return (
    <div className={container}>
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-6 text-[13px] text-muted">
        <Link className={textLink} href="/tasks">
          Tasks
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono">{task.id}</span>
      </nav>

      <div className="grid items-start gap-5 pt-6 pb-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <article className="min-w-0">
          <div className="grid gap-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-muted">{task.id}</span>
              <StatusLabel task={task} />
            </div>
            <h1 className="max-w-[22ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{task.title}</h1>
            <p className="max-w-[60ch] text-[17px] text-muted">{task.summary}</p>
            <div className="grid gap-3 border border-line bg-paper p-5 lg:hidden">{action}</div>
          </div>

          {confirmWaiting && !confirmPrompt ? (
            <Note tone="info" className="mt-6">
              <b>Your agent drafted a proposal for this task.</b> Sign in to read it and confirm it; nobody sees it until you do.
              <div className="mt-2.5">
                <button type="button" className={buttonSmallOutline} onClick={() => setConfirmPromptClosed(false)}>
                  Sign in
                </button>
              </div>
            </Note>
          ) : null}

          {mine?.status === "not_chosen" && mine.declineNote ? (
            <Note className="mt-6">
              <b>Not chosen this time.</b> {mine.declineNote} <span className="text-muted">Only you see this note.</span>
              <div className="mt-2.5">
                <Link href="/tasks?status=open" className={buttonSmallOutline}>
                  Find another open task
                </Link>
              </div>
            </Note>
          ) : null}

          {drafts.map((d, i) => (
            <DraftCard
              key={d.id}
              id={i === 0 ? "agent-draft" : undefined}
              draft={d}
              highlight={d.id === confirmId}
              task={task}
              onEdit={() => editDraft(d)}
              onShowCriteria={showCriteria}
              onChanged={refreshAll}
            />
          ))}

          {amAssignee ? <AssigneePanel task={task} onChanged={refreshAll} onPostUpdate={focusThread} /> : null}

          <section aria-labelledby="what-why" className="mt-8">
            <h2 id="what-why" className="text-lg font-semibold tracking-tight">
              What and why
            </h2>
            <Markdown className="mt-3 max-w-[68ch]">{task.body || task.summary}</Markdown>
          </section>

          {task.criteria.length > 0 ? (
            <section aria-labelledby="done-when" id="done-when" className="mt-8 scroll-mt-6 border-t border-line pt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="done-when-title" className="text-lg font-semibold tracking-tight">
                  Done when
                </h2>
                <span className="text-[13px] text-muted">Acceptance criteria</span>
              </div>
              <Criteria lines={task.criteria} done={task.status === "done"} />
            </section>
          ) : null}

          {task.status === "suggested" || task.kind !== "task" && task.status === "declined" ? null : (
            <section aria-labelledby="proposals" className="mt-8 border-t border-line pt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="proposals" className="text-lg font-semibold tracking-tight">
                  Proposals <span className="font-mono font-normal text-muted">{task.proposals.length}</span>
                </h2>
                <span className="text-[13px] text-muted">Open to read. Decline notes go only to the proposer.</span>
              </div>
              <div className="mt-3.5 grid gap-2.5">
                {task.proposals.length === 0 ? <p className="text-sm text-muted">No proposals yet.</p> : null}
                {task.proposals.map((p) => (
                  <article key={p.id} className={`grid gap-2.5 border bg-paper px-[18px] py-4 ${isMe(p.author, myHandle) ? "border-ink" : "border-line"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Person person={p.author} avatar />
                        {p.viaAgent ? <AgentTag name={p.viaAgent} /> : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
                        <span>{ETA_LABELS[p.eta]}</span>
                        <span>{formatDate(p.createdAt)}</span>
                        <span className={`border px-1.5 py-px font-mono text-xs ${p.status === "chosen" ? "border-accent text-accent" : "border-line-strong"}`}>
                          {p.status === "chosen" ? "Chosen" : p.status === "not_chosen" ? "Not chosen" : "Pending"}
                        </span>
                      </span>
                    </div>
                    <Markdown className="text-sm">{p.approach}</Markdown>
                    {p.testing ? (
                      <div className="text-sm">
                        <span className="text-muted">Testing: </span>
                        <Markdown className="inline-block align-top">{p.testing}</Markdown>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          )}

          <Discussion
            task={task}
            signedIn={!!me}
            composerRef={composerRef}
            onAskSignIn={() => askSignIn("Sign in to post")}
            onPosted={reload}
          />
        </article>

        <aside className="grid gap-4">
          <div className="hidden gap-3 border border-line bg-paper p-5 lg:grid">{action}</div>
          <Facts task={task} />
          <Timeline task={task} state={state} />
        </aside>
      </div>

      {me ? (
        <ProposeDialog
          open={proposing}
          onClose={() => setProposing(false)}
          task={task}
          me={me}
          mine={editingDraft ?? myPending}
          isDraft={!!editingDraft}
          held={held.filter((h) => h.id !== task.id)}
          onAskInThread={focusThread}
          onSaved={async (edit) => {
            setProposing(false);
            toast(editingDraft ? "Draft saved. Confirm it to send it." : edit ? "Changes saved." : "Proposal sent. A member replies within about a week.");
            setEditingDraft(null);
            await refreshAll();
          }}
        />
      ) : null}
      <SignInDialog
        open={signingIn !== null || confirmPrompt}
        onClose={() => {
          setSigningIn(null);
          setConfirmPromptClosed(true);
        }}
        title={signingIn ?? (confirmPrompt ? "Sign in to confirm your agent's proposal" : undefined)}
        returnTo={confirmId ? `/tasks/${task.id}?confirm=${encodeURIComponent(confirmId)}` : `/tasks/${task.id}`}
        closeOnBackdrop={!confirmPrompt}
      />
    </div>
  );
}

/** "via agent · claude-laptop": written with a token. */
export function AgentTag({ name }: { name: string }) {
  return (
    <span className="border border-dashed border-line-strong px-1.5 font-mono text-[11px] text-muted" title="Written with a personal access token">
      via agent · {name}
    </span>
  );
}

/**
 * A proposal an agent drafted with a token. It counts once its person confirms it here; they can
 * also edit it first (the same fields) or discard it.
 */
function DraftCard({
  id,
  draft,
  highlight,
  task,
  onEdit,
  onShowCriteria,
  onChanged,
}: {
  id?: string;
  draft: MyProposal;
  highlight: boolean;
  task: PublicTaskDetail;
  onEdit: () => void;
  onShowCriteria: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Confirming makes it count, so it asks the same question as the Propose dialog.
  const [ack, setAck] = useState(false);
  const open = task.status === "open";

  const confirm = async () => {
    setBusy(true);
    const res = await api(`/contrib/proposals/${draft.id}/confirm`, { method: "POST", body: {} });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    track("propose_sent", { edit: false });
    toast("Proposal sent. A member replies within about a week.");
    await onChanged();
  };
  const discard = async () => {
    setBusy(true);
    const res = await api(`/contrib/proposals/${draft.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    toast("Draft discarded.");
    await onChanged();
  };

  return (
    <section
      id={id}
      tabIndex={-1}
      aria-label="A draft from your agent"
      className={`mt-6 grid gap-3 border bg-paper p-5 ${highlight ? "border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-line-strong"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Your agent drafted a proposal</h2>
        {draft.viaAgent ? <AgentTag name={draft.viaAgent} /> : null}
      </div>
      <p className="text-[13px] text-muted">
        Nobody sees it yet. It counts once you confirm it; read it first, as it goes out under your name. {ETA_LABELS[draft.eta]}.
      </p>
      <Markdown className="text-sm">{draft.approach}</Markdown>
      {draft.testing ? (
        <div className="text-sm">
          <span className="text-muted">Testing: </span>
          <Markdown className="inline-block align-top">{draft.testing}</Markdown>
        </div>
      ) : null}
      {open ? (
        <>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
            <span>
              I read{" "}
              <button type="button" className={textLink} onClick={onShowCriteria}>
                what done means
              </button>{" "}
              for this task, and I&apos;ll release it if I can&apos;t finish.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${buttonAccent} disabled:border-line-strong disabled:bg-subtle disabled:text-muted disabled:opacity-100`}
              disabled={busy || !ack}
              onClick={confirm}
            >
              Confirm and send
            </button>
            <button type="button" className={buttonOutline} disabled={busy} onClick={onEdit}>
              Edit first
            </button>
            <button type="button" className={buttonSmallDanger + " h-11 px-4"} disabled={busy} onClick={discard}>
              Discard
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted">This task isn&apos;t open for proposals any more.</p>
          <button type="button" className={buttonSmallDanger} disabled={busy} onClick={discard}>
            Discard draft
          </button>
        </div>
      )}
    </section>
  );
}

function Criteria({ lines, done }: { lines: string[]; done: boolean }) {
  return (
    <ul className="mt-3.5 grid gap-2">
      {lines.map((line) => (
        <li key={line} className="flex gap-2.5 text-[15px]">
          <span aria-hidden="true" className={`mt-1 size-3.5 shrink-0 border-[1.5px] ${done ? "border-accent bg-accent" : "border-line-strong"}`} />
          <Markdown className="min-w-0">{line}</Markdown>
        </li>
      ))}
    </ul>
  );
}

export { Criteria };

// ─── The action card ─────────────────────────────────────────────────────────

function ActionCard({
  task,
  state,
  signedIn,
  myHandle,
  myPending,
  draftWaiting,
  amAssignee,
  onPropose,
  onReviewDraft,
  onWithdraw,
  onAskSignIn,
  onVoted,
}: {
  task: PublicTaskDetail;
  state: BoardState;
  signedIn: boolean;
  myHandle: string | undefined;
  myPending: boolean;
  draftWaiting: boolean;
  amAssignee: boolean;
  onPropose: () => void;
  onReviewDraft: () => void;
  onWithdraw: () => void;
  onAskSignIn: (title: string) => void;
  onVoted: () => Promise<void>;
}) {
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  if (state === "suggested") {
    return (
      <>
        <Note>
          {task.needsInfo ? (
            <>
              <b>A member asked for more info.</b> The suggester answers in the thread below.
            </>
          ) : (
            <>
              <b>Waiting for a member to look at it.</b> Nobody can propose until it&apos;s accepted and sized.
            </>
          )}
        </Note>
        <p className="text-[13px] text-muted">
          Know something useful? Add it to the thread.
          {task.wantsIt && task.suggestedBy ? ` ${personLabel(task.suggestedBy)} offered to do it.` : ""}
        </p>
        <Votes task={task} signedIn={signedIn} myHandle={myHandle} onAskSignIn={onAskSignIn} onVoted={onVoted} />
      </>
    );
  }
  if (state === "done") {
    return (
      <Note tone="ok">
        Merged{task.prUrl ? (
          <>
            {" "}in{" "}
            <a className={textLink} href={safeHref(task.prUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
              {prLabel(task.prUrl)}
            </a>
          </>
        ) : null}
        . {task.werk ? `${task.werk} Werk to ${personLabel(task.assignee)}.` : null}
      </Note>
    );
  }
  if (state === "closed") {
    return (
      <Note>
        {task.status === "duplicate" && task.duplicateOf ? (
          <>
            A duplicate of{" "}
            <Link className={textLink} href={`/tasks/${task.duplicateOf}`}>
              {task.duplicateOf}
            </Link>
            .{" "}
          </>
        ) : null}
        {task.closedReason ?? (task.status === "declined" ? "Declined." : "Closed.")}
      </Note>
    );
  }
  if (amAssignee) {
    return (
      <Note tone="ok">
        <b>This task is yours.</b> The guide is on this page.
      </Note>
    );
  }
  if (state === "assigned" || state === "in_review") {
    return <p className="text-[13px] text-muted">Someone is on this. You can still follow the thread and help in the discussion.</p>;
  }
  if (draftWaiting && !myPending) {
    return (
      <>
        <Note tone="info">
          <b>Your agent drafted a proposal.</b> Nobody sees it until you confirm it.
        </Note>
        <button type="button" className={`${buttonAccent} h-12 w-full`} onClick={onReviewDraft}>
          Review your agent&apos;s draft
        </button>
        <button type="button" className={`${textLink} justify-self-start text-[13px] text-muted`} onClick={onPropose}>
          Write a different proposal instead
        </button>
      </>
    );
  }
  if (myPending) {
    return (
      <>
        <Note tone="warn">
          <b>Your proposal is waiting.</b> A member replies within about a week. You can edit or withdraw it until then.
        </Note>
        {confirmWithdraw ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonSmallDanger} onClick={onWithdraw}>
              Withdraw proposal
            </button>
            <button type="button" className={buttonSmallOutline} onClick={() => setConfirmWithdraw(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonSmallOutline} onClick={onPropose}>
              Edit proposal
            </button>
            <button type="button" className={buttonSmallDanger} onClick={() => setConfirmWithdraw(true)}>
              Withdraw
            </button>
          </div>
        )}
      </>
    );
  }
  const pending = task.proposals.filter((p) => p.status === "pending").length;
  return (
    <>
      <button type="button" className={`${buttonAccent} h-12 w-full`} onClick={onPropose}>
        Propose a plan
      </button>
      <p className="text-[13px] text-muted">{pending ? `${plural(pending, "proposal")} so far. A member picks one.` : "No proposals yet. Be the first."}</p>
    </>
  );
}

function Votes({
  task,
  signedIn,
  myHandle,
  onAskSignIn,
  onVoted,
}: {
  task: PublicTaskDetail;
  signedIn: boolean;
  myHandle: string | undefined;
  onAskSignIn: (title: string) => void;
  onVoted: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const voted = task.voters.some((v) => isMe(v, myHandle));
  const own = isMe(task.suggestedBy, myHandle);
  const names = task.voters.filter((v) => v.kind === "contributor");

  const toggle = async () => {
    if (!signedIn) return onAskSignIn("Sign in to +1");
    setBusy(true);
    const res = await api(`/contrib/tasks/${task.id}/vote`, { method: voted ? "DELETE" : "PUT" });
    setBusy(false);
    if (!res.ok) return toast(res.error);
    track("vote", { on: !voted });
    await onVoted();
  };

  return (
    <div className="grid gap-1.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={own || busy}
          aria-pressed={voted}
          title={own ? "You can't vote on your own suggestion." : undefined}
          aria-label={`${voted ? "Remove your +1" : "+1 this suggestion"}, ${plural(task.voteCount, "vote")}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-field bg-paper px-2.5 text-[13px] font-medium aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:cursor-default disabled:opacity-60"
        >
          +1 <b className="font-mono font-medium tabular-nums">{task.voteCount}</b>
        </button>
        <span className="text-[13px] text-muted">
          {names.length ? (
            <>
              +1 from{" "}
              {names.map((v, i) => (
                <span key={i}>
                  {i > 0 ? ", " : null}
                  <Person person={v} />
                </span>
              ))}
            </>
          ) : (
            "No votes yet"
          )}
        </span>
      </div>
      <p className="text-[13px] text-muted">
        {own ? "You can't vote on your own suggestion." : signedIn ? "One +1 per person. Click again to take it back." : (
          <>
            <button type="button" className={textLink} onClick={() => onAskSignIn("Sign in to +1")}>
              Sign in
            </button>{" "}
            to +1.
          </>
        )}{" "}
        Votes help us choose; they don&apos;t decide.
      </p>
    </div>
  );
}

// ─── Side cards ──────────────────────────────────────────────────────────────

function Facts({ task }: { task: PublicTaskDetail }) {
  const pr = safeHref(task.prUrl);
  const row = "grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 text-sm";
  const dt = "text-[13px] text-muted";
  return (
    <dl className="grid gap-2.5 border border-line bg-paper p-5">
      {task.size ? (
        <div className={row}>
          <dt className={dt}>Size</dt>
          <dd>
            <SizeBadge size={task.size} />
          </dd>
        </div>
      ) : (
        <>
          <div className={row}>
            <dt className={dt}>Type</dt>
            <dd>
              <KindChip kind={task.kind} />
            </dd>
          </div>
          {task.where ? (
            <div className={row}>
              <dt className={dt}>Where</dt>
              <dd className="text-[13px]">
                {WHERE_LABELS[task.where]}
                {task.wherePath ? <span className="ml-1 font-mono text-muted">{task.wherePath}</span> : null}
              </dd>
            </div>
          ) : null}
        </>
      )}
      {task.area ? (
        <div className={row}>
          <dt className={dt}>Area</dt>
          <dd>
            <AreaChip area={task.area} />
          </dd>
        </div>
      ) : null}
      {task.suggestedBy ? (
        <div className={row}>
          <dt className={dt}>Suggested by</dt>
          <dd>
            <Person person={task.suggestedBy} avatar />
          </dd>
        </div>
      ) : null}
      {task.skills.length ? (
        <div className={row}>
          <dt className={dt}>Skills</dt>
          <dd className="flex flex-wrap gap-1.5">
            {task.skills.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </dd>
        </div>
      ) : null}
      <div className={row}>
        <dt className={dt}>Assignee</dt>
        <dd>{task.assignee ? <Person person={task.assignee} avatar /> : <span className="text-[13px] text-muted">Nobody yet</span>}</dd>
      </div>
      <div className={row}>
        <dt className={dt}>Pull request</dt>
        <dd className="text-[13px]">
          {pr && task.prUrl ? (
            <a className={textLink} href={pr} target="_blank" rel="noopener noreferrer">
              {prLabel(task.prUrl)}
            </a>
          ) : (
            <span className="text-muted">None yet</span>
          )}
        </dd>
      </div>
      <div className={row}>
        <dt className={dt}>Updated</dt>
        <dd className="text-[13px]">{formatDate(task.updatedAt)}</dd>
      </div>
    </dl>
  );
}

const EVENT_TEXT: Record<PublicTaskEvent["kind"], string> = {
  created: "Opened",
  published: "Opened",
  suggested: "Suggested",
  info_requested: "More info asked",
  accepted: "Accepted",
  declined: "Declined",
  duplicate: "Marked as a duplicate",
  assigned: "Assigned",
  released: "Released",
  pr_linked: "Pull request linked",
  pr_closed: "Pull request closed",
  merged: "Merged",
  closed: "Closed",
  inactivity_reminder: "No activity for a week",
  extended: "A week more",
  reopened: "Reopened",
  thread_locked: "Thread locked",
  thread_unlocked: "Thread opened again",
  member_posted: "Novawerk replied",
  // Members only: the API never sends these on the public timeline.
  edited: "Edited",
  proposal_declined: "Proposal declined",
  post_hidden: "Post hidden",
  post_unhidden: "Post shown again",
  reports_dismissed: "Reports dismissed",
  werk_adjusted: "Werk adjusted",
};

const EVENT_DOT: Record<PublicTaskEvent["kind"], string> = {
  created: "bg-st-open",
  published: "bg-st-open",
  suggested: "border border-dashed border-st-suggested",
  info_requested: "border border-dashed border-st-suggested",
  accepted: "bg-st-open",
  declined: "bg-st-closed",
  duplicate: "bg-st-closed",
  assigned: "bg-st-progress",
  released: "bg-st-open",
  pr_linked: "bg-st-review",
  pr_closed: "bg-st-progress",
  merged: "bg-st-done",
  closed: "bg-st-closed",
  inactivity_reminder: "bg-st-proposed",
  extended: "bg-st-progress",
  reopened: "bg-st-open",
  thread_locked: "bg-st-closed",
  thread_unlocked: "bg-st-open",
  member_posted: "bg-st-open",
  edited: "bg-st-open",
  proposal_declined: "bg-st-closed",
  post_hidden: "bg-st-closed",
  post_unhidden: "bg-st-open",
  reports_dismissed: "bg-st-open",
  werk_adjusted: "bg-st-done",
};

const FUTURE: Record<BoardState, string[]> = {
  suggested: ["Accepted", "Assigned", "In review", "Merged"],
  open: ["Proposals", "Assigned", "In review", "Merged"],
  proposed: ["Assigned", "In review", "Merged"],
  assigned: ["In review", "Merged"],
  in_review: ["Merged"],
  done: [],
  closed: [],
};

/**
 * The task's status history, starting with when it opened (from `createdAt` when no event says
 * so). A member's reply is in the thread already, so it stays off the timeline.
 */
function withStart(task: PublicTaskDetail): PublicTaskEvent[] {
  const events = task.events.filter((e) => e.kind !== "member_posted");
  const opened = events.some((e) => e.kind === "created" || e.kind === "published" || e.kind === "suggested");
  if (opened) return events;
  const start: PublicTaskEvent = {
    kind: task.kind === "task" ? "published" : "suggested",
    from: null,
    to: null,
    actor: task.kind === "task" ? null : task.suggestedBy,
    note: null,
    prUrl: null,
    viaAgent: null,
    createdAt: task.createdAt,
  };
  return [start, ...events];
}

function Timeline({ task, state }: { task: PublicTaskDetail; state: BoardState }) {
  const events = withStart(task);
  return (
    <div className="grid gap-3 border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold">Status</h2>
      <ol className="grid">
        {events.map((e, i) => (
          <li key={i} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-2.5 pb-3 text-[13px]">
            <span aria-hidden="true" className={`mt-1.5 size-[9px] ${EVENT_DOT[e.kind]}`} />
            <span>
              {EVENT_TEXT[e.kind]}
              {e.actor ? <> by {personLabel(e.actor)}</> : null}
              {e.viaAgent ? <span className="text-muted"> via agent</span> : null}
              {e.note ? <span className="text-muted">: {e.note}</span> : null}
              <br />
              <span className="text-muted">{formatDate(e.createdAt)}</span>
            </span>
            {i < events.length - 1 || FUTURE[state].length ? <span aria-hidden="true" className="absolute top-[18px] bottom-0 left-1 w-px bg-line" /> : null}
          </li>
        ))}
        {FUTURE[state].map((step, i) => (
          <li key={step} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-2.5 pb-3 text-[13px] text-muted">
            <span aria-hidden="true" className="mt-1.5 size-[9px] border border-line-strong" />
            <span>{step}</span>
            {i < FUTURE[state].length - 1 ? <span aria-hidden="true" className="absolute top-[18px] bottom-0 left-1 w-px bg-line" /> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
