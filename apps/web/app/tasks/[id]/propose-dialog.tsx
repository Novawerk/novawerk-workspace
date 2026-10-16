"use client";

import {
  PROPOSAL_ETAS,
  TASK_LIMITS,
  proposalInput,
  proposalUpdateInput,
  type ContributorMe,
  type ProposalEta,
  type PublicProposal,
  type PublicTask,
  type PublicTaskDetail,
} from "@nw/contracts";
import { useEffect, useId, useRef, useState } from "react";

import { Markdown } from "@/components/board/bits";
import { Dialog, dialogButton, dialogButtonAccent, dialogField, Pills } from "@/components/board/dialog";
import { ETA_LABELS, plural, TASK_LIMIT_LINE } from "@/components/board/labels";
import { textLink } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, githubStartUrl } from "@/lib/contrib-api";

/**
 * "Propose a plan": what you'll change, how you'll test it, a rough timeline, the task's done-when
 * lines, what happens next, and one required tick. Also edits a pending proposal or an agent's
 * draft (prefilled). Closing with unsent changes asks first, so typed text never vanishes silently.
 */
export function ProposeDialog({
  open,
  onClose,
  task,
  me,
  mine,
  isDraft = false,
  held,
  onAskInThread,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  task: PublicTaskDetail;
  me: ContributorMe;
  /** My pending proposal on this task, or an agent's draft: the dialog edits it. */
  mine: Pick<PublicProposal, "id" | "approach" | "testing" | "eta"> | null;
  /** `mine` is an agent's draft: saving keeps it a draft until it is confirmed. */
  isDraft?: boolean;
  /** Tasks I hold now (other than this one). */
  held: PublicTask[];
  onAskInThread: () => void;
  onSaved: (edit: boolean) => void | Promise<void>;
}) {
  // Mounted only while open, so each opening starts from the proposal as it is now.
  return open ? (
    <ProposeForm task={task} me={me} mine={mine} isDraft={isDraft} held={held} onClose={onClose} onAskInThread={onAskInThread} onSaved={onSaved} />
  ) : null;
}

function Meta({ task }: { task: PublicTaskDetail }) {
  return (
    <>
      <span className="font-mono">{task.id}</span>
      {task.area ? ` · ${task.area}` : ""}
      {task.size ? ` · ${task.size} · ${task.werk} Werk` : ""}
    </>
  );
}

