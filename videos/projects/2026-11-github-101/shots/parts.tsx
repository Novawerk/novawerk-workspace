import type { CSSProperties, ReactNode } from "react";
import { Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { NovaStar, Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { NARRATION, shown } from "../narration";
import { CLIPS, FPS, SHOTS, color, ease } from "../theme";
import { VOICE } from "../voice";

// What every shot of this film shares: the frame (series label, headline, subtitles, the voice),
// a drawn GitHub window, a cursor, and a few icons. GitHub's screens are drawn in our own style from
// the real layout and labels (BRIEF.md); the window says "示意".

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const SOFT = "#e7f3ec"; // brand green at ~10 % on white: a changed line, a picked option
const VO_GAIN = 1;

/** Frames from the start of `shot` to a time on the film's clock. */
export const frameIn = (shot: string) => (t: number) => Math.round((t - SHOTS[shot]!.start) * FPS);
export const framesOf = (shot: string) => Math.round(SHOTS[shot]!.dur * FPS);

/** 0 → 1 with a small overshoot: a note landing. */
export const land = (f: number, at: number, dur = 8) => progress(f, at, dur, ease.spring);
/** 0 → 1, plain. */
export const fade = (f: number, at: number, dur = 6) => progress(f, at, dur);

// --- the frame ---------------------------------------------------------------------------------

export function Shell({
  shot,
  dark = false,
  title,
  titleAt = 6,
  subtitles = true,
  children,
}: {
  shot: string;
  dark?: boolean;
  title?: readonly string[];
  titleAt?: number;
  /** Off when the picture already shows the words being said. */
  subtitles?: boolean;
  children: ReactNode;
}) {
  const f = useCurrentFrame();
  return (
    <Stage bg={dark ? color.ink : color.paper} fg={dark ? color.paper : color.ink}>
      <div style={{ position: "absolute", left: 64, top: 50, display: "flex", alignItems: "center", gap: 14 }}>
        <NovaStar size={34} tone={dark ? "dark" : "brand"} />
        <span style={{ fontFamily: monoFamily, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: dark ? color.lineStrong : color.muted }}>{copy.series}</span>
      </div>
      {title ? (
        <div style={{ position: "absolute", left: 64, top: 108, fontSize: 84, fontWeight: 900, lineHeight: 1.16, letterSpacing: -2 }}>
          {title.map((line, i) => {
            const p = fade(f, titleAt + i * 3, 7);
            return (
              <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>
                <Rich text={line} accent={dark ? color.signal : color.accent} />
              </div>
            );
          })}
        </div>
      ) : null}
      {children}
      {subtitles ? <Subtitles shot={shot} dark={dark} /> : null}
      <Voice shot={shot} />
    </Stage>
  );
}

// Each subtitle line with the time every phrase starts, per shot.
const LINES: Record<string, { from: number; to: number; phrases: { text: string; at: number }[] }[]> = {};
for (const [shot, s] of Object.entries(SHOTS)) {
  LINES[shot] = s.clips.flatMap((c) => {
    const seg = NARRATION.find((n) => n.id === c)!;
    const v = VOICE[c]!;
    return seg.lines.map((line, i) => ({
      from: CLIPS[c]! + v.t[i]![0]!,
      to: CLIPS[c]! + v.end[i]!,
      phrases: line.map((p, j) => ({ text: shown(p), at: CLIPS[c]! + v.t[i]![j]! })),
    }));
  });
}

/** The line being spoken, at the bottom; the words not said yet are grey. */
function Subtitles({ shot, dark }: { shot: string; dark: boolean }) {
  const f = useCurrentFrame();
  const t = SHOTS[shot]!.start + f / FPS;
  const line = [...LINES[shot]!].reverse().find((l) => t >= l.from - 0.12);
  if (!line || t > line.to + 0.8) return null;
  const p = fade(f, frameIn(shot)(line.from - 0.12), 5);
  return (
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 76, textAlign: "center", fontSize: 40, fontWeight: 700, lineHeight: 1.3, opacity: p }}>
      {line.phrases.map((ph) => (
        <span key={ph.text} style={{ color: t >= ph.at - 0.05 ? (dark ? color.paper : color.ink) : dark ? color.muted : color.lineStrong }}>
          {ph.text}
        </span>
      ))}
    </div>
  );
}

