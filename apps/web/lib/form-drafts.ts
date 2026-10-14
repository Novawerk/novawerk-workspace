// localStorage keys of the plain step-by-step forms (components/forms/wizard.tsx → useFormDraft),
// and a way to hand them what the Intake Agent collected, so switching to the plain form
// never starts from a blank page.

import type { IntakeMode } from "@nw/contracts";

export const FORM_DRAFT_KEYS = {
  pitch: "nw:submit-draft",
  join: "nw:join-draft",
} as const satisfies Record<IntakeMode, string>;

/** Text with something in it, a non-empty list, or an attached CV. */
const isFilled = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : typeof v === "object" && v !== null;

const filledOnly = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).filter(([, v]) => isFilled(v)));

/** Seed the plain form's saved draft, unless the visitor already typed something there. */
export function seedFormDraft(mode: IntakeMode, values: Record<string, unknown>) {
  const filled = filledOnly(values);
  if (Object.keys(filled).length === 0) return;
  try {
    const key = FORM_DRAFT_KEYS[mode];
    const existing = JSON.parse(window.localStorage.getItem(key) ?? "null") as { values?: Record<string, unknown> } | null;
    if (existing?.values && Object.keys(filledOnly(existing.values)).length > 0) return;
    window.localStorage.setItem(key, JSON.stringify({ values: filled, step: 0 }));
  } catch {
    // Storage unavailable or unreadable: the plain form starts as it is.
  }
}
