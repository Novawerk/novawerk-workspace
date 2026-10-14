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
