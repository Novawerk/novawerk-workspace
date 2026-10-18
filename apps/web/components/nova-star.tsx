/** Outer star plus the core as a second sub-path; with even-odd fill the core is a cutout. */
const STAR =
  "M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z " +
  "M50 36 L51.4 48.6 L64 50 L51.4 51.4 L50 64 L48.6 51.4 L36 50 L48.6 48.6 Z";

const TONES = {
  /** Brand green; the core is cut out and shows the ground. */
  brand: "var(--color-accent)",
  /** Quiet grey, for placeholders. */
  neutral: "var(--color-line-strong)",
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
  const fill = TONES[tone];
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={STAR} fill={fill} fillRule="evenodd" />
    </svg>
  );
}
