import type { CSSProperties } from "react";

import { color } from "./theme";

// A dancer and a robot that dance on a song's beat. The dancer is a beaver, flat colour and no
// outline; the robot is drawn in the house style, ink lines on white. For a film cut to music (a rap, a jingle).
//
// A pose is a handful of joint angles; a move is a few poses, one per beat; `dancePose` picks the
// pose for a moment of the song, arrives on every beat a little early and holds, and dips the hips
// on the beat. Legs are solved from where the feet stand, so a dip bends the knees by itself.
// Units: the beaver is about 320 high, feet on y = 0, x = 0 between the feet.

/** Angles in degrees. Arms: [shoulder, elbow]; 0 hangs down, 90 points sideways, 180 straight up;
 * the elbow adds to it (a positive elbow bends the forearm further up and in). Feet: [x from where
 * it stands, lift]. Hip: [x, y] from rest, y down. `look` −1…1 turns the face. */
export interface Pose {
  hip: readonly [number, number];
  lean: number;
  head: number;
  look: number;
  armL: readonly [number, number];
  armR: readonly [number, number];
  footL: readonly [number, number];
  footR: readonly [number, number];
}

export const REST: Pose = { hip: [0, 0], lean: 0, head: 0, look: 0, armL: [14, 16], armR: [14, 16], footL: [0, 0], footR: [0, 0] };
export const pose = (p: Partial<Pose>): Pose => ({ ...REST, ...p });
/** The same pose, mirrored left to right. */
export const mirror = (p: Pose): Pose => ({ hip: [-p.hip[0], p.hip[1]], lean: -p.lean, head: -p.head, look: -p.look, armL: p.armR, armR: p.armL, footL: [-p.footR[0], p.footR[1]], footR: [-p.footL[0], p.footL[1]] });

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mix2 = (a: readonly [number, number], b: readonly [number, number], k: number) => [mix(a[0], b[0], k), mix(a[1], b[1], k)] as const;
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  if (a === b || k <= 0) return a;
  if (k >= 1) return b;
  return { hip: mix2(a.hip, b.hip, k), lean: mix(a.lean, b.lean, k), head: mix(a.head, b.head, k), look: mix(a.look, b.look, k), armL: mix2(a.armL, b.armL, k), armR: mix2(a.armR, b.armR, k), footL: mix2(a.footL, b.footL, k), footR: mix2(a.footR, b.footR, k) };
}

/**
 * From `from` (seconds) on, loop through `move`, one pose every `per` eighth notes (2 = every beat).
 * A step takes hold on the first eighth note at or after `from`: the dancer is in its first pose on
 * that note, up to a third of a second after `from` at 90 BPM, never before.
 */
export interface Step {
  from: number;
  move: readonly Pose[];
  per?: number;
}
export interface Clock {
  bpm: number;
  /** when the first beat falls, in seconds */
  beat: number;
}

/** How far through the song's beats `time` is (1 = one beat after the first). */
export const beatsAt = (time: number, clock: Clock) => ((time - clock.beat) * clock.bpm) / 60;

/**
 * The pose at `time`: the step's pose for this eighth note, easing into the next one just before it
 * starts. `steps` must not be empty and must be in order of `from`.
 */
export function dancePose(steps: readonly Step[], time: number, clock: Clock, bounce = 12): Pose {
  const eighth = 30 / clock.bpm;
  const e = (time - clock.beat) / eighth;
  const s = Math.floor(e);
  const at = (i: number) => {
    const t = clock.beat + i * eighth + 1e-3;
    let step = steps[0]!;
    for (const x of steps) if (x.from <= t) step = x;
    const per = step.per ?? 2;
    const first = Math.ceil((step.from - clock.beat) / eighth / per - 1e-6);
    const n = Math.max(0, Math.floor(i / per) - first);
    return step.move[n % step.move.length]!;
  };
  const k = Math.min(1, Math.max(0, (e - s - 0.4) / 0.6));
  const p = mixPose(at(s), at(s + 1), k * k * (3 - 2 * k));
  const dip = 0.5 + 0.5 * Math.cos(Math.PI * e); // 1 on the beat, 0 halfway to the next
  return { ...p, hip: [p.hip[0], p.hip[1] + bounce * dip] };
}

