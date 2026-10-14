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
      <Still id="berlin-chinese-food-map" component={cover(FoodMapCover)} width={W} height={H} />
    </>
  );
}