function ProposeForm({
  task,
  me,
  mine,
  isDraft,
  held,
  onClose,
  onAskInThread,
  onSaved,
}: {
  task: PublicTaskDetail;
  me: ContributorMe;
  mine: Pick<PublicProposal, "id" | "approach" | "testing" | "eta"> | null;
  isDraft: boolean;
  held: PublicTask[];
  onClose: () => void;
  onAskInThread: () => void;
  onSaved: (edit: boolean) => void | Promise<void>;
}) {
  const edit = !!mine;
  const [approach, setApproach] = useState(mine?.approach ?? "");
  const [testing, setTesting] = useState(mine?.testing ?? "");
  const [eta, setEta] = useState<ProposalEta>(mine?.eta ?? "week");
  const [ack, setAck] = useState(edit);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  // "Discard what you wrote?" takes focus, so a keyboard user hears it and can answer.
  useEffect(() => {
    if (askDiscard) keepEditingRef.current?.focus();
  }, [askDiscard]);
  const criteriaRef = useRef<HTMLDetailsElement>(null);
  const approachId = useId();
  const testingId = useId();
  const ackId = useId();

  const others = task.proposals.filter((p) => p.status === "pending" && p.id !== mine?.id).length;
  const canSend = approach.trim().length > 0 && ack && !busy;
  const dirty = approach !== (mine?.approach ?? "") || testing !== (mine?.testing ?? "") || eta !== (mine?.eta ?? "week");
  /** Escape, the backdrop, × and Cancel all come here: with unsent changes, ask first. */
  const requestClose = () => {
    if (dirty && !busy) setAskDiscard(true);
    else onClose();
  };

  // Proposing needs a linked GitHub account (we match the pull request to the task).
  if (!me.canWork) {
    const link = githubStartUrl(`/tasks/${task.id}`);
    return (
      <Dialog
        open
        onClose={onClose}
        title={task.title}
        meta={<Meta task={task} />}
        footer={
          <>
            <button type="button" className={dialogButton} onClick={onClose}>
              Cancel
            </button>
            {link && !me.suspended ? (
              <a className={dialogButtonAccent} href={link} onClick={() => track("sign_in_start", { method: "github" })}>
                Link GitHub
              </a>
            ) : null}
          </>
        }
      >
        <p className="text-[15px]">
          {me.suspended ? (
            "Your account can read the board but can't propose right now. Questions? Email info@novawerk.io."
          ) : (
            <>
              <b>Link GitHub to propose.</b> We match your pull request to the task through your GitHub account, so every
              proposal needs one linked. It takes a few seconds and brings you back here.
            </>
          )}
        </p>
      </Dialog>
    );
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    setProblem(null);
    const body = edit ? { approach, testing, eta } : { approach, testing, eta, readCriteria: ack };
    const parsed = (edit ? proposalUpdateInput : proposalInput).safeParse(body);
    if (!parsed.success) {
      setIssues(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
      return;
    }
    setIssues({});
    setBusy(true);
    const res = edit
      ? await api(`/contrib/proposals/${mine!.id}`, { method: "PATCH", body: parsed.data })
      : await api(`/contrib/tasks/${task.id}/proposals`, { method: "POST", body: parsed.data });
    setBusy(false);
    if (!res.ok) {
      track("propose_failed", { reason: res.status === 429 ? "limit" : res.status === 400 || res.status === 409 ? "invalid" : "unavailable" });
      setIssues(Object.fromEntries(Object.entries(res.issues).map(([k, v]) => [k, v[0] ?? ""])));
      setProblem(res.error);
      return;
    }
    track("propose_sent", { edit });
    await onSaved(edit);
  };

  const showCriteria = () => {
    if (criteriaRef.current) {
      criteriaRef.current.open = true;
      criteriaRef.current.scrollIntoView({ block: "nearest" });
    }
  };

  return (
    <Dialog
      open
      onClose={requestClose}
      title={task.title}
      meta={<Meta task={task} />}
      as="form"
      onSubmit={send}
      footer={
        askDiscard ? (
          <>
            <span role="alert" className="text-sm sm:mr-auto">
              Discard what you wrote?
            </span>
            <button ref={keepEditingRef} type="button" className={dialogButton} onClick={() => setAskDiscard(false)}>
              Keep editing
            </button>
            <button type="button" className={`${dialogButton} text-danger hover:border-danger`} onClick={onClose}>
              Discard
            </button>
          </>
        ) : (
        <>
          <button type="button" className={dialogButton} onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" disabled={!canSend} className={dialogButtonAccent}>
            {busy ? "Sending…" : isDraft ? "Save draft" : edit ? "Save changes" : "Send proposal"}
          </button>
        </>
        )
      }
    >
      <p className="text-[13px] text-muted">
        {isDraft
          ? "Edit your agent's draft. It stays a draft until you confirm it on the task."
          : edit
            ? "Edit your plan. It stays pending until a maintainer replies."
            : "Tell us how you'd do it. A few sentences each is enough. Markdown works."}
      </p>

      <div className="grid gap-1.5">
        <label htmlFor={approachId} className="text-sm font-medium">
          What you&apos;ll change
        </label>
        <textarea
          id={approachId}
          value={approach}
          onChange={(e) => setApproach(e.target.value)}
          placeholder="Which files or screens you'll touch, and the idea in a sentence or two."
          aria-invalid={issues.approach ? true : undefined}
          className={`${dialogField} min-h-24 resize-y`}
          data-autofocus
        />
        {issues.approach ? <p className="text-sm text-danger">{issues.approach}</p> : null}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={testingId} className="text-sm font-medium">
          How you&apos;ll test it
        </label>
        <textarea
          id={testingId}
          value={testing}
          onChange={(e) => setTesting(e.target.value)}
          placeholder="The tests you'll add, or how you'll check it by hand."
          aria-invalid={issues.testing ? true : undefined}
          className={`${dialogField} min-h-[72px] resize-y`}
        />
        {issues.testing ? <p className="text-sm text-danger">{issues.testing}</p> : null}
      </div>

      <p className="text-[13px]">
        <button type="button" className={textLink} onClick={onAskInThread}>
          Have a question? Ask in the thread instead
        </button>
        <span className="text-muted"> so everyone sees the answer.</span>
      </p>

      <Pills
        name="eta"
        legend="Rough timeline"
        options={PROPOSAL_ETAS.map((value) => ({ value, label: ETA_LABELS[value] }))}
        value={eta}
        onChange={setEta}
        hint={`Tasks go back on the board after ${TASK_LIMITS.idleReleaseDays} days without activity.`}
      />

      {task.criteria.length > 0 ? (
        <details ref={criteriaRef} className="rounded-xl border border-line px-3.5 py-2.5">
          <summary className="cursor-pointer text-sm font-medium">Done when · {plural(task.criteria.length, "line")}</summary>
          <ul className="mt-2.5 grid gap-2 text-sm">
            {task.criteria.map((line) => (
              <li key={line} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-1 size-3 shrink-0 border-[1.5px] border-line-strong" />
                <Markdown className="min-w-0">{line}</Markdown>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ul aria-label="Before you send" className="grid gap-2 rounded-xl bg-subtle px-4 py-3.5 text-sm">
        <Fact>{others ? `${plural(others, "other")} proposed. A maintainer picks one plan.` : "You're the first to propose."}</Fact>
        <Fact>
          {TASK_LIMIT_LINE}
          {held.length ? (
            <>
              {" "}
              You hold <span className="font-mono">{held.map((h) => h.id).join(", ")}</span> now; if you&apos;re chosen here, finish or release it first.
            </>
          ) : null}
        </Fact>
        <Fact>What happens next: a maintainer replies within about a week. Proposals are public on the task.</Fact>
      </ul>

      <label htmlFor={ackId} className="flex items-start gap-2.5 text-sm">
        <input id={ackId} type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-accent" />
        <span>
          I read{" "}
          <button type="button" className={textLink} onClick={showCriteria}>
            what done means
          </button>{" "}
          for this task, and I&apos;ll release it if I can&apos;t finish.
        </span>
      </label>
      {issues.readCriteria ? <p className="-mt-3 text-sm text-danger">{issues.readCriteria}</p> : null}

      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}

    </Dialog>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
      <span aria-hidden="true" className="mt-[7px] size-2 bg-accent" />
      <span>{children}</span>
    </li>
  );
}
