import { useCurrentFrame } from "remotion";

import { Rich } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { CUES, WHY, color, ease, sec } from "../theme";

// 0:06–0:10.5 · Why: the two ways we could have taken members in, each struck through.
// 方案一：我们带着做 — 我们不想用自己的想法，去规定大家怎么贡献。 / 方案二：每人每周固定投入时间 (a fully booked week)
// — 我们也不想让参与变得沉重。
export const SHOT_WHY_FRAMES = sec(CUES.idea - CUES.why);

function Strike({ f }: { f: number }) {
  const p = progress(f, sec(WHY.strike), 8);
  return (
    <svg width={960} height={700} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <line x1={-20} y1={560} x2={-20 + 1000 * p} y2={560 - 420 * p} stroke={color.ink} strokeWidth={22} strokeLinecap="square" />
    </svg>
  );
}

function Caption({ lines, f, size = 104 }: { lines: readonly string[]; f: number; size?: number }) {
  return (
    <div style={{ position: "absolute", left: 72, right: 40, top: 980 }}>
      {lines.map((line, k) => {
        const p = progress(f, sec(WHY.caption) + k * 3, 7, ease.spring);
        return (
          <div key={line} style={{ fontSize: size, fontWeight: 900, lineHeight: 1.16, letterSpacing: -2, whiteSpace: "nowrap", opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            <Rich text={line} accent={color.accent} />
          </div>
        );
      })}
    </div>
  );
}

function Plan1({ f }: { f: number }) {
  const land = progress(f, sec(WHY.land), 7, ease.spring);
  const struck = progress(f, sec(WHY.strike) + 6, 6);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 60, top: 150, width: 960, height: 700, transform: `rotate(-2deg) scale(${1.15 - 0.15 * land})`, opacity: land }}>
        <div style={{ position: "absolute", inset: 0, background: color.paper, border: `6px solid ${color.ink}`, padding: "70px 64px", opacity: 1 - 0.45 * struck }}>
          <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -3, whiteSpace: "nowrap" }}>{copy.why.plan1}</div>
          {/* one person leading, a row of people following */}
          <svg width={830} height={340} style={{ marginTop: 50 }}>
            {[0, 1, 2, 3, 4].map((i) => {
              const x = 60 + i * 170;
              const lead = i === 0;
              return (
                <g key={i}>
                  <circle cx={x} cy={lead ? 90 : 130} r={lead ? 36 : 28} fill={lead ? color.accent : color.paper} stroke={color.ink} strokeWidth={6} />
                  <rect x={x - (lead ? 44 : 34)} y={lead ? 140 : 170} width={lead ? 88 : 68} height={lead ? 150 : 120} fill={lead ? color.accent : color.paper} stroke={color.ink} strokeWidth={6} />
                  {i > 0 ? <path d={`M ${x - 120} ${200} l 40 0 m -14 -12 l 14 12 l -14 12`} stroke={color.lineStrong} strokeWidth={6} fill="none" /> : null}
                </g>
              );
            })}
          </svg>
        </div>
        <Strike f={f} />
      </div>
      <Caption lines={copy.why.plan1Caption} f={f} size={84} />
    </Stage>
  );
}

function Plan2({ f }: { f: number }) {
  const land = progress(f, sec(WHY.land), 7, ease.spring);
  const struck = progress(f, sec(WHY.strike) + 6, 6);
  const { plan2, days } = copy.why;
  return (
    <Stage>
      <div style={{ position: "absolute", left: 60, top: 120, width: 960, height: 760, transform: `rotate(1.5deg) scale(${1.15 - 0.15 * land})`, opacity: land }}>
        <div style={{ position: "absolute", inset: 0, background: color.paper, border: `6px solid ${color.ink}`, padding: "54px 56px", opacity: 1 - 0.45 * struck }}>
          <div style={{ fontSize: 56, fontWeight: 800, color: color.muted }}>{plan2[0]}</div>
          <div style={{ fontSize: 70, fontWeight: 900, letterSpacing: -2, whiteSpace: "nowrap" }}>{plan2[1]}</div>
          {/* a week, every slot booked */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginTop: 36 }}>
            {days.map((d) => (
              <div key={d} style={{ fontSize: 34, fontWeight: 800, textAlign: "center" }}>
                {d}
              </div>
            ))}
            {Array.from({ length: 7 * 5 }, (_, i) => {
              const at = sec(WHY.land) + 4 + (i % 7) * 0.6 + Math.floor(i / 7) * 0.9;
              const on = f >= at;
              return <div key={i} style={{ height: 52, background: on ? (i % 3 ? color.ink : color.accent) : color.paper, border: `4px solid ${color.ink}` }} />;
            })}
          </div>
        </div>
        <Strike f={f} />
      </div>
      <Caption lines={copy.why.plan2Caption} f={f} />
    </Stage>
  );
}

export function Shot2Why() {
  const f = useCurrentFrame();
  return f < sec(WHY.plan2) ? <Plan1 f={f} /> : <Plan2 f={f - sec(WHY.plan2)} />;
}