const rad = (d: number) => (d * Math.PI) / 180;

// The beaver: Werk is a workshop, and beavers build. Drawn the way mascots are: one round block of
// colour, head and body in one, short limbs, very little face, two teeth and a flat tail to
// remember it by. Its fur is brown, which is not in BRAND.md's palette: the founder's exception for
// this character (all in the brand's green it "looked poisoned"). The green is in its scarf. Never
// give it a green hat: 绿帽子 is an insult in Chinese.
const FUR = { light: "#a5744a", dark: "#b98658" } as const;
const FUR_DEEP = { light: "#5f3d25", dark: "#7a5233" } as const;
const UNITS = 318;
const HIP_Y = -58;
const TORSO = 88; // hips to the line the arms hang from
const SHOULDER = 108;
const HIP_W = 54;
const UPPER = 40;
const FORE = 36;
const LEG = 30; // thigh and shin
const STANCE = 62;
const ANKLE = -14;
const LIMB = 40;

/**
 * The dancer. `x`, `floor`: where the feet stand, in the parent's pixels; `height`: how tall, in
 * pixels. The tail is always on the right and `mirror` does not flip it: leave about 0.6 × height
 * free to the right of `x`, and 0.4 × height to the left.
 */
export function Dancer({ pose: p, x, floor, height = 460, tone = "light", wear = "scarf", style }: { pose: Pose; x: number; floor: number; height?: number; tone?: "light" | "dark"; /** in the brand's green */ wear?: "none" | "scarf"; style?: CSSProperties }) {
  const s = height / UNITS;
  const fur = FUR[tone];
  const deep = FUR_DEEP[tone];
  const green = tone === "dark" ? color.signal : color.accent;
  const hip = [p.hip[0], HIP_Y + p.hip[1]] as const;
  const up = [Math.sin(rad(p.lean)), -Math.cos(rad(p.lean))] as const;
  const across = [Math.cos(rad(p.lean)), Math.sin(rad(p.lean))] as const;
  const chest = [hip[0] + TORSO * up[0], hip[1] + TORSO * up[1]] as const;
  // squash when the hips are low, stretch when they are up
  const squash = Math.max(-0.07, Math.min(0.07, p.hip[1] / 220));

  // limbs are one soft curve from joint to joint, no elbows or knees
  const arm = (side: 1 | -1, [a, bend]: readonly [number, number]) => {
    const sh = [chest[0] + side * SHOULDER * across[0], chest[1] + side * SHOULDER * across[1]] as const;
    const el = [sh[0] + side * UPPER * Math.sin(rad(a)), sh[1] + UPPER * Math.cos(rad(a))] as const;
    const hand = [el[0] + side * FORE * Math.sin(rad(a + bend)), el[1] + FORE * Math.cos(rad(a + bend))] as const;
    return `M${sh[0]} ${sh[1]} Q${el[0]} ${el[1]} ${hand[0]} ${hand[1]}`;
  };
  const leg = (side: 1 | -1, [fx, lift]: readonly [number, number]) => {
    const j = [hip[0] + side * HIP_W, hip[1]] as const;
    const foot = [side * STANCE + fx, ANKLE - lift] as const;
    const dx = foot[0] - j[0];
    const dy = foot[1] - j[1];
    const d = Math.min(Math.hypot(dx, dy), LEG * 2 - 1);
    const base = Math.atan2(dy, dx);
    const bend = Math.acos(d / (LEG * 2));
    // the curve's control point sits further out than a knee would, so the curve passes where the knee is
    const knee = [j[0] + LEG * 1.5 * Math.cos(base - side * bend * 1.3), j[1] + LEG * 1.5 * Math.sin(base - side * bend * 1.3)] as const;
    return { d: `M${j[0]} ${j[1]} Q${knee[0]} ${knee[1]} ${foot[0]} ${foot[1]}`, foot };
  };
  const legs = [leg(-1, p.footL), leg(1, p.footR)];
  // both arms up: the teeth show more
  const happy = p.armL[0] > 115 && p.armR[0] > 115;
  const lifted = Math.max(p.footL[1], p.footR[1]);
  const limb = { fill: "none", stroke: fur, strokeWidth: LIMB, strokeLinecap: "round" } as const;
  const W = 460;
  const top = UNITS + 60;
  // the body's own frame: origin at the hips, y up the spine, leaning and squashing with the pose
  const body = `translate(${hip[0]} ${hip[1]}) rotate(${p.lean}) scale(${1 + squash} ${1 - squash})`;
  const wag = 22 + p.hip[1] * 1.1 + p.lean * 0.6;

  return (
    <svg viewBox={`${-W / 2} ${-top} ${W} ${top + 30}`} width={W * s} height={(top + 30) * s} style={{ position: "absolute", left: x - (W / 2) * s, top: floor - top * s, overflow: "visible", ...style }}>
      <ellipse cx={hip[0] * 0.5} cy={8} rx={92 - lifted * 0.5} ry={11} fill={tone === "dark" ? "rgba(255,255,255,0.14)" : color.line} />
      {/* the tail, behind everything: it wags as the hips dip */}
      <g transform={`translate(${hip[0]} ${hip[1]}) rotate(${p.lean})`}>
        <g transform={`rotate(${wag} 60 -30)`}>
          <ellipse cx={126} cy={-34} rx={44} ry={82} fill={deep} />
          <path d="M96 -72 L156 -44 M92 -38 L160 -6 M98 0 L150 24 M154 -76 L96 -34 M162 -42 L98 6" stroke={fur} strokeWidth={5} strokeLinecap="round" opacity={0.75} />
        </g>
      </g>
      {legs.map((l, i) => (
        <g key={i}>
          <path d={l.d} {...limb} />
          <ellipse cx={l.foot[0] + (i ? 10 : -10)} cy={l.foot[1] + 4} rx={40} ry={19} fill={deep} />
        </g>
      ))}
      <g transform={body}>
        {[-1, 1].map((side) => (
          <g key={side}>
            <circle cx={side * 78} cy={-232} r={31} fill={fur} />
            <circle cx={side * 78} cy={-232} r={13} fill={deep} />
          </g>
        ))}
        <rect x={-118} y={-240} width={236} height={262} rx={96} fill={fur} />
        {/* belly and muzzle: a little lighter */}
        <ellipse cx={0} cy={-34} rx={66} ry={46} fill={color.paper} opacity={0.26} />
        <g transform={`translate(${p.look * 8} -150) rotate(${p.head})`}>
          <ellipse cx={0} cy={26} rx={58} ry={40} fill={color.paper} opacity={0.26} />
          {[-1, 1].map((side) => (
            <g key={side}>
              <circle cx={side * 50} cy={-10} r={11.5} fill={color.ink} />
              <circle cx={side * 50 + 3.5} cy={-14} r={3.6} fill={color.paper} />
            </g>
          ))}
          <ellipse cx={0} cy={12} rx={17} ry={12} fill={color.ink} />
          <rect x={-19} y={24} width={38} height={happy ? 36 : 27} rx={6} fill={color.paper} />
          <path d={`M0 25 V${happy ? 59 : 50}`} stroke={fur} strokeWidth={3.5} />
        </g>
        {wear === "scarf" ? (
          <>
            <path d="M-118 -102 Q0 -70 118 -102 V-76 Q0 -44 -118 -76 Z" fill={green} />
            <path d="M62 -64 L96 -22 L70 -18 L58 -40 L40 -16 L22 -34 Z" fill={green} />
            <path d="M62 -64 L58 -40" stroke={tone === "dark" ? color.accent : color.accentDeep} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
          </>
        ) : null}
      </g>
      {/* arms in front; a darker edge so they still read when they cross the body */}
      {[arm(-1, p.armL), arm(1, p.armR)].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke={deep} strokeWidth={LIMB + 5} strokeLinecap="round" opacity={0.35} />
          <path d={d} {...limb} />
        </g>
      ))}
    </svg>
  );
}

