"use client";

import type { ResumeRef } from "@nw/contracts";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { textLink } from "@/components/ui";
import { RESUME_ACCEPT, UploadError, uploadResume } from "@/lib/uploads";

import { useAutoHeight } from "./use-auto-height";

// The message box: grows with its text, Enter sends, Shift+Enter adds a line, Enter while an
// IME is composing (Chinese, Japanese…) never sends. While the agent replies the visitor can
// keep typing, but Send becomes Stop. The paperclip uploads a CV, which the agent then reads.

const MAX_LENGTH = 4000;
const MAX_HEIGHT = 200;

export function Composer({
  streaming,
  disabled,
  disabledReason,
  placeholder,
  onSend,
  onStop,
  onAttach,
}: {
  streaming: boolean;
  /** No session yet, the draft is sent, or the turn limit is reached. */
  disabled: boolean;
  disabledReason?: string;
  placeholder: string;
  /** Resolves false when the message wasn't sent; the text goes back into the box. */
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  /** A CV is uploaded: hand it to the agent. */
  onAttach: (resume: ResumeRef) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const hintId = useId();
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useAutoHeight(ref, value, MAX_HEIGHT);

  // Focus on desktop only: on phones it would pop the keyboard over the conversation.
  useEffect(() => {
    if (!disabled && window.matchMedia("(pointer: fine)").matches) ref.current?.focus({ preventScroll: true });
  }, [disabled]);

  const canSend = !streaming && !disabled && value.trim().length > 0 && value.length <= MAX_LENGTH;

  const submit = async () => {
    if (!canSend) return;
    const text = value;
    setValue("");
    if (!(await onSend(text))) setValue((current) => current || text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    // Safari reports isComposing=false on the Enter that confirms a candidate, but keyCode 229.
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  };

  const nearLimit = value.length > MAX_LENGTH - 400;

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // Picking the same file again still fires a change.
    if (!file) return;
    setUploadError(null);
    setUpload({ name: file.name, percent: 0 });
    try {
      // Progress is throttled and can arrive after the upload is done: only update a running one.
      const resume = await uploadResume(file, (percent) =>
        setUpload((current) => current && { ...current, percent: Math.round(percent) }),
      );
      onAttach(resume);
    } catch (err) {
      setUploadError(err instanceof UploadError ? err.message : "The upload didn't work. Please try again.");
    } finally {
      setUpload(null);
    }
  };

  return (
    <div className="shrink-0 bg-paper px-4 pt-2 pb-4 sm:px-8">
      <div className="mx-auto w-full max-w-2xl">
        {upload ? (
          <div role="status" className="mb-2 flex items-center gap-3 text-xs text-muted">
            <span className="min-w-0 truncate">Uploading {upload.name}…</span>
            <span className="h-1 w-24 shrink-0 bg-line" aria-hidden="true">
              <span className="block h-full bg-accent transition-[width] duration-200" style={{ width: `${upload.percent}%` }} />
            </span>
            <span className="tabular-nums">{upload.percent}%</span>
          </div>
        ) : uploadError ? (
          <p role="alert" className="mb-2 text-xs text-danger">
            {uploadError}
          </p>
        ) : null}
        <div className="flex items-end gap-2 border border-line-strong bg-paper p-1.5 transition-colors focus-within:border-ink has-[textarea:disabled]:bg-subtle">
          <input
            ref={fileRef}
            type="file"
            accept={RESUME_ACCEPT}
            onChange={(event) => void onFile(event)}
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || streaming || upload !== null}
            aria-label="Attach your CV (PDF or Word, up to 5 MB)"
            title="Attach your CV"
            className="inline-flex size-9 shrink-0 items-center justify-center text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path
                d="M13.5 7.25 8 12.75a3.25 3.25 0 0 1-4.6-4.6l5.65-5.65a2.1 2.1 0 0 1 3 3L6.4 11.15a1 1 0 0 1-1.4-1.4L10.25 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="square"
              />
            </svg>
          </button>
          <label htmlFor="intake-message" className="sr-only">
            Your message
          </label>
          <textarea
            id="intake-message"
            ref={ref}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            placeholder={disabled && disabledReason ? disabledReason : placeholder}
            aria-describedby={hintId}
            maxLength={MAX_LENGTH + 200}
            className="block min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop the reply"
              className="inline-flex size-9 shrink-0 items-center justify-center border border-line-strong text-ink transition-colors hover:border-ink"
            >
              <svg viewBox="0 0 16 16" className="size-3" aria-hidden="true">
                <rect x="3" y="3" width="10" height="10" fill="currentColor" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              aria-label="Send message"
              className="inline-flex size-9 shrink-0 items-center justify-center bg-accent text-paper transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            >
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
              </svg>
            </button>
          )}
        </div>
        <p id={hintId} className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
          <span>
            Chats are deleted after 14 days.{" "}
            <Link className={textLink} href="/privacy" target="_blank">
              Privacy<span className="sr-only"> (opens in a new tab)</span>
            </Link>
          </span>
          {nearLimit ? (
            <span className={value.length > MAX_LENGTH ? "text-danger" : undefined}>
              {value.length} / {MAX_LENGTH}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
