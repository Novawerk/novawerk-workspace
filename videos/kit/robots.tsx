import { FPS, color } from "./theme";

// Little robots running across the screen, busy. Drawn on a 40 × 56 grid: antenna, head with two
// green eyes, body, swinging arms, stepping legs. Some carry a box, a gear or a note overhead.

/** One robot: enters at `enter` seconds, runs in a lane (0 = top of the safe area, 1 = bottom). */
export interface Robot {
  enter: number;
  lane: number;
  size: number;
  speed: number; // px per frame
  dir: 1 | -1;
  carry: "box" | "gear" | "note" | "none";
}

function Bot({ r, t, flip }: { r: Robot; t: number; flip: boolean }) {
  const step = Math.sin(t * 1.3); // legs and arms, a step every ~5 frames
  const blink = Math.floor(t / 9) % 7 === 0;
  const ink = color.ink;
  const body = color.paper;
  return (
    <svg viewBox="-6 -22 52 80" width={r.size} height={(r.size * 80) / 52} style={{ overflow: "visible", transform: flip ? "scaleX(-1)" : undefined }}>
      {/* load */}
      {r.carry === "box" ? <rect x={6} y={-20} width={28} height={16} fill="#f3b23c" stroke={ink} strokeWidth={2} /> : null}
      {r.carry === "note" ? <rect x={4} y={-18} width={32} height={14} fill={body} stroke={ink} strokeWidth={2} transform="rotate(-6 20 -11)" /> : null}
      {r.carry === "gear" ? (
        <g transform={`translate(20 -12) rotate(${t * 12})`}>
          {[0, 45, 90, 135].map((a) => (
            <rect key={a} x={-2.5} y={-10} width={5} height={20} fill={color.signal} transform={`rotate(${a})`} />
          ))}
          <circle r={6} fill={color.signal} />
          <circle r={2.5} fill={ink} />
        </g>
      ) : null}
      {r.carry !== "none" ? (
        <>
          <line x1={6} y1={14} x2={8} y2={-4} stroke={body} strokeWidth={3} strokeLinecap="round" />
          <line x1={34} y1={14} x2={32} y2={-4} stroke={body} strokeWidth={3} strokeLinecap="round" />
        </>
      ) : (
        <>
          <line x1={6} y1={18} x2={6 - 6 * step} y2={30} stroke={body} strokeWidth={3} strokeLinecap="round" />
          <line x1={34} y1={18} x2={34 + 6 * step} y2={30} stroke={body} strokeWidth={3} strokeLinecap="round" />
        </>
      )}
      {/* antenna */}
      <line x1={20} y1={0} x2={20} y2={-6} stroke={body} strokeWidth={2} />
      {r.carry === "none" ? <circle cx={20} cy={-8} r={3} fill={color.signal} /> : null}
      {/* head */}
      <rect x={8} y={0} width={24} height={16} fill={body} stroke={ink} strokeWidth={2} />
      <rect x={13} y={blink ? 7 : 5} width={4} height={blink ? 1.5 : 5} fill={color.accent} />
      <rect x={23} y={blink ? 7 : 5} width={4} height={blink ? 1.5 : 5} fill={color.accent} />
      {/* body */}
      <rect x={10} y={16} width={20} height={20} fill={body} stroke={ink} strokeWidth={2} />
      <rect x={14} y={21} width={12} height={4} fill={color.signal} />
      {/* legs */}
      <line x1={15} y1={36} x2={15 + 5 * step} y2={50} stroke={body} strokeWidth={4} strokeLinecap="round" />
      <line x1={25} y1={36} x2={25 - 5 * step} y2={50} stroke={body} strokeWidth={4} strokeLinecap="round" />
    </svg>
  );
}

/** The parade. `f` is the frame in the shot, `shotStart` the shot's start in seconds. */
export function Robots({ robots, f, shotStart, width, height }: { robots: readonly Robot[]; f: number; shotStart: number; width: number; height: number }) {
  return (
    <>
      {robots.map((r, i) => {
        const t = f - (r.enter - shotStart) * FPS;
        if (t < 0) return null;
        const w = r.size;
        const travel = t * r.speed;
        const x = r.dir === 1 ? -w + travel : width + travel * -1;
        if (x < -w * 1.5 || x > width + w * 0.5) return null;
        const hop = Math.abs(Math.sin(t * 0.65)) * r.size * 0.08;
        const y = r.lane * height - (w * 80) / 52 / 2 - hop;
        // Big ones close to the lens tilt into their run.
        const lean = r.size > 200 ? 8 * r.dir : 3 * r.dir;
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: `rotate(${lean}deg)` }}>
            <Bot r={r} t={t} flip={r.dir === -1} />
          </div>
        );
      })}
    </>
  );
}
