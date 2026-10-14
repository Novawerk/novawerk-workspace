"use client";

import { intakeDraftIssues, type IntakeMode, type ResumeRef } from "@nw/contracts";
import Link from "next/link";
import { useRef, useState } from "react";

import { ResumePicker } from "@/components/forms/resume-field";
import { buttonOutline, textLink } from "@/components/ui";
import { fieldLabel, fieldsFor, isEmptyValue, type DraftField, type DraftValue } from "@/lib/intake/fields";
import type { IntakeController } from "@/lib/intake/use-intake";
import { SEND_FAILED_MESSAGE } from "@/lib/site";
import { RESUME_FORMATS } from "@/lib/uploads";

import { useAutoHeight } from "./use-auto-height";

// The live draft: every field of the current mode, filled by the agent (draft events) or by
// the visitor (debounced PATCH). Send is enabled once the shared completeness check passes and
// the visitor ticked consent themselves.

const control =
  "block w-full border border-line-strong bg-paper px-3 text-[15px] text-ink transition-colors duration-150 placeholder:text-muted hover:border-ink focus:border-accent focus:outline-none aria-[invalid=true]:border-danger";

const fieldId = (key: string) => `draft-${key}`;

function AutoTextarea({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, value, 360);
  return (
    <textarea
      ref={ref}
      rows={3}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`${control} resize-none py-2 leading-relaxed`}
      {...props}
    />
  );
}

/** A ring while empty, a green check once there's something, nothing for optional fields. */
function StatusMark({ field, value, issue }: { field: DraftField; value: DraftValue; issue?: string }) {
  if (field.optional && isEmptyValue(value)) return <span aria-hidden="true" className="size-4 shrink-0" />;
  if (isEmptyValue(value) || issue) {
    return (
      <span
        role="img"
        aria-label={isEmptyValue(value) ? "Missing" : "Needs a bit more"}
        className={`size-4 shrink-0 rounded-full border-[1.5px] ${isEmptyValue(value) ? "border-line-strong" : "border-accent border-dashed"}`}
      />
    );
  }
  return (
    <span role="img" aria-label="Done" className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-paper">
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
        <path d="M2.5 6.5l2.25 2.25L9.5 3.75" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
      </svg>
    </span>
  );
}

/**
 * One section of the draft. Reads like a document: filled sections show their text, empty ones
 * a one-line hint. Click (or Enter) to edit; leaving the field closes it again. Choice fields
 * (what you do, time) are always interactive chips.
 */
