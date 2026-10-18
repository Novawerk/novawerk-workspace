import type { CSSProperties, ReactNode } from "react";

import { wordmarkFamily } from "./fonts";
import { color, ease, sec } from "./theme";
import { progress } from "./motion";

// The Nova Star (knowledge/brand/mark.md): two concentric four-pointed stars, never enclosed.
const CORE: [number, number][] = [[50, 36], [51.4, 48.6], [64, 50], [51.4, 51.4], [50, 64], [48.6, 51.4], [36, 50], [48.6, 48.6]];

/** The core at `scale` around the centre, as a sub-path. With even-odd fill it is cut out of the star. */
function core(scale: number) {
  const pts = CORE.map(([x, y]) => `${50 + (x - 50) * scale} ${50 + (y - 50) * scale}`);
  return `M${pts.join(" L")} Z`;
}

/** The outer star with its four points reaching `reach` (0 = folded to the pinch, 1 = the mark). */
function outer(reach: number) {
  const d = 5 + 45 * reach;
  return `M50 ${50 - d} L55 45 L${50 + d} 50 L55 55 L50 ${50 + d} L45 55 L${50 - d} 50 L45 45 Z`;
}

// The core is always a cutout: it shows whatever ground the star sits on.
const TONES = {
  brand: color.accent,
  dark: color.paper,
  neutral: color.lineStrong,
} as const;

export function NovaStar({
  size,
  tone = "brand",
  rotate = 0,
  reach = 1,
  style,
}: {
  size: number;
  tone?: keyof typeof TONES;
  rotate?: number;
  reach?: number;
  style?: CSSProperties;
}) {
  const coreScale = Math.min(1, Math.max(0, reach));
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block", overflow: "visible", transform: `rotate(${rotate}deg)`, ...style }}>
      <path d={coreScale > 0 ? `${outer(reach)} ${core(coreScale)}` : outer(reach)} fill={TONES[tone]} fillRule="evenodd" />
    </svg>
  );
}

/** The wordmark: Cabinet Grotesk 800, -3.2 px at 74 px (visual-identity.md). */
export function Wordmark({ size, fill = color.ink, style }: { size: number; fill?: string; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: wordmarkFamily, fontWeight: 800, fontSize: size, letterSpacing: (-3.2 / 74) * size, color: fill, lineHeight: 1, ...style }}>
      Novawerk
    </span>
  );
}

/** The horizontal lockup: star, gap of half the star's height, wordmark. */
export function Lockup({
  height,
  tone = "brand",
  rotate = 0,
  reach = 1,
  starStyle,
  wordmarkStyle,
}: {
  height: number;
  tone?: "brand" | "dark";
  rotate?: number;
  reach?: number;
  starStyle?: CSSProperties;
  wordmarkStyle?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: height / 2 }}>
      <NovaStar size={height} tone={tone} rotate={rotate} reach={reach} style={starStyle} />
      <Wordmark size={height * 1.15} fill={tone === "dark" ? color.paper : color.ink} style={wordmarkStyle} />
    </div>
  );
}

/** Text with **word** set in `accent`. */
export function Rich({ text, accent }: { text: string; accent: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
        part.startsWith("**") ? (
          <span key={j} style={{ color: accent }}>
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={j}>{part}</span>
        ),
      )}
    </>
  );
}

/** A note card from the hook: white, ink border, square corners. */
export function Note({ children, style, ink = color.ink }: { children: ReactNode; style?: CSSProperties; ink?: string }) {
  return (
    <div style={{ background: color.paper, border: `3px solid ${ink}`, color: ink, padding: "26px 34px", fontSize: 50, fontWeight: 800, whiteSpace: "nowrap", ...style }}>
      {children}
    </div>
  );
}

/**
 * The star's fall (timeline.ts, STAR_FALL): folded small, it drops for one beat with gravity and a
 * half turn, squashes on landing, then its points spring out. `f` counts from the start of the fall.
 */
export function starFall(f: number, fallFrames: number) {
  const t = Math.min(1, Math.max(0, f / fallFrames));
  const after = f - fallFrames;
  const squash = after < 0 ? 0 : Math.max(0, 1 - after / 5); // 5 frames back to round
  const unfold = after < 0 ? 0 : 1 - Math.exp(-after / 2.2) * Math.cos(after / 2.4); // springy, overshoots once
  return {
    drop: 1 - t * t, // 1 = up high, 0 = landed
    spin: (1 - t) * 180,
    scaleX: 1 + 0.25 * squash,
    scaleY: 1 - 0.3 * squash,
    reach: 0.12 + 0.88 * unfold,
    landed: after >= 0,
  };
}

/** Captions that replace each other: the newest one whose `at` (seconds into the shot) has passed. */
export function SwapCaption({
  f,
  captions,
  accent,
  style,
}: {
  f: number;
  captions: readonly { at: number; lines: readonly string[] }[];
  accent: string;
  style?: CSSProperties;
}) {
  const current = [...captions].reverse().find((c) => f >= sec(c.at));
  if (!current) return null;
  const local = f - sec(current.at);
  return (
    <div style={{ fontSize: 104, fontWeight: 900, lineHeight: 1.14, letterSpacing: -2, ...style }}>
      {current.lines.map((line, k) => {
        const p = progress(local, k * 3, 7, ease.spring);
        return (
          <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            <Rich text={line} accent={accent} />
          </div>
        );
      })}
    </div>
  );
}