/**
 * The robot that dances along: `beats` is how far through the song's beats we are (`beatsAt`). It
 * bobs on the beat; its arms swing, or stay up (holding something overhead, or cheering).
 */
export function Buddy({ beats, x, floor, height = 300, arms = "swing", tone = "light", style }: { beats: number; x: number; floor: number; height?: number; arms?: "swing" | "up"; tone?: "light" | "dark"; style?: CSSProperties }) {
  const s = height / 340;
  const line = tone === "dark" ? color.paper : color.ink;
  const body = tone === "dark" ? color.ink : color.paper;
  const dip = (0.5 + 0.5 * Math.cos(2 * Math.PI * beats)) * 12;
  const sway = Math.sin(Math.PI * beats);
  const blink = Math.floor(beats * 2) % 9 === 4;
  const hand = (side: 1 | -1) => {
    const a = rad(arms === "up" ? 158 + 6 * sway * side : 38 + 34 * sway * side);
    const reach = arms === "up" ? 150 : 84;
    return [side * 60 + side * reach * Math.sin(a), -176 + reach * Math.cos(a)] as const;
  };
  const limb = { stroke: line, strokeLinecap: "round" } as const;
  return (
    <svg viewBox="-150 -350 300 370" width={300 * s} height={370 * s} style={{ position: "absolute", left: x - 150 * s, top: floor - 350 * s, overflow: "visible", ...style }}>
      <ellipse cx={0} cy={8} rx={84} ry={10} fill={tone === "dark" ? "rgba(255,255,255,0.14)" : color.line} />
      <line x1={-28} y1={-70 + dip} x2={-32} y2={-10} strokeWidth={18} {...limb} />
      <line x1={28} y1={-70 + dip} x2={32} y2={-10} strokeWidth={18} {...limb} />
      <rect x={-58} y={-12} width={48} height={20} rx={6} fill={body} stroke={line} strokeWidth={6} />
      <rect x={10} y={-12} width={48} height={20} rx={6} fill={body} stroke={line} strokeWidth={6} />
      <g transform={`translate(0 ${dip})`}>
        {([-1, 1] as const).map((side) => {
          const h = hand(side);
          return <line key={side} x1={side * 60} y1={-176} x2={h[0]} y2={h[1]} strokeWidth={16} {...limb} />;
        })}
        <rect x={-60} y={-200} width={120} height={132} fill={body} stroke={line} strokeWidth={7} />
        <rect x={-34} y={-176} width={68} height={18} fill={color.signal} />
        <g transform={`rotate(${4 * sway} 0 -200)`}>
          <line x1={0} y1={-304} x2={0} y2={-326} strokeWidth={7} {...limb} />
          <circle cx={0} cy={-334} r={10} fill={color.signal} stroke={line} strokeWidth={5} />
          <rect x={-78} y={-304} width={156} height={104} fill={body} stroke={line} strokeWidth={7} />
          <rect x={-44} y={blink ? -256 : -270} width={24} height={blink ? 6 : 34} fill={tone === "dark" ? color.signal : color.accent} />
          <rect x={20} y={blink ? -256 : -270} width={24} height={blink ? 6 : 34} fill={tone === "dark" ? color.signal : color.accent} />
        </g>
      </g>
    </svg>
  );
}
