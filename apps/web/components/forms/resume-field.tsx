"use client";

import type { ResumeRef } from "@nw/contracts";
import { useEffect, useRef, useState } from "react";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";

import { buttonOutline } from "@/components/ui";
import { RESUME_ACCEPT, RESUME_HELP, UploadError, uploadResume } from "@/lib/uploads";

// Attaching a CV: pick a file, it uploads at once (lib/uploads.ts), and the form keeps only
// where it went and its name. Used by the plain forms (ResumeFormField) and the chat panel.

function DocumentIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-muted" aria-hidden="true">
      <path d="M4 1.75h5.25L12.5 5v9.25h-8.5z M9 1.75V5.25h3.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

const quietButton =
  "shrink-0 text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-60";

export function ResumePicker({
  id,
  value,
  onChange,
  error,
  disabled,
  compact,
  describedBy,
  onBusyChange,
  buttonRef,
}: {
  id: string;
  value: ResumeRef | null | undefined;
  onChange: (value: ResumeRef | null) => void;
  /** From the server or the form; an upload's own error shows first. */
  error?: string;
  disabled?: boolean;
  /** Smaller type for the chat panel. */
  compact?: boolean;
  /** Ids of help text outside the picker. */
  describedBy?: string;
  onBusyChange?: (busy: boolean) => void;
  /** Gets the main button (Attach / Replace), e.g. so a form can focus it on an error. */
  buttonRef?: (element: HTMLButtonElement | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const setAction = (element: HTMLButtonElement | null) => {
    actionRef.current = element;
    buttonRef?.(element);
  };
  const [uploading, setUploading] = useState<{ name: string; percent: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const message = uploadError ?? error;
  const errorId = message ? `${id}-error` : undefined;
  const described = [describedBy, errorId].filter(Boolean).join(" ") || undefined;
  const text = compact ? "text-[13px]" : "text-sm";

  // Keep keyboard focus on the picker when its buttons swap (Attach ↔ Replace): after the
  // render that shows the new state.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    actionRef.current?.focus();
  });

  const pick = () => inputRef.current?.click();

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // Picking the same file again still fires a change.
    if (!file) return;
    setUploadError(null);
    setUploading({ name: file.name, percent: 0 });
    setAnnouncement(`Uploading ${file.name}…`);
    onBusyChange?.(true);
    try {
      // Progress is throttled and can arrive after the upload is done: only update a running one.
      const resume = await uploadResume(file, (percent) =>
        setUploading((current) => current && { ...current, percent: Math.round(percent) }),
      );
      onChange(resume);
      setAnnouncement(`CV attached: ${resume.name}.`);
    } catch (err) {
      setUploadError(err instanceof UploadError ? err.message : "The upload didn't work. Please try again.");
      setAnnouncement("");
    } finally {
      setUploading(null);
      onBusyChange?.(false);
      refocus.current = true;
    }
  };

  const remove = () => {
    onChange(null);
    setUploadError(null);
    setAnnouncement("CV removed.");
    refocus.current = true;
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={RESUME_ACCEPT}
        onChange={(event) => void onFile(event)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      {uploading || value ? (
        <div className={`flex items-center gap-3 border border-line-strong bg-paper px-3 ${compact ? "py-2" : "py-2.5"}`}>
          <DocumentIcon />
          <div className="min-w-0 flex-1">
            <p className={`truncate ${text}`} title={uploading?.name ?? value?.name}>
              {uploading?.name ?? value?.name}
            </p>
            {uploading ? (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 bg-line" aria-hidden="true">
                  <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${uploading.percent}%` }} />
                </div>
                <span className="text-xs text-muted tabular-nums">{uploading.percent}%</span>
              </div>
            ) : null}
          </div>
          {uploading ? null : (
            <>
              <button
                ref={setAction}
                id={id}
                type="button"
                onClick={pick}
                disabled={disabled}
                aria-describedby={described}
                aria-label={`Replace your CV (${value?.name})`}
                className={`${quietButton} ${text}`}
              >
                Replace
              </button>
              <button type="button" onClick={remove} disabled={disabled} className={`${quietButton} ${text}`}>
                Remove
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          ref={setAction}
          id={id}
          type="button"
          onClick={pick}
          disabled={disabled}
          aria-describedby={described}
          className={compact ? `${buttonOutline} h-9 px-3 text-[13px]` : buttonOutline}
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
            <path d="M8 11V2.5M4.5 6L8 2.5 11.5 6M2.5 10.5v3h11v-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
          Attach your CV
        </button>
      )}
      {message ? (
        <p id={errorId} className={`mt-2 ${compact ? "text-xs" : "text-sm"} text-danger`}>
          {message}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/**
 * The CV as part of a plain form: label, help text, the picker, bound to the form's `name` field.
 * Only this component re-renders when the CV changes, so the rest of the step keeps its focus.
 */
export function ResumeFormField<T extends FieldValues, TOut = T>({
  control,
  name,
  label,
  helper,
}: {
  control: Control<T, unknown, TOut>;
  name: Path<T>;
  label: string;
  helper?: string;
}) {
  const { field, fieldState } = useController({ control, name });
  // A server error sits on the field; a schema error on its parts (`resume.pathname`).
  const error = fieldState.error as { message?: string; pathname?: { message?: string } } | undefined;
  const id = name;
  const helpId = `${id}-help`;
  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <p id={`${id}-label`} className="block text-sm font-medium">
        {label}
        <span className="ml-2 font-normal text-muted">Optional</span>
      </p>
      <p id={helpId} className="mt-1 text-sm text-muted">
        {helper ? `${helper} ` : ""}
        {RESUME_HELP}
      </p>
      <div className="mt-2">
        <ResumePicker
          id={id}
          describedBy={helpId}
          value={field.value as ResumeRef | null | undefined}
          onChange={field.onChange}
          error={error?.message ?? error?.pathname?.message}
          buttonRef={field.ref}
        />
      </div>
    </div>
  );
}
