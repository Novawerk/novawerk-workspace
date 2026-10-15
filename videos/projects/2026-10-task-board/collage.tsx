import type { CSSProperties, ReactNode } from "react";

import { monoFamily } from "../../kit/fonts";
import { progress } from "../../kit/motion";
import { color, ease } from "./theme";

// The Memphis collage (2026-10-15, after the poster reference the founder sent): the frame tiled into
// outlined panels, each with its own fill (checker, stripes, dots, halftone, waves, grid), saturated
// colours, big titles in boxes with hard shadows, and stickers from our world — a laptop, a keyboard,
// a PR card, bricks, a little builder, the Novawerk star. Green stays the keyword colour.

export const C = {
  ink: color.ink,
  paper: color.paper,
  pink: "#ff4fa0",
  yellow: "#ffd23f",
  blue: "#2f6bff",
  cyan: "#18c6d8",
  purple: "#7d4dff",
  orange: "#ff7a1f",
  lime: "#b5e61d",
  green: color.accent,
  signal: color.signal,
  deep: color.accentDeep,
  skin: "#ffd9b8",
} as const;

export const OUT = 7; // outline width

export type Fill =
  | { kind: "solid"; a: string }
  | { kind: "checker" | "stripes" | "dots" | "halftone" | "waves" | "grid"; a: string; b: string; size?: number };

function patternBody(id: string, f: Fill) {
  if (f.kind === "solid") return null;
  const s = f.size ?? 40;
  switch (f.kind) {
    case "checker":
      return (
        <pattern id={id} width={s * 2} height={s * 2} patternUnits="userSpaceOnUse">
          <rect width={s * 2} height={s * 2} fill={f.b} />
          <rect width={s} height={s} fill={f.a} />
          <rect x={s} y={s} width={s} height={s} fill={f.a} />
        </pattern>
      );
    case "stripes":
      return (
        <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={s} height={s} fill={f.b} />
          <rect width={s / 2} height={s} fill={f.a} />
        </pattern>
      );
    case "dots":
      return (
        <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
          <rect width={s} height={s} fill={f.b} />
          <circle cx={s / 2} cy={s / 2} r={s / 5} fill={f.a} />
        </pattern>
      );
    case "halftone":
      return (
        <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width={s} height={s} fill={f.b} />
          <circle cx={s / 2} cy={s / 2} r={s / 2.6} fill={f.a} />
          <circle cx={0} cy={0} r={s / 6} fill={f.a} />
          <circle cx={s} cy={0} r={s / 6} fill={f.a} />
          <circle cx={0} cy={s} r={s / 6} fill={f.a} />
          <circle cx={s} cy={s} r={s / 6} fill={f.a} />
        </pattern>
      );
    case "waves":
      return (
        <pattern id={id} width={s * 2} height={s} patternUnits="userSpaceOnUse">
          <rect width={s * 2} height={s} fill={f.b} />
          <path d={`M 0 ${s / 2} q ${s / 2} ${-s / 2.5} ${s} 0 t ${s} 0`} fill="none" stroke={f.a} strokeWidth={s / 5} />
        </pattern>
      );
    case "grid":
      return (
        <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
          <rect width={s} height={s} fill={f.b} />
          <path d={`M ${s} 0 L 0 0 0 ${s}`} fill="none" stroke={f.a} strokeWidth={4} />
        </pattern>
      );
  }
}

export interface PanelSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: Fill;
}

/** One outlined panel of the collage. */
export function Panel({ p, id, style }: { p: PanelSpec; id: string; style?: CSSProperties }) {
  const pid = `pat-${id}`;
  const fill = p.fill.kind === "solid" ? p.fill.a : `url(#${pid})`;
  return (
    <svg width={p.w} height={p.h} style={{ position: "absolute", left: p.x, top: p.y, overflow: "visible", ...style }}>
      <defs>{patternBody(pid, p.fill)}</defs>
      <rect x={OUT / 2} y={OUT / 2} width={p.w - OUT} height={p.h - OUT} fill={fill} stroke={C.ink} strokeWidth={OUT} />
    </svg>
  );
}

