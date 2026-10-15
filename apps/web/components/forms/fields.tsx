import type { UseFormRegisterReturn } from "react-hook-form";

// Form building blocks shared by /submit and the newsletter box.
// Each control wires its label, helper text and error message for screen readers.

const control =
  "block w-full border border-line-strong bg-paper px-3 text-base text-ink transition-colors duration-150 placeholder:text-muted hover:border-ink focus:border-accent aria-[invalid=true]:border-danger";

interface FieldProps {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  optional?: boolean;
}

function describedBy(id: string, helper?: string, error?: string) {
  return [helper ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="mt-2 text-sm text-danger">
      {error}
    </p>
  );
}

function FieldShell({ id, label, helper, error, optional, children }: FieldProps & { children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {optional ? <span className="ml-2 font-normal text-muted">Optional</span> : null}
      </label>
      {helper ? (
        <p id={`${id}-help`} className="mt-1 text-sm text-muted">
          {helper}
        </p>
      ) : null}
      <div className="mt-2">{children}</div>
      <FieldError id={id} error={error} />
    </div>
  );
}

export function TextField({
  registration,
  type = "text",
  autoComplete,
  ...field
}: FieldProps & {
  registration: UseFormRegisterReturn;
  type?: "text" | "email" | "url";
  autoComplete?: string;
}) {
  return (
    <FieldShell {...field}>
      <input
        id={field.id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(field.id, field.helper, field.error)}
        className={`${control} h-11`}
        {...registration}
      />
    </FieldShell>
  );
}

export function TextArea({
  registration,
  rows = 5,
  ...field
}: FieldProps & { registration: UseFormRegisterReturn; rows?: number }) {
  return (
    <FieldShell {...field}>
      <textarea
        id={field.id}
        rows={rows}
        aria-invalid={field.error ? true : undefined}
        aria-describedby={describedBy(field.id, field.helper, field.error)}
        className={`${control} resize-y py-2.5 leading-relaxed`}
        {...registration}
      />
    </FieldShell>
  );
}

export function Checkbox({
  id,
  registration,
  error,
  children,
}: {
  id: string;
  registration: UseFormRegisterReturn;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-accent"
          {...registration}
        />
        <label htmlFor={id} className="text-sm leading-6">
          {children}
        </label>
      </div>
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Multi- or single-choice chips (checkboxes or radios styled as toggles). */
export function ChoiceGroup({
  id,
  legend,
  helper,
  error,
  type,
  options,
  registration,
}: {
  id: string;
  legend: string;
  helper?: string;
  error?: string;
  type: "checkbox" | "radio";
  options: readonly { value: string; label: string }[];
  registration: UseFormRegisterReturn;
}) {
  return (
    <fieldset aria-describedby={describedBy(id, helper, error)}>
      <legend className="text-sm font-medium">{legend}</legend>
      {helper ? (
        <p id={`${id}-help`} className="mt-1 text-sm text-muted">
          {helper}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type={type}
              value={option.value}
              className="peer sr-only"
              aria-invalid={error ? true : undefined}
              {...registration}
            />
            <span className="inline-flex min-h-10 items-center border border-line-strong px-3 py-2 text-sm transition-colors duration-150 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent hover:border-ink">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      <FieldError id={id} error={error} />
    </fieldset>
  );
}

/** Hidden from people, irresistible to bots. The API drops any submission that fills it. */
export function Honeypot({ registration }: { registration: UseFormRegisterReturn }) {
  return (
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
      <label htmlFor="website">Website</label>
      <input id="website" type="text" tabIndex={-1} autoComplete="off" {...registration} />
    </div>
  );
}

/** Form-level error banner. */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="border border-danger px-4 py-3 text-sm text-danger">
      {children}
    </div>
  );
}

/** Replaces a form once it went through. Focus moves here so screen readers announce it. */
export function FormSuccess({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      role="status"
      tabIndex={-1}
      ref={(node) => node?.focus()}
      className="border border-line p-6 outline-none sm:p-8"
    >
      <p className="text-xl font-medium tracking-tight">{title}</p>
      {children ? <div className="mt-3 text-muted">{children}</div> : null}
    </div>
  );
}
