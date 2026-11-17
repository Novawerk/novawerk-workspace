import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

import { NovaStar, Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { copies } from "../copy";
import { NARRATION, shown } from "../narration";
import type { Lang } from "../narration";
import { FPS, TIMELINES, color, ease } from "../theme";

// What every shot of this film shares: which language it is in, the frame (series label, headline,
// subtitles, the voice), a drawn GitHub window, a chat with a coding agent, a cursor, a few icons.
// GitHub's screens and the agent are drawn in our own style (BRIEF.md); both say "示意".

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const SOFT = "#e7f3ec"; // brand green at ~10 % on white: a changed line, a picked option
const VO_GAIN = 1.1; // the clips come at about -17 LUFS (scripts/tts.py)
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

export function Shell({ shot, dark = false, title, titleAt = 6, subtitles = true, children }: { shot: string; dark?: boolean; title?: readonly string[]; titleAt?: number; /** Off when the picture already shows the words being said. */ subtitles?: boolean; children: ReactNode }) {
  const { f, c, lang } = useShot(shot);
  return (
    <Stage bg={dark ? color.ink : color.paper} fg={dark ? color.paper : color.ink}>
      <div style={{ position: "absolute", left: 64, top: 50, display: "flex", alignItems: "center", gap: 14 }}>
        <NovaStar size={34} tone={dark ? "dark" : "brand"} />
        <span style={{ fontFamily: monoFamily, fontSize: 24, fontWeight: 600, letterSpacing: 3, color: dark ? color.lineStrong : color.muted }}>{c.series}</span>
      </div>
      {title ? (
        <div style={{ position: "absolute", left: 64, top: 108, fontSize: lang === "en" ? 78 : 84, fontWeight: 900, lineHeight: 1.16, letterSpacing: -2, whiteSpace: "nowrap" }}>
          {title.map((line, i) => (
            <div key={line} style={settle(fade(f, titleAt + i * 3, 7), 16)}>
              <Rich text={line} accent={dark ? color.signal : color.accent} />
            </div>
          ))}
        </div>
      ) : null}
      {children}
      {subtitles ? <Subtitles shot={shot} dark={dark} /> : null}
      <Sequence from={Math.round((TIMELINES[lang]!.CLIPS[shot]! - TIMELINES[lang]!.SHOTS[shot]!.start) * FPS)} layout="none">
        <Audio src={staticFile(`vo/${lang}/${shot}.mp3`)} volume={VO_GAIN} />
      </Sequence>
    </Stage>
  );
}

/** The line being spoken, at the bottom; the words not said yet are grey. */
function Subtitles({ shot, dark }: { shot: string; dark: boolean }) {
  const { f, now, t, lang, at } = useShot(shot);
  const v = t.voice[shot]!;
  const clip = t.CLIPS[shot]!;
  const lines = NARRATION[lang].find((s) => s.id === shot)!.lines.map((line, i) => ({
    from: clip + v.t[i]![0]!,
    to: clip + v.end[i]!,
    phrases: line.map((p, j) => ({ text: shown(p), at: clip + v.t[i]![j]! })),
  }));
  const line = [...lines].reverse().find((l) => now >= l.from - 0.12);
  if (!line || now > line.to + 0.8) return null;
  return (
    <div style={{ position: "absolute", left: 48, right: 48, bottom: 76, textAlign: "center", textWrap: "balance", fontSize: lang === "en" ? 38 : 40, fontWeight: 700, lineHeight: 1.3, opacity: fade(f, at(line.from - 0.12), 5) }}>
      {line.phrases.map((ph) => (
        <span key={ph.text} style={{ color: now >= ph.at - 0.05 ? (dark ? color.paper : color.ink) : dark ? color.muted : color.lineStrong }}>
          {ph.text}
        </span>
      ))}
    </div>
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
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  cross: <path d="M6 6l12 12M18 6 6 18" />,
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
  pointer: <path d="M5 3l13 8.5-5.6 1.3L15.5 19l-2.6 1.2-3-6.2L6 17.5z" />,
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  // the agent: a spark, not anyone's logo
  agent: <path d="M12 3l2 6.5 6.5 2.5-6.5 2.5-2 6.5-2-6.5L3.5 12 10 9.5z" />,
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

/** A window with a title bar: three dots, a name, "示意". */
export function Frame({ name, mono = true, style, children }: { name: ReactNode; mono?: boolean; style?: CSSProperties; children: ReactNode }) {
  const lang = useContext(FilmLang);
  return (
    <div style={{ position: "absolute", left: 64, width: 952, background: color.paper, border, overflow: "hidden", ...style }}>
      <div style={{ height: 60, borderBottom: border, display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: 8, border: `2.5px solid ${color.ink}` }} />
        ))}
        <span style={{ marginLeft: 14, display: "flex", alignItems: "center", gap: 10, fontFamily: mono ? monoFamily : undefined, fontSize: mono ? 25 : 27, fontWeight: mono ? 600 : 800 }}>{name}</span>
        <span style={{ marginLeft: "auto", fontSize: 22, fontWeight: 700, color: color.muted }}>{copies[lang].demo}</span>
      </div>
      {children}
    </div>
  );
}

