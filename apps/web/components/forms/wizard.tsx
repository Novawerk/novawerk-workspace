"use client";

import type { IntakeMode } from "@nw/contracts";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FieldErrors, FieldValues, Path, UseFormReturn } from "react-hook-form";

import { buttonAccent, buttonOutline } from "@/components/ui";
import { track } from "@/lib/analytics";

import { FormAlert } from "./fields";

// A form split into steps: one question (or a small group) per screen, a progress bar,
// Back / Next, and a last "check and send" step. Values live in one react-hook-form instance,
// so going back never loses anything; "Next" validates only the current step's fields.

export interface WizardStep<T extends FieldValues> {
  id: string;
  title: string;
  intro?: string;
  /** Validated when the visitor presses Next; also used to jump to the step with an error. */
  fields: readonly Path<T>[];
  content: React.ReactNode;
}

export function Wizard<T extends FieldValues>({
  form,
  steps,
  step,
  onStepChange,
  onSend,
  sendLabel,
  sendingLabel = "Sending…",
  formError,
  trackAs,
}: {
  form: UseFormReturn<T, unknown, unknown>;
  steps: WizardStep<T>[];
  step: number;
  onStepChange: (step: number) => void;
  /** Called on the last step. */
  onSend: () => void;
  sendLabel: string;
  sendingLabel?: string;
  formError?: React.ReactNode;
  /** Count each step shown (lib/analytics.ts) under this form's name. */
  trackAs?: IntakeMode;
}) {
  const current = steps[step]!;
  const isLast = step === steps.length - 1;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);

  useEffect(() => {
    if (trackAs) track("form_step", { form: trackAs, step: step + 1, of: steps.length });
  }, [trackAs, step, steps.length]);

  // Move focus to the new step so keyboard and screen-reader users land in the right place.
  // Only when the step changes: `current` is rebuilt on every render (an error clearing, a CV
  // attached), and refocusing then would pull the visitor away from what they're doing.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const first = current.fields[0];
    if (first && !isLast) form.setFocus(first);
    else headingRef.current?.focus();
  }, [step, current, isLast, form]);

  const next = async () => {
    const valid = await form.trigger(current.fields as Path<T>[], { shouldFocus: true });
    if (valid) onStepChange(Math.min(step + 1, steps.length - 1));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Enter in a text field moves forward instead of sending half a form.
    if (isLast) onSend();
    else void next();
  };

  const { isSubmitting } = form.formState;
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <form onSubmit={onSubmit} noValidate className="relative flex flex-col">
      <div>
        <div className="flex items-baseline justify-between gap-4 font-mono text-xs text-muted sm:text-sm">
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <span className="truncate">{current.title}</span>
        </div>
        <div
          className="mt-3 h-1 w-full bg-line"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={step + 1}
        >
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-10">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-balance outline-none sm:text-3xl"
        >
          {current.title}
        </h2>
        {current.intro ? <p className="mt-3 text-muted">{current.intro}</p> : null}
        <div className="mt-8 space-y-8">{current.content}</div>
      </div>

      {formError ? (
        <div className="mt-8">
          <FormAlert>{formError}</FormAlert>
        </div>
      ) : null}

      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        {step > 0 ? (
          <button type="button" onClick={() => onStepChange(step - 1)} className={buttonOutline}>
            Back
          </button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <button type="submit" disabled={isSubmitting} className={buttonAccent}>
          {isLast ? (isSubmitting ? sendingLabel : sendLabel) : "Next"}
        </button>
      </div>
    </form>
  );
}

/** Index of the first step that has an error, or -1. */
export function firstStepWithError<T extends FieldValues>(steps: WizardStep<T>[], errors: FieldErrors<T>): number {
  return steps.findIndex((s) => s.fields.some((field) => field.split(".")[0]! in errors));
}

// ─── Draft ───────────────────────────────────────────────────────────────────

interface Draft {
  values: Record<string, unknown>;
  step: number;
}

const noSubscription = () => () => {};

/** The draft as it was when the wizard mounted — read once per mount, so typing doesn't re-render. */
const draftsAtMount = new Map<string, string | null>();
function readDraftAtMount(key: string): string | null {
  if (!draftsAtMount.has(key)) {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      // Storage unavailable (private mode, blocked): no draft.
    }
    draftsAtMount.set(key, raw);
  }
  return draftsAtMount.get(key) ?? null;
}

function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Draft;
    return draft && typeof draft === "object" && draft.values ? draft : null;
  } catch {
    return null;
  }
}

/**
 * Keeps unfinished answers in this browser (localStorage), so leaving the page or closing the
 * tab doesn't lose a long answer. Consent boxes and the honeypot are never stored.
 * Storage can be unavailable (private mode, blocked); everything still works without it.
 */
export function useFormDraft<T extends FieldValues>(
  key: string,
  form: UseFormReturn<T, unknown, unknown>,
  // `omit` must be a stable reference (a module-level constant), or the save effect re-runs every render.
  { omit, lastStep }: { omit: readonly string[]; lastStep: number },
) {
  // False during prerender and hydration, true on the client afterwards. Nothing is read or
  // written before that, so the server HTML and the first client render always match.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  const raw = useSyncExternalStore(noSubscription, () => readDraftAtMount(key), () => null);
  const draft = useMemo(() => parseDraft(raw), [raw]);

  const [chosenStep, setStep] = useState<number | null>(null);
  // After a successful send the draft is gone for good, even if the form re-renders.
  const cleared = useRef(false);
  const step = chosenStep ?? Math.max(0, Math.min(draft?.step ?? 0, lastStep));

  // Restore the saved answers into the form (not React state).
  useEffect(() => {
    if (draft) form.reset({ ...form.getValues(), ...draft.values } as T, { keepDefaultValues: true });
  }, [draft, form]);

  // Save on every change, once we're past hydration.
  useEffect(() => {
    if (!ready) return;
    const save = (values: Record<string, unknown>) => {
      if (cleared.current) return;
      try {
        const kept = Object.fromEntries(Object.entries(values).filter(([k]) => !omit.includes(k)));
        window.localStorage.setItem(key, JSON.stringify({ values: kept, step } satisfies Draft));
      } catch {
        // Ignore: drafts are a convenience.
      }
    };
    save({ ...(draft?.values ?? {}), ...form.getValues() });
    const subscription = form.watch((values) => save(values as Record<string, unknown>));
    return () => subscription.unsubscribe();
  }, [ready, key, form, omit, step, draft]);

  // Next mount reads storage again (e.g. after a send cleared it).
  useEffect(() => () => void draftsAtMount.delete(key), [key]);

  const clear = () => {
    cleared.current = true;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  };

  return { step, setStep, clear };
}

// ─── Review ──────────────────────────────────────────────────────────────────

export interface ReviewItem {
  label: string;
  value: string;
  step: number;
}

/** The answers so far, each with an Edit button that jumps back to its step. */
export function Review({ items, onEdit }: { items: ReviewItem[]; onEdit: (step: number) => void }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr_auto] sm:gap-4">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="min-w-0 text-sm break-words whitespace-pre-line">
            {item.value.trim() ? item.value : <span className="text-muted">—</span>}
          </dd>
          <div className="sm:text-right">
            <button
              type="button"
              onClick={() => onEdit(item.step)}
              className="text-sm underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Edit<span className="sr-only"> {item.label}</span>
            </button>
          </div>
        </div>
      ))}
    </dl>
  );
}
