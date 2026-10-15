import { random, useCurrentFrame } from "remotion";

import { Lockup, Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { CUES, TOWER, color, ease, sec } from "../theme";

// 0:29–0:40 · The tower: the pixel star blinks high in the dark, the camera drops through the
// dashed outlines of blocks nobody has built yet and lands on the one real block, NW-3, with a
// thud; pixel people walk around the base. Then: the next one can be yours.
export const SHOT4_FRAMES = sec(CUES.end - CUES.tower);

const S = 84;
const H = 72;
const N = 3;
const LAYERS = 22;
const STAR_Y = 520;
const BASE_Y = STAR_Y + 120 + LAYERS * H;
const CX = 540;
const BRICK = { x: 1, y: 1 } as const;
const iso = (x: number, y: number, z: number) => [CX + (x - y) * S, BASE_Y + ((x + y) * S) / 2 - z * H] as const;
function faces(x: number, y: number, z: number) {
  const [tx, ty] = iso(x, y, z + 1);
  return {
    tx,
    ty,
    top: `${tx},${ty} ${tx + S},${ty + S / 2} ${tx},${ty + S} ${tx - S},${ty + S / 2}`,
    left: `${tx - S},${ty + S / 2} ${tx},${ty + S} ${tx},${ty + S + H} ${tx - S},${ty + S / 2 + H}`,
    right: `${tx + S},${ty + S / 2} ${tx},${ty + S} ${tx},${ty + S + H} ${tx + S},${ty + S / 2 + H}`,
  };
}
const STAR = [".....#.....", ".....#.....", ".....#.....", "....#c#....", "...##c##...", "###ccccc###", "...##c##...", "....#c#....", ".....#.....", ".....#.....", ".....#....."];
const PERSON = ["..hh..", "..hh..", ".bbbb.", ".bbbb.", ".bbbb.", "..l.l.", "..l.l."];
const PEOPLE = [
  { gx: -1.4, gy: 2.6, body: color.signal, axis: 0 },
  { gx: 3.9, gy: 0.4, body: color.paper, axis: 1 },
  { gx: -1.8, gy: 0.2, body: color.accent, axis: 1 },
  { gx: 3.6, gy: 2.9, body: "#7aa2f0", axis: 0 },
  { gx: 0.6, gy: 4.1, body: color.paper, axis: 1 },
  { gx: 2.8, gy: -1.6, body: color.signal, axis: 0 },
] as const;

function Caption({ lines, f, at, until }: { lines: readonly string[]; f: number; at: number; until?: number }) {
  if (f < sec(at) || (until !== undefined && f >= sec(until))) return null;
  return (
    <div style={{ position: "absolute", left: 72, right: 40, top: 90 }}>
      {lines.map((line, k) => {
        const p = progress(f, sec(at) + k * 3, 7, ease.spring);
        return (
          <div key={line} style={{ fontSize: 112, fontWeight: 900, lineHeight: 1.14, letterSpacing: -3, whiteSpace: "nowrap", opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            <Rich text={line} accent={color.signal} />
          </div>
        );
      })}
    </div>
  );
}

export function Shot4Tower() {
  const f = useCurrentFrame();
  const t = copy.tower;
  const from = sec(TOWER.dropFrom);
  const land = sec(TOWER.land);
  const brickTop = iso(BRICK.x, BRICK.y, 1)[1];
  const endT = 1060 - (brickTop + S);
  const k = Math.min(1, Math.max(0, (f - from) / (land - from)));
  const after = f - land;
  const bounce = after >= 0 ? Math.exp(-after / 3) * Math.sin(after * 1.4) * 22 : 0;
  const shake = after >= 0 && after < 6 ? (random(`k${f}`) - 0.5) * 18 * (1 - after / 6) : 0;
  const camY = endT * k * k * k + bounce;
  const blink = Math.floor(f / 6) % 2 === 0 ? 1 : 0.55;

  const outlines = [];
  for (let z = LAYERS - 1; z >= 0; z--)
    for (let x = 0; x < N; x++)
      for (let y = 0; y < N; y++) {
        if (z === 0 && x === BRICK.x && y === BRICK.y) continue;
        const c = faces(x, y, z);
        outlines.push(<polygon key={`t${x}${y}${z}`} points={c.top} fill="none" stroke={color.paper} strokeOpacity={0.22} strokeWidth={2} strokeDasharray="8 8" />);
        if (x === N - 1 || y === N - 1) {
          outlines.push(<polygon key={`l${x}${y}${z}`} points={c.left} fill="none" stroke={color.paper} strokeOpacity={0.14} strokeWidth={2} strokeDasharray="8 8" />);
          outlines.push(<polygon key={`r${x}${y}${z}`} points={c.right} fill="none" stroke={color.paper} strokeOpacity={0.14} strokeWidth={2} strokeDasharray="8 8" />);
        }
      }
  const ground = [];
  for (let x = -3; x < N + 3; x++)
    for (let y = -3; y < N + 3; y++) {
      const [tx, ty] = iso(x, y, 0);
      ground.push(<polygon key={`g${x}${y}`} points={`${tx},${ty} ${tx + S},${ty + S / 2} ${tx},${ty + S} ${tx - S},${ty + S / 2}`} fill={(x + y) % 2 ? "#1b1b1b" : "#151515"} />);
    }
  const brick = faces(BRICK.x, BRICK.y, 0);
  const dust =
    after >= 0 && after < 18
      ? Array.from({ length: 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const d = after * (6 + random(`d${i}`) * 6);
          return <rect key={i} x={brick.tx + Math.cos(a) * (S + d) - 6} y={brick.ty + S + H * 0.6 + Math.sin(a) * (S / 2 + d / 2) - 6} width={12} height={12} fill={color.paper} opacity={1 - after / 18} />;
        })
      : null;
  const px = 12;
  const people = after >= 0
    ? PEOPLE.map((p, i) => {
        const walk = Math.sin((f - land) * 0.05 + i * 1.7) * 0.7;
        const [fx, fy] = iso(p.gx + (p.axis ? walk : 0), p.gy + (p.axis ? 0 : walk), 0);
        const step = Math.floor(f / 5 + i) % 2;
        const pop = progress(f, land + 4 + i * 3, 6, ease.spring);
        return (
          <g key={i} transform={`translate(${fx - 3 * px} ${fy - 7 * px + (1 - pop) * 40})`} opacity={pop}>
            <rect x={0} y={7 * px} width={6 * px} height={px} fill="#000" opacity={0.45} />
            {PERSON.flatMap((row, r) =>
              [...row].map((ch, c) => (ch === "." ? null : <rect key={`${r}${c}`} x={c * px} y={r * px + (ch === "l" && step && c === 2 ? -px : 0)} width={px} height={px} fill={ch === "h" ? "#e8d9c4" : ch === "b" ? p.body : "#9a9a9a"} />)),
            )}
          </g>
        );
      })
    : null;
  const label = progress(f, land + 3, 6, ease.spring);
  const end = progress(f, sec(TOWER.end), 10);

  return (
    <Stage bg={color.ink} fg={color.paper}>
      <div style={{ position: "absolute", left: shake, top: camY, width: 1080, height: BASE_Y + 700 }}>
        <svg width={1080} height={BASE_Y + 700} style={{ position: "absolute", left: 0, top: 0, shapeRendering: "crispEdges" }}>
          {ground}
          {outlines}
          <polygon points={brick.left} fill={color.signal} />
          <polygon points={brick.right} fill={color.accent} />
          <polygon points={brick.top} fill="#7cf2ad" />
          {dust}
          {people}
          {STAR.flatMap((row, r) => [...row].map((ch, c) => (ch === "." ? null : <rect key={`s${r}${c}`} x={CX - 5.5 * 16 + c * 16} y={STAR_Y - 5.5 * 16 + r * 16} width={16} height={16} fill={ch === "c" ? color.accentDeep : color.signal} opacity={ch === "c" ? 1 : blink} />)))}
        </svg>
        {label > 0 ? (
          <div style={{ position: "absolute", left: brick.tx - 90, top: brick.ty - 120, width: 180, textAlign: "center", fontFamily: monoFamily, fontSize: 44, fontWeight: 700, color: color.ink, background: color.signal, padding: "6px 0", transform: `scale(${label})` }}>{t.brick}</div>
        ) : null}
      </div>
      <Caption lines={t.first} f={f} at={TOWER.first} until={TOWER.nw3} />
      <Caption lines={t.nw3} f={f} at={TOWER.nw3} until={TOWER.next} />
      {f >= sec(TOWER.nw3) && f < sec(TOWER.next) ? (
        <div style={{ position: "absolute", left: 72, top: 370, fontFamily: monoFamily, fontSize: 32, color: "#cfcfcf", opacity: progress(f, sec(TOWER.nw3) + 6, 7) }}>{t.nw3Title}</div>
      ) : null}
      <Caption lines={t.next} f={f} at={TOWER.next} />
      {end > 0 ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, display: "grid", justifyItems: "center", gap: 22, opacity: end, transform: `translateY(${(1 - end) * 20}px)` }}>
          <Lockup height={54} tone="dark" />
          <div style={{ fontSize: 44, fontWeight: 700, color: "#cfcfcf" }}>{t.end}</div>
        </div>
      ) : null}
    </Stage>
  );
}
