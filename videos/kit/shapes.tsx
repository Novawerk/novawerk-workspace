import type { CSSProperties } from "react";

import { color, ease } from "./theme";
import { progress } from "./motion";

// Shot 5's party: abstract covers for the two launched projects and a burst of shapes when their
// cards land. Illustrations, not screenshots — neither project has a cover on the site yet.

export const fun = {
  rose: "#ef6f8e",
  blush: "#fbd9e1",
  lilac: "#b9a6f2",
  chili: "#e0492f",
  mustard: "#f3b23c",
  cream: "#fff1d2",
  sky: "#2a5dc8", // --color-blue in the VI guide
  jade: color.accent,
} as const;

type Kind = "circle" | "square" | "triangle" | "ring" | "half" | "pill";

export function Shape({ kind, size, fill, style }: { kind: Kind; size: number; fill: string; style?: CSSProperties }) {
  const base: CSSProperties = { position: "absolute", width: size, height: size, ...style };
  switch (kind) {
    case "circle":
      return <div style={{ ...base, borderRadius: "50%", background: fill }} />;
    case "square":
      return <div style={{ ...base, background: fill }} />;
    case "ring":
      return <div style={{ ...base, borderRadius: "50%", border: `${size * 0.22}px solid ${fill}`, boxSizing: "border-box" }} />;
    case "half":
      return <div style={{ ...base, height: size / 2, borderRadius: `${size}px ${size}px 0 0`, background: fill }} />;
    case "pill":
      return <div style={{ ...base, height: size * 0.4, borderRadius: size, background: fill }} />;
    case "triangle":
      return (
        <svg viewBox="0 0 100 100" style={base}>
          <path d="M50 6 L96 92 L4 92 Z" fill={fill} />
        </svg>
      );
  }
}

/** Shapes that fly out from a card's centre when it lands to its corners and edges, then drift. */
const BURSTS: { kind: Kind; dx: number; dy: number; size: number; fill: string; spin: number }[][] = [
  [
    { kind: "circle", dx: -225, dy: -280, size: 72, fill: fun.rose, spin: 0 },
    { kind: "ring", dx: 205, dy: -290, size: 78, fill: fun.lilac, spin: 0 },
    { kind: "half", dx: -250, dy: -40, size: 92, fill: fun.sky, spin: 1.2 },
    { kind: "triangle", dx: -170, dy: 300, size: 64, fill: fun.mustard, spin: 2 },
    { kind: "pill", dx: 110, dy: 300, size: 100, fill: fun.rose, spin: -1.5 },
  ],
  [
    { kind: "square", dx: 225, dy: -275, size: 60, fill: fun.mustard, spin: 1.5 },
    { kind: "circle", dx: -150, dy: -300, size: 48, fill: fun.chili, spin: 0 },
    { kind: "triangle", dx: 245, dy: -40, size: 84, fill: fun.jade, spin: -2 },
    { kind: "ring", dx: 170, dy: 300, size: 66, fill: fun.chili, spin: 0 },
    { kind: "half", dx: -200, dy: 310, size: 84, fill: fun.lilac, spin: 1 },
  ],
];

export function Burst({ f, at, which, cx, cy }: { f: number; at: number; which: 0 | 1; cx: number; cy: number }) {
  if (f < at) return null;
  const d = progress(f, at, 10, ease.spring);
  const t = f - at;
  return (
    <>
      {BURSTS[which]!.map((s, i) => {
        const drift = Math.sin((t + i * 11) / 14) * 8;
        return (
          <Shape
            key={i}
            kind={s.kind}
            size={s.size}
            fill={s.fill}
            style={{
              left: cx + s.dx * d - s.size / 2,
              top: cy + s.dy * d - s.size / 2 + drift,
              transform: `rotate(${s.spin * t * 2}deg) scale(${Math.min(1, d * 1.2)})`,
              opacity: Math.min(1, d * 2),
            }}
          />
        );
      })}
    </>
  );
}

/** YIMA: a calendar month, five days blooming in a row, a crescent moon. */
export function YimaCover({ f, at }: { f: number; at: number }) {
  const cols = 7, rows = 4, cell = 40, gap = 10;
  const left = (450 - (cols * cell + (cols - 1) * gap)) / 2;
  const top = 50;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: fun.blush, overflow: "hidden" }}>
      <Shape kind="circle" size={70} fill={fun.lilac} style={{ right: 26, top: -18 }} />
      <Shape kind="circle" size={70} fill={fun.blush} style={{ right: 8, top: -30 }} />
      {Array.from({ length: cols * rows }, (_, i) => {
        const x = left + (i % cols) * (cell + gap);
        const y = top + Math.floor(i / cols) * (cell + gap);
        const period = i >= 10 && i <= 14;
        const p = period ? progress(f, at + 6 + (i - 10) * 2, 6, ease.spring) : 0;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: cell, height: cell, background: color.paper }}>
            {period ? <div style={{ position: "absolute", inset: 5, borderRadius: "50%", background: fun.rose, transform: `scale(${p})` }} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Berlin Chinese Food Map: streets, the Spree, three pins dropping in, a bowl. */
export function FoodMapCover({ f, at }: { f: number; at: number }) {
  const pins = [
    { x: 120, y: 150, fill: fun.chili },
    { x: 250, y: 90, fill: fun.jade },
    { x: 330, y: 175, fill: fun.mustard },
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: fun.cream, overflow: "hidden" }}>
      <svg viewBox="0 0 450 281" style={{ position: "absolute", inset: 0 }}>
        <path d="M-10 60 L460 110" stroke={color.paper} strokeWidth={16} />
        <path d="M80 -10 L180 300" stroke={color.paper} strokeWidth={16} />
        <path d="M300 -10 L280 300" stroke={color.paper} strokeWidth={12} />
        <path d="M-10 230 C 90 180, 170 260, 260 215 S 400 170, 470 205" stroke={fun.sky} strokeWidth={18} fill="none" />
      </svg>
      {pins.map((p, i) => {
        const d = progress(f, at + 6 + i * 3, 7, ease.spring);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x - 20,
              top: p.y - 46 - (1 - d) * 120,
              width: 40,
              height: 40,
              borderRadius: "50% 50% 50% 0",
              background: p.fill,
              transform: "rotate(-45deg)",
              opacity: d > 0 ? 1 : 0,
              boxShadow: `inset 0 0 0 11px ${p.fill}, inset 0 0 0 20px ${color.paper}`,
            }}
          />
        );
      })}
      <Shape kind="half" size={70} fill={fun.chili} style={{ left: 22, top: 22, transform: "rotate(180deg)" }} />
    </div>
  );
}