function Voice({ shot }: { shot: string }) {
  const s = SHOTS[shot]!;
  return (
    <>
      {s.clips.map((c) => (
        <Sequence key={c} from={frameIn(shot)(CLIPS[c]!)} layout="none">
          <Audio src={staticFile(`vo/${c}.mp3`)} volume={VO_GAIN} />
        </Sequence>
      ))}
    </>
  );
}

// --- icons: 24-unit outlines ---------------------------------------------------------------------

// (a function: JSX at module level runs before the bundle has React in scope)
const icons = () => ({
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />,
  issue: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  pr: (
    <>
      <circle cx="6" cy="5" r="2.4" />
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M6 7.4v9.2M18 16.6V10a3 3 0 0 0-3-3h-3M13.6 4.4 11 7l2.6 2.6" />
    </>
  ),
  merge: (
    <>
      <circle cx="6" cy="5" r="2.4" />
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M6 7.4v9.2M6 8c0 3 4 4 9.6 4" />
    </>
  ),
  pencil: <path d="M4 20l1-4L16 5l3 3L8 19zM13.5 7.5l3 3" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  upload: <path d="M12 16V5M7 10l5-5 5 5M4 20h16" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  chat: <path d="M4 5h16v11H10l-4 4v-4H4z" />,
  back: <path d="M4 9h10a5 5 0 0 1 0 10H8M8 5 4 9l4 4" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M3 16l5-5 4 4 3-3 6 6" />
      <circle cx="16" cy="9" r="1.4" />
    </>
  ),
  caret: <path d="M7 10l5 5 5-5" />,
});
type IconName = keyof ReturnType<typeof icons>;

export function Icon({ name, size = 40, stroke = 2.2, style }: { name: IconName; size?: number; stroke?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" style={{ display: "block", flexShrink: 0, ...style }}>
      {icons()[name]}
    </svg>
  );
}

// --- the drawn GitHub window ---------------------------------------------------------------------