/** A grid of panels that pops in from the centre outwards over `spread` frames from `at`. */
export function Mosaic({ panels, f, at = 0, spread = 8, seed }: { panels: readonly PanelSpec[]; f: number; at?: number; spread?: number; seed: string }) {
  return (
    <>
      {panels.map((p, i) => {
        const d = Math.hypot(p.x + p.w / 2 - 540, p.y + p.h / 2 - 720) / 900;
        const k = progress(f, at + d * spread, 6, ease.spring);
        if (k <= 0) return null;
        return <Panel key={i} id={`${seed}${i}`} p={p} style={{ transform: `scale(${k})`, transformOrigin: "50% 50%" }} />;
      })}
    </>
  );
}

/** A big title in a box: thick outline, hard offset shadow. */
export function Banner({ children, bg, fg = C.ink, size, shadow = C.ink, rot = 0, pad = [18, 34], style }: { children: ReactNode; bg: string; fg?: string; size: number; shadow?: string; rot?: number; pad?: [number, number]; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-block",
        background: bg,
        color: fg,
        border: `${OUT + 1}px solid ${C.ink}`,
        boxShadow: `14px 14px 0 ${shadow}`,
        padding: `${pad[0]}px ${pad[1]}px`,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.12,
        letterSpacing: -size * 0.02,
        whiteSpace: "nowrap",
        transform: `rotate(${rot}deg)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A small sticker label (a tag with a hole). */
export function Tag({ text, bg, fg = C.ink, size = 40, rot = 0, style }: { text: string; bg: string; fg?: string; size?: number; rot?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", display: "flex", alignItems: "center", gap: size * 0.35, background: bg, color: fg, border: `${OUT - 1}px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.ink}`, padding: `${size * 0.2}px ${size * 0.5}px`, fontSize: size, fontWeight: 900, whiteSpace: "nowrap", transform: `rotate(${rot}deg)`, ...style }}>
      <span style={{ width: size * 0.32, height: size * 0.32, borderRadius: "50%", border: `5px solid ${C.ink}`, background: C.paper, flex: "none" }} />
      {text}
    </div>
  );
}

/** A round badge with a word in it. */
export function Badge({ text, bg, fg = C.ink, d = 170, rot = 0, style }: { text: string; bg: string; fg?: string; d?: number; rot?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", width: d, height: d, borderRadius: "50%", background: bg, color: fg, border: `${OUT}px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.ink}`, display: "grid", placeItems: "center", fontSize: d * 0.27, fontWeight: 900, transform: `rotate(${rot}deg)`, ...style }}>
      <div style={{ position: "absolute", inset: 10, borderRadius: "50%", border: `4px dashed ${C.ink}` }} />
      {text}
    </div>
  );
}

const svgAbs = (w: number, h: number, style?: CSSProperties): CSSProperties => ({ position: "absolute", width: w, height: h, overflow: "visible", ...style });

/** A laptop with code on the screen. */
export function Laptop({ w = 300, screen = C.blue, style }: { w?: number; screen?: string; style?: CSSProperties }) {
  const lines = [[20, 120, C.yellow], [40, 90, C.pink], [40, 140, C.lime], [20, 70, C.cyan], [60, 110, C.paper]] as const;
  return (
    <svg viewBox="0 0 300 220" style={svgAbs(w, (w * 220) / 300, style)}>
      <rect x={40} y={10} width={220} height={150} rx={10} fill={C.ink} stroke={C.ink} strokeWidth={OUT} />
      <rect x={54} y={24} width={192} height={122} fill={screen} />
      {lines.map(([x, len, c], i) => (
        <rect key={i} x={54 + x} y={36 + i * 21} width={len} height={10} fill={c} />
      ))}
      <path d="M 10 175 L 40 160 L 260 160 L 290 175 L 290 190 L 10 190 Z" fill={C.paper} stroke={C.ink} strokeWidth={OUT} strokeLinejoin="round" />
      <rect x={120} y={166} width={60} height={8} fill={C.ink} />
    </svg>
  );
}

/** A keyboard, a few keys in colour. */
export function Keyboard({ w = 520, style }: { w?: number; style?: CSSProperties }) {
  const keys = [];
  const colours = [C.pink, C.yellow, C.cyan, C.lime, C.orange];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 12; c++) {
      const coloured = (r * 7 + c * 3) % 9 === 0;
      keys.push(<rect key={`${r}.${c}`} x={22 + c * 39 + (r % 2) * 10} y={22 + r * 32} width={32} height={25} rx={4} fill={coloured ? colours[(r + c) % 5] : C.paper} stroke={C.ink} strokeWidth={4} />);
    }
  return (
    <svg viewBox="0 0 520 170" style={svgAbs(w, (w * 170) / 520, style)}>
      <rect x={4} y={4} width={512} height={162} rx={14} fill={C.purple} stroke={C.ink} strokeWidth={OUT} />
      {keys}
      <rect x={150} y={150} width={220} height={0} />
    </svg>
  );
}

/** The four-point Novawerk star. */
export function Star({ d = 160, fill = C.signal, core = C.deep, style }: { d?: number; fill?: string; core?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="-50 -50 100 100" style={svgAbs(d, d, style)}>
      <path d="M 0 -46 C 6 -10 10 -6 46 0 C 10 6 6 10 0 46 C -6 10 -10 6 -46 0 C -10 -6 -6 -10 0 -46 Z" fill={fill} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <circle r={8} fill={core} stroke={C.ink} strokeWidth={3} />
    </svg>
  );
}

/** A little builder in a hard hat, carrying a brick. */
export function Builder({ h = 260, body = C.blue, hat = C.yellow, brick = C.orange, style }: { h?: number; body?: string; hat?: string; brick?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 160 260" style={svgAbs((h * 160) / 260, h, style)}>
      <rect x={52} y={190} width={20} height={56} fill={C.ink} />
      <rect x={88} y={190} width={20} height={56} fill={C.ink} />
      <rect x={34} y={104} width={92} height={98} rx={18} fill={body} stroke={C.ink} strokeWidth={OUT} />
      <circle cx={80} cy={70} r={38} fill={C.skin} stroke={C.ink} strokeWidth={OUT} />
      <circle cx={68} cy={70} r={5} fill={C.ink} />
      <circle cx={92} cy={70} r={5} fill={C.ink} />
      <path d="M 68 86 q 12 10 24 0" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      <path d="M 38 58 a 42 34 0 0 1 84 0 Z" fill={hat} stroke={C.ink} strokeWidth={OUT} />
      <rect x={30} y={54} width={100} height={12} rx={6} fill={hat} stroke={C.ink} strokeWidth={5} />
      <rect x={6} y={130} width={60} height={40} fill={brick} stroke={C.ink} strokeWidth={OUT} />
      <line x1={6} y1={150} x2={66} y2={150} stroke={C.ink} strokeWidth={4} />
      <line x1={36} y1={130} x2={36} y2={150} stroke={C.ink} strokeWidth={4} />
    </svg>
  );
}

/** A stack of bricks. */
export function Bricks({ w = 220, colours = [C.orange, C.pink, C.yellow, C.cyan, C.lime, C.purple], style }: { w?: number; colours?: readonly string[]; style?: CSSProperties }) {
  const rows = [3, 2, 1];
  const bw = 66;
  const bh = 40;
  return (
    <svg viewBox="0 0 220 140" style={svgAbs(w, (w * 140) / 220, style)}>
      {rows.flatMap((n, r) =>
        Array.from({ length: n }, (_, c) => <rect key={`${r}.${c}`} x={10 + c * bw + r * (bw / 2)} y={96 - r * bh} width={bw} height={bh} fill={colours[(r * 3 + c) % colours.length]} stroke={C.ink} strokeWidth={6} />),
      )}
    </svg>
  );
}

/** A pull request card, the way GitHub draws one, merged. */
export function PrCard({ w = 420, title = "Task: NW-11", style }: { w?: number; title?: string; style?: CSSProperties }) {
  return (
    <div style={{ position: "absolute", width: w, background: C.paper, border: `${OUT}px solid ${C.ink}`, boxShadow: `12px 12px 0 ${C.ink}`, ...style }}>
      <div style={{ background: C.purple, borderBottom: `${OUT}px solid ${C.ink}`, height: 34, display: "flex", gap: 10, alignItems: "center", paddingLeft: 14 }}>
        {[C.pink, C.yellow, C.lime].map((c) => (
          <span key={c} style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: `4px solid ${C.ink}` }} />
        ))}
      </div>
      <div style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
        <div style={{ fontFamily: monoFamily, fontSize: w * 0.075, fontWeight: 700, color: C.ink }}>{title}</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ background: C.purple, color: C.paper, border: `5px solid ${C.ink}`, borderRadius: 999, padding: "2px 16px", fontSize: w * 0.06, fontWeight: 800, fontFamily: monoFamily }}>merged</span>
          <span style={{ flex: 1, height: 12, background: C.lime, border: `4px solid ${C.ink}` }} />
        </div>
      </div>
    </div>
  );
}

/** A sticker pops in at frame `at` with overshoot; a gentle wobble afterwards. */
export function pop(f: number, at: number, rot = 0): CSSProperties {
  const k = progress(f, at, 7, ease.spring);
  return { transform: `rotate(${rot + Math.sin((f - at) / 9) * (k >= 1 ? 1.2 : 0)}deg) scale(${k})`, visibility: k > 0 ? "visible" : "hidden" };
}

/** The stamp red: the loudest colour on screen, used only for 已关闭 and 待你确认. */
export const STAMP_RED = "#f0244e";

/** A solid stamp: thick double rule and the word in strong red on paper, a hard ink shadow. */
export function SolidStamp({ big, small, size, ink = STAMP_RED, bg = C.paper, style }: { big: string; small?: string; size: number; ink?: string; bg?: string; style?: CSSProperties }) {
  return (
    <div style={{ display: "inline-block", background: bg, border: `${Math.round(size * 0.08)}px solid ${ink}`, outline: `${OUT}px solid ${C.ink}`, boxShadow: `16px 16px 0 ${C.ink}`, padding: Math.round(size * 0.05), ...style }}>
      <div style={{ border: `${Math.round(size * 0.035)}px solid ${ink}`, color: ink, padding: `${size * 0.04}px ${size * 0.2}px ${size * 0.08}px`, textAlign: "center", lineHeight: 1 }}>
        <div style={{ fontSize: size, fontWeight: 900, letterSpacing: size * 0.08, whiteSpace: "nowrap" }}>{big}</div>
        {small ? <div style={{ fontFamily: monoFamily, fontSize: size * 0.3, fontWeight: 700, letterSpacing: size * 0.14, marginTop: size * 0.06, whiteSpace: "nowrap" }}>{small}</div> : null}
      </div>
    </div>
  );
}

/** Caption lines in one boxed banner that pops in at `at` seconds (shot time), optionally until `until`. */
export function BoxCaption({
  lines,
  f,
  at,
  until,
  size = 96,
  bg = C.paper,
  fg = C.ink,
  accent = C.green,
  shadow = C.ink,
  rot = -1.5,
  style,
}: {
  lines: readonly string[];
  f: number;
  at: number;
  until?: number;
  size?: number;
  bg?: string;
  fg?: string;
  accent?: string;
  shadow?: string;
  rot?: number;
  style?: CSSProperties;
}) {
  const start = Math.round(at * 30);
  if (f < start || (until !== undefined && f >= Math.round(until * 30))) return null;
  return (
    <div style={{ position: "absolute", ...style, ...pop(f, start, rot) }}>
      <Banner bg={bg} fg={fg} size={size} shadow={shadow} pad={[14, 30]}>
        {lines.map((l) => (
          <div key={l}>
            <RichText text={l} accent={accent} />
          </div>
        ))}
      </Banner>
    </div>
  );
}

function RichText({ text, accent }: { text: string; accent: string }) {
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

/** A small robot sticker (the coding agent): a screen face, antenna, a note in hand. */
export function Bot({ h = 220, body = C.cyan, face = C.ink, eye = C.signal, style }: { h?: number; body?: string; face?: string; eye?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 160 220" style={{ position: "absolute", width: (h * 160) / 220, height: h, overflow: "visible", ...style }}>
      <line x1={80} y1={8} x2={80} y2={34} stroke={C.ink} strokeWidth={6} />
      <circle cx={80} cy={10} r={10} fill={C.pink} stroke={C.ink} strokeWidth={5} />
      <rect x={24} y={34} width={112} height={82} rx={14} fill={body} stroke={C.ink} strokeWidth={OUT} />
      <rect x={40} y={50} width={80} height={50} rx={6} fill={face} />
      <rect x={54} y={64} width={14} height={14} fill={eye} />
      <rect x={92} y={64} width={14} height={14} fill={eye} />
      <rect x={36} y={124} width={88} height={64} rx={10} fill={C.yellow} stroke={C.ink} strokeWidth={OUT} />
      <rect x={50} y={188} width={18} height={26} fill={C.ink} />
      <rect x={92} y={188} width={18} height={26} fill={C.ink} />
      <rect x={118} y={112} width={40} height={50} fill={C.paper} stroke={C.ink} strokeWidth={5} transform="rotate(12 138 137)" />
      <line x1={126} y1={128} x2={150} y2={132} stroke={C.ink} strokeWidth={4} />
      <line x1={124} y1={140} x2={146} y2={144} stroke={C.ink} strokeWidth={4} />
    </svg>
  );
}
