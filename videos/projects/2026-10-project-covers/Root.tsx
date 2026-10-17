import type { ComponentType } from "react";
import { Still } from "remotion";

import { FoodMapCover, Shape, YimaCover, fun } from "../../kit/shapes";
import { color } from "../../kit/theme";

// The portfolio cards' cover images on novawerk.io, drawn like the covers in the 2026-10 小红书
// video (kit/shapes.tsx). The site shows them at 16:10. Render: pnpm video 2026-10-project-covers still <id>

const W = 1600;
const H = 1000;
const ART = { width: 450, height: 281.25 }; // the kit covers are drawn on a 450-wide 16:10 card
const LANDED = 600; // a frame long after every pin and dot has landed

/** 聆镜 PSYGYM: a hand-mirror, and a talk between a new counselor and an AI practice partner. */
function PsygymCover() {
  const mist = "#ece6fd";
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: mist, overflow: "hidden" }}>
      {/* the mirror (聆镜): an oval glass on a handle, with a glint */}
      <svg viewBox="0 0 450 281" style={{ position: "absolute", inset: 0 }}>
        <rect x={84} y={170} width={22} height={90} rx={11} fill={fun.lilac} />
        <ellipse cx={95} cy={110} rx={62} ry={76} fill={fun.lilac} />
        <ellipse cx={95} cy={110} rx={46} ry={60} fill={color.paper} />
        <path d="M70 92 L96 66" stroke={fun.lilac} strokeWidth={8} strokeLinecap="round" />
        <path d="M74 116 L112 78" stroke={fun.lilac} strokeWidth={8} strokeLinecap="round" />
      </svg>
      <Shape kind="circle" size={26} fill={fun.mustard} style={{ right: 40, top: 40 }} />
      <Shape kind="half" size={60} fill={fun.rose} style={{ left: 200, bottom: -2 }} />
      <svg viewBox="0 0 450 281" style={{ position: "absolute", inset: 0 }}>
        {/* the counselor's bubble */}
        <path d="M180 70 H330 V138 H222 L198 160 V138 H180 Z" fill={color.paper} />
        <rect x={198} y={88} width={110} height={10} fill={fun.lilac} />
        <rect x={198} y={108} width={74} height={10} fill={fun.lilac} />
        {/* the practice partner's reply */}
        <path d="M200 176 H330 V194 L352 206 L330 214 V232 H200 Z" fill={fun.sky} />
        <circle cx={235} cy={204} r={7} fill={color.paper} />
        <circle cx={265} cy={204} r={7} fill={color.paper} />
        <circle cx={295} cy={204} r={7} fill={color.paper} />
        {/* the partner: a little robot head, green eyes */}
        <line x1={378} y1={196} x2={378} y2={184} stroke={color.paper} strokeWidth={4} />
        <circle cx={378} cy={180} r={6} fill={fun.mustard} />
        <rect x={354} y={196} width={48} height={34} fill={color.paper} />
        <rect x={364} y={207} width={8} height={11} fill={color.accent} />
        <rect x={384} y={207} width={8} height={11} fill={color.accent} />
      </svg>
    </div>
  );
}

/** Klarpost: a stack of letters goes into the scanner and comes out filed; the phone shows only the
 * letters that need action (a payment, an appointment). */
function KlarpostCover() {
  const mist = "#e3ebfb";
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: mist, overflow: "hidden" }}>
      <Shape kind="circle" size={26} fill={fun.mustard} style={{ left: 249, top: 27 }} />
      <Shape kind="half" size={60} fill={fun.rose} style={{ left: 10, bottom: -2 }} />
      <svg viewBox="0 0 450 281" style={{ position: "absolute", inset: 0 }}>
        {/* the stack in the feeder: a window envelope with a stamp on top */}
        <rect x={96} y={58} width={112} height={78} fill={color.paper} transform="rotate(-13 150 110) translate(-14 -4)" />
        <g transform="rotate(-4 150 110)">
          <rect x={98} y={62} width={112} height={78} fill={color.paper} stroke={mist} strokeWidth={3} />
          <rect x={112} y={80} width={46} height={18} fill={fun.lilac} />
          <rect x={186} y={72} width={14} height={16} fill={fun.mustard} />
        </g>
        {/* the scanner: one slot, one button */}
        <rect x={66} y={126} width={190} height={74} fill={fun.sky} />
        <rect x={90} y={140} width={128} height={6} fill={color.paper} />
        <circle cx={234} cy={178} r={9} fill={fun.jade} />
        {/* a letter out, filed */}
        <rect x={88} y={208} width={134} height={46} fill={color.paper} />
        <rect x={102} y={220} width={82} height={7} fill={fun.lilac} />
        <rect x={102} y={235} width={56} height={7} fill={fun.lilac} />
        {/* the phone: a payment and an appointment; the rest filed quietly */}
        <rect x={306} y={58} width={100} height={180} rx={12} fill={color.paper} />
        <rect x={318} y={84} width={76} height={34} fill={mist} />
        <circle cx={332} cy={101} r={8} fill={fun.rose} />
        <rect x={346} y={97} width={38} height={8} fill={fun.lilac} />
        <rect x={318} y={126} width={76} height={34} fill={mist} />
        <rect x={325} y={135} width={15} height={15} fill={fun.mustard} />
        <rect x={346} y={139} width={30} height={8} fill={fun.lilac} />
        <rect x={318} y={174} width={56} height={7} fill={mist} />
        <rect x={318} y={188} width={40} height={7} fill={mist} />
        <rect x={318} y={202} width={50} height={7} fill={mist} />
      </svg>
    </div>
  );
}

function cover(Art: ComponentType<{ f: number; at: number }>) {
  return function Cover() {
    return (
      <div style={{ width: W, height: H, overflow: "hidden" }}>
        <div style={{ ...ART, transform: `scale(${W / ART.width})`, transformOrigin: "0 0" }}>
          <Art f={LANDED} at={0} />
        </div>
      </div>
    );
  };
}

export function Root() {
  return (
    <>
      <Still id="yima" component={cover(YimaCover)} width={W} height={H} />
      <Still id="psygym" component={cover(PsygymCover)} width={W} height={H} />
      <Still id="klarpost" component={cover(KlarpostCover)} width={W} height={H} />
      <Still id="berlin-chinese-food-map" component={cover(FoodMapCover)} width={W} height={H} />
    </>
  );
}