function Section({
  field,
  value,
  issue,
  serverIssue,
  highlight,
  readOnly,
  editing,
  onEdit,
  onDone,
  onChange,
}: {
  field: DraftField;
  value: DraftValue;
  issue?: string;
  serverIssue?: string;
  highlight: boolean;
  readOnly: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onChange: (value: string | string[]) => void;
}) {
  const id = fieldId(field.key);
  const note = serverIssue ?? (!isEmptyValue(value) ? issue : undefined);
  const noteId = note ? `${id}-note` : undefined;
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];
  const empty = isEmptyValue(value);
  const isChoice = field.kind === "multi" || field.kind === "single";

  const header = (
    <div className="flex items-center gap-2.5">
      <StatusMark field={field} value={value} issue={issue} />
      <span className="text-sm font-medium">{field.label}</span>
      {field.optional ? <span className="text-xs text-muted">Optional</span> : null}
      {!isChoice && !editing && !empty && !readOnly ? (
        <span aria-hidden="true" className="ml-auto text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
          Edit
        </span>
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  if (isChoice) {
    body = (
      <fieldset aria-describedby={noteId} id={id} tabIndex={-1} className="mt-2.5 pl-6.5 outline-none">
        <legend className="sr-only">{field.label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {field.options?.map((option) => {
            const checked = field.kind === "multi" ? list.includes(option.value) : value === option.value;
            return (
              <label key={option.value} className={readOnly ? "cursor-default" : "cursor-pointer"}>
                <input
                  type={field.kind === "multi" ? "checkbox" : "radio"}
                  name={id}
                  value={option.value}
                  checked={checked}
                  disabled={readOnly}
                  aria-invalid={serverIssue ? true : undefined}
                  onChange={() => {
                    if (field.kind === "single") return onChange(option.value);
                    const next = checked ? list.filter((v) => v !== option.value) : [...list, option.value];
                    onChange(field.options!.map((o) => o.value).filter((v) => next.includes(v)));
                  }}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-8 items-center border border-line-strong bg-paper px-2.5 text-[13px] transition-colors duration-150 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-60 hover:border-ink">
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  } else if (editing) {
    const common = {
      id,
      autoFocus: true,
      placeholder: field.hint,
      maxLength: field.maxLength,
      "aria-invalid": serverIssue ? true : undefined,
      "aria-describedby": noteId,
      "aria-label": field.label,
      onBlur: onDone,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Escape" || (event.key === "Enter" && field.kind !== "textarea")) {
          event.preventDefault();
          event.stopPropagation(); // Esc closes the field, not the dialog.
          onDone();
        }
      },
    } as const;
    body = (
      <div className="mt-2.5 pl-6.5">
        {field.kind === "textarea" ? (
          <AutoTextarea {...common} value={text} onChange={onChange} />
        ) : (
          <input
            {...common}
            type={field.kind === "email" ? "email" : "text"}
            value={text}
            autoComplete={field.autoComplete}
            onChange={(event) => onChange(event.target.value)}
            className={`${control} h-10`}
          />
        )}
      </div>
    );
  } else {
    body = (
      <button
        type="button"
        id={id}
        onClick={onEdit}
        disabled={readOnly}
        aria-describedby={noteId}
        aria-label={empty ? `Add ${field.label}` : `Edit ${field.label}: ${text}`}
        // 1.125rem margin + 0.5rem padding puts the text exactly under the label (1.625rem).
        className={`mt-1 ml-4.5 block w-[calc(100%-1.125rem)] px-2 py-1 text-left text-sm leading-6 transition-colors hover:bg-paper disabled:cursor-default disabled:hover:bg-transparent ${
          empty ? "text-muted hover:text-ink" : "whitespace-pre-wrap text-ink/90"
        }`}
      >
        {empty ? field.hint ?? `Add ${field.label.toLowerCase()}` : text}
      </button>
    );
  }

  return (
    <div
      // The highlight bleeds a little past the column (a pseudo-element, so the dividers stay
      // aligned with the header and footer). On at once, then fades: what the agent just changed.
      className={`group relative isolate py-3.5 before:pointer-events-none before:absolute before:inset-y-0 before:-inset-x-3 before:-z-10 before:bg-accent/10 ${
        highlight ? "before:opacity-100" : "before:opacity-0 before:transition-opacity before:duration-1000"
      }`}
    >
      {header}
      {body}
      {note ? (
        <p id={noteId} className={`mt-1.5 pl-6.5 text-xs ${serverIssue ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

const RESUME_FIELD: DraftField = { key: "resume", label: "CV", kind: "text", optional: true };

/** The CV: the visitor's own upload. The agent can't set or remove it; it reads the text once. */
function ResumeSection({
  value,
  serverIssue,
  readOnly,
  onChange,
  onBusyChange,
}: {
  value: ResumeRef | null | undefined;
  serverIssue?: string;
  readOnly: boolean;
  onChange: (value: ResumeRef | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = fieldId(RESUME_FIELD.key);
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="py-3.5">
      <div className="flex items-center gap-2.5">
        <StatusMark field={RESUME_FIELD} value={value?.name} />
        <span id={`${id}-label`} className="text-sm font-medium">
          {RESUME_FIELD.label}
        </span>
        <span className="text-xs text-muted">Optional</span>
      </div>
      <p id={`${id}-help`} className="mt-1 pl-6.5 text-xs text-muted">
        {RESUME_FORMATS} The assistant reads it and fills in what it can.
      </p>
      <div className="mt-2.5 pl-6.5">
        <ResumePicker
          id={id}
          compact
          value={value}
          onChange={onChange}
          error={serverIssue}
          disabled={readOnly}
          describedBy={`${id}-help`}
          onBusyChange={onBusyChange}
        />
      </div>
    </div>
  );
}

function Tick({
  id,
  checked,
  onChange,
  error,
  disabled,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <label htmlFor={id} className="text-sm leading-6">
          {children}
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function DraftPanel({ intake }: { intake: IntakeController }) {
  const { state, draft } = intake;
  const mode: IntakeMode = draft.mode;
  const fields = fieldsFor(mode);
  const values = draft[mode] as Record<string, DraftValue>;
  const issues = intakeDraftIssues(draft);
  const missing = Object.keys(issues).length;

  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const ready = state.phase === "ready";
  const submitted = state.status === "submitted";
  const canSend = ready && !submitted && !sending && !uploading && missing === 0 && consent;
  const pendingEdits = Object.keys(state.edits[mode]).length > 0;

  const clearIssue = (key: string) => {
    if (!serverIssues[key]) return;
    setServerIssues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const edit = (key: string, value: string | string[]) => {
    intake.editField(mode, key, value);
    clearIssue(key);
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setFormError(null);
    setServerIssues({});
    const result = await intake.submit({ consent });
    setSending(false);
    if (result.ok) return setJustSent(true);
    if (!result.issues) return setFormError(result.message ?? SEND_FAILED_MESSAGE);

    const known = new Set([...fields.map((f) => f.key), RESUME_FIELD.key, "consent"]);
    const mapped: Record<string, string> = {};
    const unmatched: string[] = [];
    for (const [path, messages] of Object.entries(result.issues)) {
      const key = path.split(".")[0]!;
      const message = messages?.[0] ?? "Please check this.";
      if (known.has(key)) mapped[key] ??= message;
      else unmatched.push(message);
    }
    setServerIssues(mapped);
    setFormError(unmatched.length > 0 ? unmatched.join(" ") : null);
    const first = fields.find((f) => mapped[f.key])?.key ?? Object.keys(mapped)[0];
    if (first === "consent") document.getElementById(first)?.focus();
    else if (first === RESUME_FIELD.key) document.getElementById(fieldId(first))?.focus();
    else if (first) setEditing(first);
  };

  const startOver = () => {
    const hasWork =
      state.messages.length > 0 || fields.some((f) => !isEmptyValue(values[f.key])) || Boolean(draft[mode].resume);
    if (!submitted && hasWork && !window.confirm("Start over? This clears the chat and your draft.")) return;
    intake.startOver();
  };

  const kind = mode === "pitch" ? "pitch" : "intro";

  if (submitted) {
    return (
      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-6">
        <div
          role="status"
          tabIndex={-1}
          ref={justSent ? (node) => node?.focus() : undefined}
          className="border border-line bg-paper p-6 outline-none"
        >
          <p className="text-xl font-medium tracking-tight">Got it. We usually reply within a few days.</p>
          <p className="mt-3 text-muted">
            {mode === "pitch"
              ? "Your pitch is with the team. Keep an eye on your inbox — we may ask a few questions first."
              : "Your intro is with the team. Meanwhile, have a look at what Members are building."}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/" className={buttonOutline}>
              {mode === "pitch" ? "Back to the projects" : "See the projects"}
            </Link>
            <button type="button" onClick={startOver} className={`${textLink} text-sm`}>
              Start a new one
            </button>
          </div>
        </div>
      </div>
    );
  }

  const changed = new Set(state.changed.fields);
  // Field issues clear as the visitor fixes them; the alert goes with the last one.
  const alert = formError ?? (Object.keys(serverIssues).length > 0 ? "Please check the highlighted fields." : null);
  const sendBlocker =
    missing > 0
      ? `${missing} ${missing === 1 ? "part" : "parts"} to go. Keep chatting and we fill them in.`
      : uploading
        ? "Your CV is still uploading."
        : !consent
          ? "Accept the privacy note to send."
          : null;
  const required = fields.filter((f) => !f.optional);
  const done = required.filter((f) => !isEmptyValue(values[f.key]) && !issues[f.key]).length;
  const progress = required.length ? Math.round((done / required.length) * 100) : 0;

  return (
    <>
      <div className="shrink-0 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Your {kind}</h2>
          <p className={`text-sm tabular-nums ${missing === 0 ? "font-medium text-accent" : "text-muted"}`}>
            {missing === 0 ? "Ready to send" : `${done} of ${required.length}`}
          </p>
        </div>
        <div
          className="mt-3 h-1 w-full bg-line"
          role="progressbar"
          aria-label={`Your ${kind}`}
          aria-valuemin={0}
          aria-valuemax={required.length}
          aria-valuenow={done}
        >
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
          <p className={state.saveFailed ? "text-danger" : "text-muted"}>
            {state.saveFailed
              ? "Not saved yet. We'll try again."
              : pendingEdits
                ? "Saving…"
                : "Fills in as you chat. Click any part to edit it."}
          </p>
          <button type="button" onClick={startOver} disabled={!ready} className="shrink-0 text-muted underline decoration-line-strong underline-offset-4 hover:text-ink disabled:opacity-60">
            Start over
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {state.changed.fields.length > 0
          ? `Updated in your draft: ${state.changed.fields.map((key) => fieldLabel(mode, key)).join(", ")}.`
          : ""}
      </p>

      {/* `relative` keeps the visually hidden inputs (sr-only, absolute) inside the scroll area. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line">
        <div className="divide-y divide-line px-5 sm:px-6">
          {fields.map((field) => (
            <Section
              key={`${mode}-${field.key}`}
              field={field}
              value={values[field.key]}
              issue={issues[field.key]}
              serverIssue={serverIssues[field.key]}
              highlight={changed.has(field.key)}
              readOnly={!ready}
              editing={editing === field.key}
              onEdit={() => setEditing(field.key)}
              onDone={() => setEditing((current) => (current === field.key ? null : current))}
              onChange={(value) => edit(field.key, value)}
            />
          ))}
          <ResumeSection
            key={`${mode}-resume`}
            value={draft[mode].resume}
            serverIssue={serverIssues[RESUME_FIELD.key]}
            readOnly={!ready}
            onChange={(value) => {
              clearIssue(RESUME_FIELD.key);
              void intake.attachResume(value);
            }}
            onBusyChange={setUploading}
          />
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-line bg-paper px-5 py-4 sm:px-6">
        {missing === 0 ? (
          <>
            <Tick
              id="consent"
              checked={consent}
              onChange={(checked) => {
                setConsent(checked);
                clearIssue("consent");
              }}
              error={serverIssues.consent}
              disabled={!ready}
            >
              <span className="text-[13px] leading-5">
                I agree that Novawerk stores what I send and contacts me about it, as the{" "}
                <Link className={textLink} href="/privacy" target="_blank">
                  privacy notice<span className="sr-only"> (opens in a new tab)</span>
                </Link>{" "}
                describes.
              </span>
            </Tick>

            {alert ? (
              <div role="alert" className="border border-danger px-3 py-2 text-sm text-danger">
                {alert}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-describedby={sendBlocker ? "send-blocker" : undefined}
              className="inline-flex h-11 w-full items-center justify-center gap-2 border border-accent bg-accent px-5 text-sm font-medium text-paper transition-colors hover:border-accent-deep hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : `Send ${kind}`}
              {!sending ? (
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                  <path d="M3 8h10M8.5 3.5L13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
                </svg>
              ) : null}
            </button>
          </>
        ) : null}
        <div className="flex items-baseline justify-between gap-4 text-xs text-muted">
          <p id="send-blocker" aria-live="polite">
            {sending ? "" : (sendBlocker ?? "Looks good. Send it when you're ready.")}
          </p>
          <p className="flex shrink-0 gap-3">
            <Link className={textLink} href="/privacy">
              Privacy
            </Link>
            <Link className={textLink} href="/imprint">
              Imprint
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
