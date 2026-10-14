import type { CSSProperties } from "react";

import { color, ease, sec } from "../theme";
import { progress } from "../../../kit/motion";

/**
 * A small robot with a hammer, working on the logo that's still being designed. `hits` are the
 * frames (shot-local) its hammer lands; between hits it winds up and swings down, accelerating,
 * and each landing throws a few sparks and a little hop. Pure function of the frame.
 */
export function Robot({ f, hits, x, y, flip = false, appear, size = 1, style }: { f: number; hits: number[]; x: number; y: number; flip?: boolean; appear: number; size?: number; style?: CSSProperties }) {
  if (f < appear) return null;
  const pop = progress(f, appear, 8, ease.spring);
  // Phase within the current swing: 0 just after a hit, 1 at the next one.
  const prev = [...hits].reverse().find((h) => h <= f);
  const next = hits.find((h) => h > f);
  const period = next !== undefined && prev !== undefined ? next - prev : sec(0.5);
  const p = prev === undefined ? (next === undefined ? 1 : 1 - Math.min(1, (next - f) / period)) : next === undefined ? 1 : (f - prev) / period;
  // Wind up fast after a hit, then come down accelerating.
  const angle = p < 0.3 ? 10 - 90 * (p / 0.3) : -80 + 90 * ((p - 0.3) / 0.7) ** 2.2;
  const since = prev === undefined ? 99 : f - prev;
  const hop = since < 4 ? [0, -6, -3, -1][since]! : 0;
  const spark = since < 5 ? 1 - since / 5 : 0;
  const ink = color.ink;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 110,
        height: 130,
        transform: `scale(${(flip ? -1 : 1) * size * pop}, ${size * pop}) translateY(${hop}px)`,
        transformOrigin: "50% 100%",
        ...style,
      }}
    >
      <svg width={110} height={130} viewBox="0 0 110 130" style={{ overflow: "visible" }}>
        {/* antenna */}
        <line x1={40} y1={10} x2={40} y2={24} stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <circle cx={40} cy={8} r={6} fill={since < 3 ? color.signal : color.accent} />
        {/* head */}
        <rect x={14} y={24} width={52} height={40} rx={10} fill={color.paper} stroke={ink} strokeWidth={4} />
        <circle cx={31} cy={44} r={5} fill={ink} />
        <circle cx={50} cy={44} r={5} fill={ink} />
        <path d="M32 55 Q40 59 48 55" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />
        {/* body */}
        <rect x={20} y={68} width={40} height={36} rx={8} fill={color.paper} stroke={ink} strokeWidth={4} />
        <rect x={32} y={78} width={16} height={8} rx={3} fill={color.accent} />
        {/* legs */}
        <line x1={30} y1={104} x2={30} y2={122} stroke={ink} strokeWidth={5} strokeLinecap="round" />
        <line x1={50} y1={104} x2={50} y2={122} stroke={ink} strokeWidth={5} strokeLinecap="round" />
        {/* the hammer arm, from the shoulder */}
        <g transform={`rotate(${angle} 60 76)`}>
          <line x1={60} y1={76} x2={92} y2={76} stroke={ink} strokeWidth={5} strokeLinecap="round" />
          <rect x={88} y={64} width={14} height={26} rx={3} fill={ink} />
        </g>
        {/* sparks where the hammer lands */}
        <g opacity={spark} stroke={color.signal} strokeWidth={4} strokeLinecap="round">
          <line x1={100} y1={84} x2={110} y2={78} />
          <line x1={100} y1={92} x2={112} y2={94} />
          <line x1={94} y1={98} x2={100} y2={108} />
        </g>
      </svg>
    </div>
  );
}
