import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/**
 * Put the API's `issues` (field → messages) onto the matching form fields.
 * Returns messages for keys the form doesn't know, to show in the form-level alert.
 */
export function applyServerIssues<T extends FieldValues>(
  issues: Record<string, string[]>,
  fields: readonly Path<T>[],
  setError: UseFormSetError<T>,
): string[] {
  const unmatched: string[] = [];
  let focused = false;

  for (const [key, messages] of Object.entries(issues)) {
    const message = messages?.[0] ?? "Please check this field.";
    const field = key.split(".")[0] as Path<T>;
    if (fields.includes(field)) {
      setError(field, { type: "server", message }, { shouldFocus: !focused });
      focused = true;
    } else {
      unmatched.push(message);
    }
  }
  return unmatched;
}
