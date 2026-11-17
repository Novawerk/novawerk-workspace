import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";

import { Buddy, Dancer, beatsAt, dancePose } from "../../../kit/dancer";
import type { Step } from "../../../kit/dancer";
import { NovaStar } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { copies } from "../copy";
import { LYRICS, shown } from "../lyrics";
import type { Lang } from "../lyrics";
import { FPS, TIMELINES, color, ease } from "../theme";

// What every shot of this film shares: which language it is in, the frame (series label and the line
// being sung, big), the dancer and the robot on the song's beat, a drawn GitHub window, a few icons.
// GitHub's window is drawn in our own style (BRIEF.md) and says "示意".

const border = `3px solid ${color.ink}`;

// --- the language ---------------------------------------------------------------------------------

export const FilmLang = createContext<Lang>("zh");

/** The shot's clock, words and frame: `at(t)` turns a time on the film's clock into this shot's frame. */
export function useShot(shot: string) {
  const lang = useContext(FilmLang);
  const t = TIMELINES[lang]!;
  const start = t.SHOTS[shot]!.start;
  const f = useCurrentFrame();
  return { lang, t, c: copies[lang], f, now: start + f / FPS, at: (time: number) => Math.round((time - start) * FPS) };
}
export const framesOf = (lang: Lang, shot: string) => Math.round(TIMELINES[lang]!.SHOTS[shot]!.dur * FPS);

/** 0 → 1 with a small overshoot: a note landing. */
export const land = (f: number, at: number, dur = 8) => progress(f, at, dur, ease.spring);
/** 0 → 1, plain. */
export const fade = (f: number, at: number, dur = 6) => progress(f, at, dur);

/**
 * A card dropping into place: fades in, falls `fall` px with a small overshoot and a tilt, then no
 * style at all (see `settle`).
 */
export function drop(f: number, at: number, fall = 40, tilt = 0): CSSProperties {
  const d = land(f, at, 9);
  return f >= at + 9 ? {} : { opacity: fade(f, at, 3), transform: `translateY(${(1 - d) * -fall}px) rotate(${(1 - d) * tilt}deg)` };
}
/** A big word popping in: scales up from 85 %, then no style at all. */
export function pop(f: number, at: number): CSSProperties {
  return f >= at + 10 ? {} : { opacity: fade(f, at, 4), transform: `scale(${0.85 + 0.15 * land(f, at, 10)})` };
}

/**
 * Fade in and rise while `p` runs to 1, then no style at all. A box that keeps `opacity: 1` and a zero
 * transform stays on a layer of its own, and the renderer has captured such layers with a strip not
 * painted yet (the first cut of this film had a dialog's top third missing on many frames).
 */
export function settle(p: number, rise: number): CSSProperties {
  return p < 1 ? { opacity: Math.min(1, Math.max(0, p)), transform: `translateY(${(1 - p) * rise}px)` } : {};
}

// --- the frame ---------------------------------------------------------------------------------

/** Where the dancer's feet stand. */
export const FLOOR = 1310;

export function Shell({
  shot,
  dark = false,
  lyric = true,
  children,
}: {
  shot: string;
  dark?: boolean;
  /** `false`, or the lines to show, when the picture itself shows the words being sung. */
  lyric?: boolean | readonly number[];
  children: ReactNode;
}) {
  const { c } = useShot(shot);
  return (
    <Stage bg={dark ? color.ink : color.paper} fg={dark ? color.paper : color.ink}>
      <div style={{ position: "absolute", left: 64, top: 50, display: "flex", alignItems: "center", gap: 14 }}>
        <NovaStar size={34} tone={dark ? "dark" : "brand"} />
        <span style={{ fontFamily: monoFamily, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: dark ? color.lineStrong : color.muted }}>{c.series}</span>
      </div>
      {children}
      {lyric ? <Lyric shot={shot} dark={dark} only={lyric === true ? undefined : lyric} /> : null}
    </Stage>
  );
}

/**
 * The line being sung, as the headline: the phrase being sung is green, what was sung is ink, what
 * is still to come is grey. It stays until the next line starts.
 */
function Lyric({ shot, dark, only }: { shot: string; dark: boolean; only?: readonly number[] }) {
  const { f, now, t, lang, at } = useShot(shot);
  const v = t.song.seg[shot]!;
  const lines = LYRICS[lang].find((s) => s.id === shot)!.lines.map((line, i) => ({
    i,
    from: v.t[i]![0]!,
    phrases: line.map((p, j) => ({ text: shown(p), from: v.t[i]![j]!, to: v.t[i]![j + 1] ?? v.end[i]! + 0.15 })),
  }));
  const line = [...lines].reverse().find((l) => now >= l.from - 0.1);
  if (!line || (only && !only.includes(line.i))) return null;
  const zh = lang === "zh";
  return (
    <div style={{ position: "absolute", left: 64, right: 56, top: 108, fontSize: zh ? 80 : 56, fontWeight: 900, lineHeight: zh ? 1.2 : 1.18, letterSpacing: zh ? -2 : -1.5, ...settle(fade(f, at(line.from - 0.1), 4), 14) }}>
      {line.phrases.map((ph, j) => (
        // a line breaks between phrases, never inside one ("pre" keeps an English phrase's trailing space)
        <span key={j} style={{ display: "inline-block", whiteSpace: zh ? "nowrap" : "pre", color: now < ph.from - 0.04 ? (dark ? color.muted : color.lineStrong) : now < ph.to ? (dark ? color.signal : color.accent) : dark ? color.paper : color.ink }}>
          {ph.text}
        </span>
      ))}
    </div>
  );
}

