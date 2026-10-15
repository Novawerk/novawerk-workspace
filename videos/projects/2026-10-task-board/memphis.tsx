import type { CSSProperties, ReactNode } from "react";
import { random } from "remotion";

import { C } from "./collage";

// Flat Memphis shapes with thick ink outlines, and the burst of them when the 已关闭 stamp slams.

const INK = C.ink;
const SW = 7; // outline width

export type ShapeKind = "squiggle" | "zigzag" | "triangle" | "dot" | "ring" | "half" | "cross" | "grid" | "stripes" | "pill";

/** One Memphis shape, `size` px across, drawn around its centre. */
export function Shape({ kind, size, fill, ink = INK, style }: { kind: ShapeKind; size: number; fill: string; ink?: string; style?: CSSProperties }) {
  const s = size;
  const h = s / 2;
  let body: ReactNode;
  switch (kind) {
    case "squiggle": {
      let d = `M ${-h} 0`;
      for (let i = 0; i < 4; i++) d += ` q ${s / 8} ${i % 2 ? s / 5 : -s / 5} ${s / 4} 0`;
      body = (
        <>
          <path d={d} fill="none" stroke={ink} strokeWidth={s / 7 + SW} strokeLinecap="round" />
          <path d={d} fill="none" stroke={fill} strokeWidth={s / 7} strokeLinecap="round" />
        </>
      );
      break;
    }
    case "zigzag": {
      let d = `M ${-h} ${s / 10}`;
      for (let i = 0; i < 5; i++) d += ` l ${s / 5} ${i % 2 ? s / 5 : -s / 5}`;
      body = <path d={d} fill="none" stroke={fill === "none" ? ink : fill} strokeWidth={s / 12 + 2} strokeLinejoin="miter" />;
      break;
    }
    case "triangle":
      body = <polygon points={`0,${-h * 0.9} ${h * 0.95},${h * 0.75} ${-h * 0.95},${h * 0.75}`} fill={fill} stroke={ink} strokeWidth={SW} strokeLinejoin="round" />;
      break;
    case "dot":
      body = <circle r={h - SW} fill={fill} stroke={ink} strokeWidth={SW} />;
      break;
    case "ring":
      body = <circle r={h - s / 8} fill="none" stroke={fill} strokeWidth={s / 5} />;
      break;
    case "half":
      body = <path d={`M ${-h + SW} ${s / 6} A ${h - SW} ${h - SW} 0 0 1 ${h - SW} ${s / 6} Z`} fill={fill} stroke={ink} strokeWidth={SW} />;
      break;
    case "cross":
      body = (
        <g stroke={fill === "none" ? ink : fill} strokeWidth={s / 6} strokeLinecap="square">
          <line x1={-h * 0.6} y1={0} x2={h * 0.6} y2={0} />
          <line x1={0} y1={-h * 0.6} x2={0} y2={h * 0.6} />
        </g>
      );
      break;
    case "grid":
      body = (
        <g fill={fill}>
          {Array.from({ length: 25 }, (_, i) => (
            <circle key={i} cx={-h + s / 10 + (i % 5) * (s / 5)} cy={-h + s / 10 + Math.floor(i / 5) * (s / 5)} r={s / 28} />
          ))}
        </g>
      );
      break;
    case "stripes":
      body = (
        <g>
          <rect x={-h} y={-h * 0.6} width={s} height={s * 0.6} fill={C.paper} stroke={ink} strokeWidth={SW} />
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1={-h + 8 + i * (s / 6)} y1={h * 0.6 - 4} x2={-h + 8 + i * (s / 6) + s * 0.18} y2={-h * 0.6 + 4} stroke={fill} strokeWidth={s / 22} />
          ))}
        </g>
      );
      break;
    case "pill":
      body = <rect x={-h} y={-s / 6} width={s} height={s / 3} rx={s / 6} fill={fill} stroke={ink} strokeWidth={SW} />;
      break;
  }
  const pad = s * 0.2 + SW;
  return (
    <svg width={s + 2 * pad} height={s + 2 * pad} viewBox={`${-h - pad} ${-h - pad} ${s + 2 * pad} ${s + 2 * pad}`} style={{ position: "absolute", overflow: "visible", ...style }}>
      {body}
    </svg>
  );
}

/** Shapes bursting out from a point at frame 0 of `after` (a slam). */
export function Burst({ x, y, after, n = 20, ink }: { x: number; y: number; after: number; n?: number; ink?: string }) {
  if (after < 0 || after >= 22) return null;
  const kinds: ShapeKind[] = ["triangle", "squiggle", "dot", "cross", "zigzag", "pill"];
  const fills = [C.pink, C.yellow, C.cyan, C.lime, C.purple, C.orange];
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + random(`ba${i}`) * 0.4;
        const d = 180 + after * (18 + random(`bv${i}`) * 16);
        const size = 60 + random(`bs${i}`) * 60;
        const k = Math.min(1, after / 3);
        return (
          <Shape
            key={i}
            kind={kinds[i % kinds.length]!}
            size={size}
            fill={fills[i % fills.length]!}
            ink={ink}
            style={{ left: x + Math.cos(a) * d * 1.25 - size / 2, top: y + Math.sin(a) * d * 0.85 + after * after * 0.9 - size / 2, transform: `rotate(${random(`br${i}`) * 360 + after * 18}deg) scale(${k * (1 - Math.max(0, after - 14) / 8)})` }}
          />
        );
      })}
    </>
  );
}
