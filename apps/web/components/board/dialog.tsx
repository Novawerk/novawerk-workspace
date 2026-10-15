"use client";

import { useEffect, useId, useRef } from "react";

/**
 * A task board dialog in the VI's shape (docs/contributor-board-design.md, "Visual direction"):
 * a 16 px container with a tinted header band, one close control (× top right, plus Escape), a
 * footer for the actions. On a phone it is a full-screen sheet with a sticky footer. It takes the
 * page's theme. Built on the native <dialog>, so focus stays inside and the page behind is inert.
 */
export function Dialog({
  open,
  onClose,
  title,
  meta,
  footer,
  width = "sm:max-w-[620px]",
  as = "div",
  onSubmit,
  dismissible = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** A small line under the title. */
  meta?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  /** "form": the body and footer are one form (Enter in a field submits it). */
  as?: "div" | "form";
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** false: no ×, and Escape or the backdrop do nothing (the footer has the only ways out). */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const metaId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() moves focus itself; a field marked data-autofocus takes it back.
      const first = dialog.querySelector<HTMLElement>("[data-autofocus]");
      first?.focus();
      // Prefilled text (editing a proposal): the caret goes to the end, not before the first word.
      if (first instanceof HTMLTextAreaElement || first instanceof HTMLInputElement) {
        first.setSelectionRange(first.value.length, first.value.length);
      }
      const { overflow } = document.documentElement.style;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = overflow;
      };
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const panel =
    "grid max-h-[inherit] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-paper max-sm:h-full sm:rounded-2xl sm:border sm:border-line sm:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.25)]";
  const content = (
    <>
      <header className="flex items-start justify-between gap-3 bg-sheet-head px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight text-balance">
            {title}
          </h2>
          {meta ? (
            <p id={metaId} className="mt-1 text-[13px] text-muted">
              {meta}
            </p>
          ) : null}
        </div>
        {dismissible ? (
          <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full hover:bg-ink/8">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </header>
      <div className="grid content-start gap-5 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      {footer ? (
        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-3.5 [&>*]:flex-1 sm:[&>*]:flex-none">
          {footer}
        </footer>
      ) : null}
    </>
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={meta ? metaId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside the panel) closes it.
        if (dismissible && event.target === ref.current) onClose();
      }}
      className={`m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-ink/45 sm:m-auto sm:mt-14 sm:h-auto sm:max-h-[calc(100dvh-7rem)] sm:w-[calc(100%-2rem)] ${width}`}
    >
      {open ? (
        as === "form" ? (
          <form onSubmit={onSubmit} noValidate className={panel}>
            {content}
          </form>
        ) : (
          <div className={panel}>{content}</div>
        )
      ) : null}
    </dialog>
  );
}

/** Buttons inside a dialog use the VI's 12 px corners. */
export const dialogButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line-strong bg-paper px-4 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:border-ink disabled:cursor-not-allowed";
export const dialogButtonAccent =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-accent bg-accent px-4 text-sm font-medium whitespace-nowrap text-white transition-colors hover:border-accent-deep hover:bg-accent-deep disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-subtle disabled:text-muted";
export const dialogField =
  "block w-full min-w-0 rounded-xl border border-field bg-paper px-3 py-2.5 text-[15px] text-ink focus:border-accent focus:outline-2 focus:outline-offset-[-1px] focus:outline-accent aria-[invalid=true]:border-danger";

/** Pill segmented control (radio group). */
export function Pills<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  hint,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  hint?: React.ReactNode;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex w-fit max-w-full flex-wrap rounded-full border border-field p-[3px]">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer absolute inset-0 opacity-0"
            />
            <span className="block cursor-pointer rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </fieldset>
  );
}