export function Window({ tab, style, children }: { tab?: number; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 64, width: 952, background: color.paper, border: `3px solid ${color.ink}`, overflow: "hidden", ...style }}>
      <div style={{ height: 60, borderBottom: `3px solid ${color.ink}`, display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 8, border: `2.5px solid ${color.ink}` }} />
        ))}
        <span style={{ marginLeft: 14, fontFamily: monoFamily, fontSize: 25, fontWeight: 600 }}>{copy.repo}</span>
        <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: color.muted }}>{copy.demo}</span>
      </div>
      {tab === undefined ? null : (
        <div style={{ height: 62, borderBottom: `2px solid ${color.line}`, display: "flex", gap: 40, padding: "0 28px", fontSize: 27, fontWeight: 600 }}>
          {copy.tabs.map((name, i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", color: i === tab ? color.ink : color.muted, borderBottom: `5px solid ${i === tab ? color.accent : "transparent"}`, marginBottom: -2 }}>
              {name}
            </div>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

/**
 * Fade in and rise while `p` runs to 1, then no style at all. A box that keeps `opacity: 1` and a zero
 * transform stays on a layer of its own, and the renderer has captured such layers with a strip not
 * painted yet (the first cut of this film had the commit box's top third missing on many frames).
 */
export function settle(p: number, rise: number): CSSProperties {
  return p < 1 ? { opacity: Math.min(1, Math.max(0, p)), transform: `translateY(${(1 - p) * rise}px)` } : {};
}

/** A sheet of white over what is behind a dialog. Not `opacity` on the content: see `settle`. */
export function Veil() {
  return <div style={{ position: "absolute", left: 0, top: 0, width: 946, height: 900, background: "rgba(255,255,255,0.78)" }} />;
}

/** A screen inside the window: on from `from` (frames) until `to`, with a short fade and rise. */
export function Screen({ f, from = -99, to = 1e9, children }: { f: number; from?: number; to?: number; children: ReactNode }) {
  if (f < from || f >= to) return null;
  const p = fade(f, from, 6);
  return <div style={{ position: "absolute", left: 0, top: 0, width: 946, ...settle(p, 14) }}>{children}</div>;
}

export function Btn({ children, primary = false, hot = false, style }: { children: ReactNode; primary?: boolean; hot?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 22px",
        fontSize: 27,
        fontWeight: 700,
        whiteSpace: "nowrap",
        border: `3px solid ${color.ink}`,
        background: primary ? color.accent : color.paper,
        color: primary ? color.paper : color.ink,
        boxShadow: hot ? `0 0 0 7px ${SOFT}, 0 0 0 10px ${color.accent}` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A person: an initial in a circle. Nobody real. */
export function Avatar({ who, size = 56 }: { who: string; size?: number }) {
  const me = who === copy.me;
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.46, fontWeight: 800, border: `3px solid ${color.ink}`, background: me ? color.ink : color.paper, color: me ? color.paper : color.ink }}>
      {who}
    </div>
  );
}

/** A state pill: Open is green outline, Closed / Merged are ink. */
export function Pill({ icon, children, solid = false }: { icon: IconName; children: ReactNode; solid?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 20px 8px 14px", borderRadius: 30, fontSize: 27, fontWeight: 800, border: `3px solid ${solid ? color.ink : color.accent}`, background: solid ? color.ink : color.paper, color: solid ? color.paper : color.accent }}>
      <Icon name={icon} size={32} stroke={2.4} />
      {children}
    </div>
  );
}

/** The first characters of `text`, typed from frame `at`. */
export function typed(text: string, f: number, at: number, perSecond = 15) {
  return [...text].slice(0, Math.max(0, Math.floor(((f - at) / FPS) * perSecond))).join("");
}
export const typingFrames = (text: string, perSecond = 15) => Math.ceil(([...text].length / perSecond) * FPS);

export function Caret({ f, on }: { f: number; on: boolean }) {
  return on && f % 16 < 10 ? <span style={{ display: "inline-block", width: 3, height: "1.05em", background: color.accent, verticalAlign: "-0.15em", marginLeft: 2 }} /> : null;
}

/**
 * The pointer. `path` is [frame, x, y] keyframes in the parent's coordinates; it eases between them.
 * On each click frame it dips and a ring spreads.
 */
export function Cursor({ f, path, clicks }: { f: number; path: readonly (readonly [number, number, number])[]; clicks: readonly number[] }) {
  const first = path[0]!;
  const last = path[path.length - 1]!;
  if (f < first[0] - 4 || f > last[0] + 14) return null;
  const frames = path.map((k) => k[0]);
  const easing = ease.ui;
  const x = path.length > 1 ? interpolate(f, frames, path.map((k) => k[1]), { ...clamp, easing }) : first[1];
  const y = path.length > 1 ? interpolate(f, frames, path.map((k) => k[2]), { ...clamp, easing }) : first[2];
  const click = clicks.find((c) => f >= c && f < c + 12);
  const k = click === undefined ? 0 : (f - click) / 12;
  const dip = click !== undefined && f - click < 4 ? 0.82 : 1;
  const opacity = Math.min(fade(f, first[0] - 4, 4), 1 - fade(f, last[0] + 8, 6));
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}>
      {click === undefined ? null : <div style={{ position: "absolute", left: -40 * k - 8, top: -40 * k - 8, width: 80 * k + 16, height: 80 * k + 16, borderRadius: 60, border: `4px solid ${color.accent}`, opacity: 1 - k }} />}
      {/* the dip is a smaller box, not a transform: a transform here puts the pointer on its own layer for
          those frames, and the renderer has caught the layer under it half-painted */}
      <svg viewBox="0 0 24 24" width={54 * dip} height={54 * dip} style={{ display: "block" }}>
        <path d="M4 2l15 9.5-6.6 1.4L16 20l-3 1.4-3.5-7L5 18.5z" fill={color.ink} stroke={color.paper} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
}
