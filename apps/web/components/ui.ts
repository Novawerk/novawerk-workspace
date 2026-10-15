// Shared class strings. Square corners, thin borders, one accent (green).

export const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

const button =
  "inline-flex h-11 items-center justify-center gap-2 border px-5 text-sm font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";

/** Green. Use for the single most important action on a surface. */
export const buttonAccent = `${button} border-accent bg-accent text-paper hover:border-accent-deep hover:bg-accent-deep`;
/** Near-black. Strong, but not the accent. */
export const buttonInk = `${button} border-ink bg-ink text-paper hover:border-accent-deep hover:bg-accent-deep`;
/** Outline. */
export const buttonOutline = `${button} border-line-strong bg-paper text-ink hover:border-ink`;

export const textLink =
  "underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink";

export const eyebrow = "font-mono text-xs text-muted sm:text-sm";

/** Small buttons for cards and toolbars on the task board. */
const buttonSmall =
  "inline-flex h-8 items-center justify-center gap-2 border px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";
export const buttonSmallOutline = `${buttonSmall} border-line-strong bg-paper text-ink hover:border-ink`;
export const buttonSmallInk = `${buttonSmall} border-ink bg-ink text-paper hover:border-accent-deep hover:bg-accent-deep`;
export const buttonSmallDanger = `${buttonSmall} border-line-strong bg-paper text-danger hover:border-danger`;
export const buttonGhost =
  "inline-flex h-11 items-center justify-center gap-2 border border-transparent px-5 text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:border-line-strong";

/** Inputs on the task board: a darker border than the old forms, so the field reads as a field. */
export const field =
  "block w-full min-w-0 border border-field bg-paper px-3 py-2 text-[15px] text-ink transition-colors duration-150 hover:border-ink focus:border-accent focus:outline-2 focus:outline-offset-[-1px] focus:outline-accent aria-[invalid=true]:border-danger";
export const fieldLabel = "block text-sm font-medium";
export const fieldHint = "text-[13px] font-normal text-muted";
