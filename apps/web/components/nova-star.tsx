const OUTER = "M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z";
const CORE = "M50 36 L51.4 48.6 L64 50 L51.4 51.4 L50 64 L48.6 51.4 L36 50 L48.6 48.6 Z";

const TONES = {
  /** Brand colours: green outer, deep-green core. */
  brand: { outer: "var(--color-accent)", core: "var(--color-accent-deep)" },
  /** Quiet grey, for placeholders. */
  neutral: { outer: "var(--color-line-strong)", core: "var(--color-subtle)" },
} as const;

/** The Nova Star. Always the star alone: no tile, no enclosing shape. Decorative by default. */
export function NovaStar({
  className,
  tone = "brand",
  title,
}: {
  className?: string;
  tone?: keyof typeof TONES;
  title?: string;
}) {
  const { outer, core } = TONES[tone];
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={OUTER} fill={outer} />
      <path d={CORE} fill={core} />
    </svg>
  );
}
