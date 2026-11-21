// The fields shown in the draft panel, per mode, in the order the agent asks for them
// (name and email come last). Names match the @nw/contracts draft shapes
// (and the plain forms), so the same keys travel through draft events, PATCH and `issues`.

export type DraftFieldKind = "text" | "email" | "textarea" | "multi" | "single";

export interface DraftField {
  key: string;
  label: string;
  kind: DraftFieldKind;
  /** Shown as the placeholder while the field is empty. */
  hint?: string;
  optional?: boolean;
  maxLength?: number;
  autoComplete?: string;
  options?: readonly { value: string; label: string }[];
}

export const PITCH_FIELDS: readonly DraftField[] = [
  { key: "projectName", label: "Project name", kind: "text", maxLength: 120, hint: "A working title is fine." },
  { key: "product", label: "Product", kind: "textarea", maxLength: 2000, hint: "What it is, and whose problem it solves." },
  {
    key: "userJourney",
    label: "User journey",
    kind: "textarea",
    maxLength: 2000,
    hint: "The steps someone goes through, from first hearing about it to using it.",
  },
  {
    key: "referencesAndInnovation",
    label: "References and what's new",
    kind: "textarea",
    maxLength: 2000,
    hint: "Similar products or projects, and how yours differs.",
  },
  {
    key: "team",
    label: "Team",
    kind: "textarea",
    maxLength: 2000,
    hint: "Who is on it, what they're good at, and which skills you still need.",
  },
  { key: "timeline", label: "Timeline", kind: "textarea", maxLength: 2000, hint: "What you want done by when." },
  { key: "name", label: "Name", kind: "text", maxLength: 100, autoComplete: "name", hint: "We ask for this at the end of the chat." },
  { key: "email", label: "Email", kind: "email", maxLength: 200, autoComplete: "email", hint: "So we can reply." },
  {
    key: "links",
    label: "Links",
    kind: "textarea",
    optional: true,
    maxLength: 500,
    hint: "A prototype, a repo, a deck — anything that helps.",
  },
];

export const fieldsFor = () => PITCH_FIELDS;

export const fieldLabel = (key: string) => PITCH_FIELDS.find((f) => f.key === key)?.label ?? (key === "resume" ? "CV" : key);

export type DraftValue = string | string[] | undefined;

export function isEmptyValue(value: DraftValue): boolean {
  return Array.isArray(value) ? value.length === 0 : !value?.trim();
}
