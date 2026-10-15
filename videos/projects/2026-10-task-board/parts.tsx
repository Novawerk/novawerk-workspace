import type { CSSProperties } from "react";

import { monoFamily } from "../../kit/fonts";
import { color } from "./theme";

// Pieces the hook and the cover share: the member application, the 已关闭 stamp, a task note.

/** A rubber stamp: heavy ink border, worn by a noise mask so it reads as stamped, not typed. */
export function Stamp({ big, small, size, ink = color.ink, style }: { big: string; small: string; size: number; ink?: string; style?: CSSProperties }) {
  const id = `wear-${size}`;
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves={2} seed={7} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.55" result="m" />
          <feComposite in="SourceGraphic" in2="m" operator="in" />
        </filter>
      </svg>
      <div
        style={{
          filter: `url(#${id})`,
          border: `${Math.round(size * 0.09)}px solid ${ink}`,
          outline: `${Math.round(size * 0.035)}px solid ${ink}`,
          outlineOffset: Math.round(size * 0.05),
          color: ink,
          padding: `${size * 0.06}px ${size * 0.22}px ${size * 0.1}px`,
          textAlign: "center",
          lineHeight: 1,
        }}
      >
        <div style={{ fontSize: size, fontWeight: 900, letterSpacing: size * 0.08, whiteSpace: "nowrap" }}>{big}</div>
        <div style={{ fontFamily: monoFamily, fontSize: size * 0.3, fontWeight: 700, letterSpacing: size * 0.12, marginTop: size * 0.08, whiteSpace: "nowrap" }}>{small}</div>
      </div>
    </div>
  );
}

/** The member application, translated and pared down: a huge 成员申请, empty fields, an ink button. */
export function MemberForm({ title, width, height, style }: { title: string; width: number; height: number; style?: CSSProperties }) {
  const u = width / 960;
  return (
    <div style={{ width, height, background: color.paper, border: `${7 * u}px solid ${color.ink}`, padding: `${70 * u}px ${70 * u}px`, color: color.ink, display: "flex", flexDirection: "column", gap: 40 * u, ...style }}>
      <div style={{ fontSize: 210 * u, fontWeight: 900, letterSpacing: -6 * u, lineHeight: 1, whiteSpace: "nowrap" }}>{title}</div>
      {[0, 1, 2].map((k) => (
        <div key={k} style={{ display: "grid", gap: 14 * u }}>
          <div style={{ width: (180 + k * 60) * u, height: 22 * u, background: color.line }} />
          <div style={{ height: 96 * u, border: `${4 * u}px solid ${color.lineStrong}` }} />
        </div>
      ))}
      <div style={{ marginTop: "auto", height: 120 * u, background: color.ink }} />
    </div>
  );
}

/** A task from the board: id, the full title, size. */
export function TaskNote({ row, width, style }: { row: readonly [string, string, string]; width: number; style?: CSSProperties }) {
  const [id, name, size] = row;
  return (
    <div style={{ width, display: "flex", alignItems: "center", gap: 20, background: color.paper, color: color.ink, border: `4px solid ${color.ink}`, padding: "16px 22px", ...style }}>
      <span style={{ fontFamily: monoFamily, fontSize: 28, color: color.muted, flex: "none" }}>{id}</span>
      <span style={{ fontSize: 32, fontWeight: 800, flex: 1, lineHeight: 1.2 }}>{name}</span>
      <span style={{ fontFamily: monoFamily, fontSize: 28, fontWeight: 700, background: color.ink, color: color.paper, padding: "2px 10px", flex: "none" }}>{size}</span>
    </div>
  );
}