export function Window({ tab, style, children }: { tab?: number; style?: CSSProperties; children: ReactNode }) {
  const c = copies[useContext(FilmLang)];
  return (
    <Frame name={c.repo} style={style}>
      {tab === undefined ? null : (
        <div style={{ height: 62, borderBottom: `2px solid ${color.line}`, display: "flex", gap: 40, padding: "0 28px", fontSize: 27, fontWeight: 600 }}>
          {c.tabs.map((name, i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", color: i === tab ? color.ink : color.muted, borderBottom: `5px solid ${i === tab ? color.accent : "transparent"}`, marginBottom: -2 }}>
              {name}
            </div>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>{children}</div>
    </Frame>
  );
}

export function Btn({ children, primary = false, hot = false, style }: { children: ReactNode; primary?: boolean; hot?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 22px", fontSize: 27, fontWeight: 700, whiteSpace: "nowrap", border, background: primary ? color.accent : color.paper, color: primary ? color.paper : color.ink, boxShadow: hot ? `0 0 0 7px ${SOFT}, 0 0 0 10px ${color.accent}` : undefined, ...style }}>
      {children}
    </div>
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

/** A state pill: Open is green outline, Closed / Merged are ink. */
export function Pill({ icon, children, solid = false, small = false }: { icon: IconName; children: ReactNode; solid?: boolean; small?: boolean }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: small ? 8 : 10, padding: small ? "5px 14px 5px 10px" : "8px 20px 8px 14px", borderRadius: 30, fontSize: small ? 23 : 27, fontWeight: 800, whiteSpace: "nowrap", border: `3px solid ${solid ? color.ink : color.accent}`, background: solid ? color.ink : color.paper, color: solid ? color.paper : color.accent }}>
      <Icon name={icon} size={small ? 26 : 32} stroke={2.4} />
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

/** The first characters of `text`, typed from frame `at`. */
export function typed(text: string, f: number, at: number, perSecond = 15) {
  return [...text].slice(0, Math.max(0, Math.floor(((f - at) / FPS) * perSecond))).join("");
}
/** The part of `text` typed by `now`, when it is typed evenly over [from, to] (seconds). */
export function typedOver(text: string, now: number, [from, to]: readonly [number, number]) {
  const chars = [...text];
  return chars.slice(0, Math.max(0, Math.min(chars.length, Math.ceil(((now - from) / Math.max(0.1, to - from)) * chars.length)))).join("");
}

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
  const x = path.length > 1 ? interpolate(f, frames, path.map((k) => k[1]), { ...clamp, easing: ease.ui }) : first[1];
  const y = path.length > 1 ? interpolate(f, frames, path.map((k) => k[2]), { ...clamp, easing: ease.ui }) : first[2];
  const click = clicks.find((c) => f >= c && f < c + 12);
  const k = click === undefined ? 0 : (f - click) / 12;
  const dip = click !== undefined && f - click < 4 ? 0.82 : 1;
  const opacity = Math.min(fade(f, first[0] - 4, 4), 1 - fade(f, last[0] + 8, 6));
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}>
      {click === undefined ? null : <div style={{ position: "absolute", left: -40 * k - 8, top: -40 * k - 8, width: 80 * k + 16, height: 80 * k + 16, borderRadius: 60, border: `4px solid ${color.accent}`, opacity: 1 - k }} />}
      {/* the dip is a smaller box, not a transform */}
      <svg viewBox="0 0 24 24" width={54 * dip} height={54 * dip} style={{ display: "block" }}>
        <path d="M4 2l15 9.5-6.6 1.4L16 20l-3 1.4-3.5-7L5 18.5z" fill={color.ink} stroke={color.paper} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// --- a chat with a coding agent --------------------------------------------------------------------

/** The agent's window. Not any product: a spark, a name, the repository it is working in, a thread, an input. */
export function AgentPanel({ style, children, input, repo = true }: { style?: CSSProperties; children: ReactNode; input: ReactNode; repo?: boolean }) {
  const c = copies[useContext(FilmLang)];
  return (
    <Frame
      mono={false}
      name={
        <>
          <Icon name="agent" size={30} stroke={2.4} style={{ color: color.accent }} />
          {c.agent.panel}
          {repo ? <span style={{ marginLeft: 8, padding: "2px 12px", border: `2.5px solid ${color.ink}`, fontFamily: monoFamily, fontSize: 22, fontWeight: 600 }}>{c.repo}</span> : null}
        </>
      }
      style={style}
    >
      <div style={{ position: "relative", height: "calc(100% - 63px)" }}>
        {children}
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, minHeight: 84, border, display: "flex", alignItems: "center", gap: 16, padding: "14px 16px 14px 22px" }}>
          <div style={{ flex: 1, fontSize: 31, fontWeight: 600, lineHeight: 1.4 }}>{input}</div>
          <div style={{ width: 54, height: 54, flexShrink: 0, alignSelf: "flex-end", background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="send" size={32} stroke={2.6} />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** What you said: ink, on the right. */
export function Said({ f, at, top, children }: { f: number; at: number; top: number; children: ReactNode }) {
  if (f < at) return null;
  return (
    <div style={{ position: "absolute", right: 24, top, maxWidth: 780, padding: "20px 26px", background: color.ink, color: color.paper, fontSize: 31, fontWeight: 600, lineHeight: 1.45, ...settle(fade(f, at, 6), 26) }}>
      {children}
    </div>
  );
}

/** What the agent answers: white, on the left, with its spark. */
export function Answer({ f, at, top, children }: { f: number; at: number; top: number; children: ReactNode }) {
  if (f < at) return null;
  return (
    <div style={{ position: "absolute", left: 24, top, display: "flex", gap: 16, alignItems: "flex-start", ...settle(fade(f, at, 6), 26) }}>
      <div style={{ width: 56, height: 56, flexShrink: 0, border, display: "flex", alignItems: "center", justifyContent: "center", color: color.accent }}>
        <Icon name="agent" size={34} stroke={2.4} />
      </div>
      <div style={{ maxWidth: 800, fontSize: 31, fontWeight: 600, lineHeight: 1.45 }}>{children}</div>
    </div>
  );
}

/** The agent is working: three dots, between your message and its answer. */
export function Working({ f, from, to, top }: { f: number; from: number; to: number; top: number }) {
  if (f < from || f >= to) return null;
  return (
    <div style={{ position: "absolute", left: 24, top, display: "flex", gap: 10, alignItems: "center", height: 56 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 14, height: 14, borderRadius: 7, background: (Math.floor((f - from) / 5) + 3 - i) % 3 === 0 ? color.accent : color.lineStrong }} />
      ))}
    </div>
  );
}

/** The card an agent hands back: an issue or a pull request, by number and name. */
export function Ticket({ icon, number, name, state, extra }: { icon: IconName; number: string; name: string; state: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ marginTop: 14, width: 800, border, padding: "18px 22px", background: color.paper }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 31, fontWeight: 800, whiteSpace: "nowrap" }}>
        <Icon name={icon} size={38} style={{ color: color.accent }} />
        {name}
        <span style={{ fontFamily: monoFamily, fontWeight: 500, color: color.muted }}>{number}</span>
      </div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14, fontSize: 25, fontWeight: 700, color: color.muted }}>
        {state}
        {extra}
      </div>
    </div>
  );
}