// --- the dancer and the robot, on this song's beat ----------------------------------------------------

/** The beaver, dancing: `steps` say which move from when (seconds on the film's clock). */
export function Beaver({ shot, steps, x, height = 440, dark = false, bounce }: { shot: string; steps: readonly Step[]; x: number; height?: number; dark?: boolean; bounce?: number }) {
  const { now, t } = useShot(shot);
  return <Dancer pose={dancePose(steps, now, t.song, bounce)} x={x} floor={FLOOR} height={height} tone={dark ? "dark" : "light"} />;
}
/** The agent, as a robot. `up`: from when its arms stay up. */
export function Bot({ shot, x, height = 300, up = 1e9, dark = false }: { shot: string; x: number; height?: number; up?: number; dark?: boolean }) {
  const { now, t } = useShot(shot);
  return <Buddy beats={beatsAt(now, t.song) + 0.5} x={x} floor={FLOOR} height={height} arms={now >= up ? "up" : "swing"} tone={dark ? "dark" : "light"} />;
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
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
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
  pointer: <path d="M5 3l13 8.5-5.6 1.3L15.5 19l-2.6 1.2-3-6.2L6 17.5z" />,
});
type IconName = keyof ReturnType<typeof icons>;

export function Icon({ name, size = 40, stroke = 2.2, style }: { name: IconName; size?: number; stroke?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" style={{ display: "block", flexShrink: 0, ...style }}>
      {icons()[name]}
    </svg>
  );
}

// --- the drawn GitHub window, and what an agent hands back ---------------------------------------------------------------------

/** A window with a title bar: three dots, a name, "示意". */
export function Frame({ name, style, children }: { name: ReactNode; style?: CSSProperties; children: ReactNode }) {
  const lang = useContext(FilmLang);
  return (
    <div style={{ position: "absolute", left: 64, width: 952, background: color.paper, border, overflow: "hidden", ...style }}>
      <div style={{ height: 60, borderBottom: border, display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 8, border: `2.5px solid ${color.ink}` }} />
        ))}
        <span style={{ marginLeft: 14, fontFamily: monoFamily, fontSize: 25, fontWeight: 600 }}>{name}</span>
        <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: color.muted }}>{copies[lang].demo}</span>
      </div>
      {children}
    </div>
  );
}

export function Window({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  const c = copies[useContext(FilmLang)];
  return (
    <Frame name={c.repo} style={style}>
      <div style={{ position: "relative" }}>{children}</div>
    </Frame>
  );
}

/** A person: an initial in a circle; "me" is filled. Nobody real. */
export function Avatar({ who, size = 56 }: { who: string; size?: number }) {
  const me = who === copies[useContext(FilmLang)].me;
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * (who.length > 1 ? 0.36 : 0.46), fontWeight: 800, border, background: me ? color.ink : color.paper, color: me ? color.paper : color.ink }}>
      {who}
    </div>
  );
}

/** A state pill: Open is green outline, Merged is ink. */
export function Pill({ icon, children, solid = false }: { icon: IconName; children: ReactNode; solid?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px 5px 10px", borderRadius: 30, fontSize: 23, fontWeight: 800, whiteSpace: "nowrap", border: `3px solid ${solid ? color.ink : color.accent}`, background: solid ? color.ink : color.paper, color: solid ? color.paper : color.accent }}>
      <Icon name={icon} size={26} stroke={2.4} />
      {children}
    </div>
  );
}

/** A comment under an issue or a pull request. */
export function Comment({ f, at, who, text, top, tick = false }: { f: number; at: number; who: string; text: string; top: number; tick?: boolean }) {
  if (f < at) return null;
  return (
    <div style={{ position: "absolute", left: 28, top, display: "flex", alignItems: "center", gap: 16, ...settle(fade(f, at, 6), 22) }}>
      <Avatar who={who} size={62} />
      <div style={{ padding: "18px 24px", border, fontSize: 32, fontWeight: 700, whiteSpace: "nowrap" }}>{text}</div>
      {tick ? <Icon name="done" size={50} stroke={2.4} style={{ color: color.accent }} /> : null}
    </div>
  );
}

/** The part of `text` typed by `now`, when it is typed evenly over [from, to] (seconds). */
export function typedOver(text: string, now: number, [from, to]: readonly [number, number]) {
  const chars = [...text];
  return chars.slice(0, Math.max(0, Math.min(chars.length, Math.ceil(((now - from) / Math.max(0.1, to - from)) * chars.length)))).join("");
}

/** The card an agent hands back: an issue or a pull request, by number and name. */
export function Ticket({ icon, number, name, state, style }: { icon: IconName; number: string; name: string; state: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border, padding: "18px 22px", background: color.paper, color: color.ink, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 29, fontWeight: 800, whiteSpace: "nowrap" }}>
        <Icon name={icon} size={38} style={{ color: color.accent }} />
        {name}
        <span style={{ fontFamily: monoFamily, fontWeight: 500, color: color.muted }}>{number}</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, fontSize: 25, fontWeight: 700, color: color.muted }}>
        {state}
      </div>
    </div>
  );
}
