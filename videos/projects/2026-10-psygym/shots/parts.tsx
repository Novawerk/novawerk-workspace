import type { CSSProperties, ReactNode } from "react";

import { Rich } from "../../../kit/brand";
import { progress } from "../../../kit/motion";
import { ease } from "../theme";

/** A caption block: each line rises in 3 frames after the last; **word** in `accent`. */
export function Lines({ f, at, lines, accent, size = 104, style }: { f: number; at: number; lines: readonly string[]; accent: string; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: size, fontWeight: 900, lineHeight: 1.16, letterSpacing: -2, ...style }}>
      {lines.map((line, k) => {
        const p = progress(f, at + k * 3, 7, ease.spring);
        return (
          <div key={line} style={{ opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 24}px)` }}>
            <Rich text={line} accent={accent} />
          </div>
        );
      })}
    </div>
  );
}

/** A rubber stamp: double border, tilted, slams in from big. */
export function Stamp({ f, at, children, colour, style }: { f: number; at: number; children: ReactNode; colour: string; style?: CSSProperties }) {
  if (f < at) return null;
  const p = progress(f, at, 6, ease.spring);
  return (
    <div
      style={{
        position: "absolute",
        border: `5px solid ${colour}`,
        outline: `2px solid ${colour}`,
        outlineOffset: 5,
        color: colour,
        padding: "10px 22px",
        fontWeight: 900,
        transform: `rotate(-8deg) scale(${1.8 - 0.8 * p})`,
        opacity: Math.min(1, p * 1.4),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
