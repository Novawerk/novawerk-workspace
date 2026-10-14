import { Lockup, Rich } from "../../kit/brand";
import { Stage } from "../../kit/motion";
import { copy } from "./copy";
import { ProtoFrame, framePos } from "./shots/canvas";
import { Robot } from "./shots/HammerRobot";
import { color } from "./theme";

// The cover, 1080 × 1440: three prototype screens fanned out on the dot grid with a robot at work,
// the title on an ink panel, the lockup. No URL, no pointer off the platform.
const FAN = [
  { i: 3, x: 90, y: 230, r: -9 }, // H1 首页
  { i: 6, x: 400, y: 190, r: 0 }, // S1 会谈
  { i: 7, x: 710, y: 230, r: 9 }, // R1 督导报告
];

export function Cover() {
  const { title, tag } = copy.cover;
  return (
    <Stage bg={color.subtle}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${color.lineStrong} 1.6px, transparent 1.6px)`, backgroundSize: "28px 28px" }} />
      {FAN.map(({ i, x, y, r }) => {
        const p = framePos(i);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, transform: `rotate(${r}deg) scale(0.95)`, transformOrigin: "50% 100%" }}>
            <div style={{ position: "absolute", left: -p.x, top: -p.y }}>
              <ProtoFrame i={i} />
            </div>
          </div>
        );
      })}
      <Robot f={30} hits={[22, 37]} x={790} y={110} flip appear={0} size={1.2} />
      <div style={{ position: "absolute", left: 72, top: 64 }}>
        <Lockup height={58} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 620, background: color.ink, color: color.paper, padding: "64px 72px" }}>
        {title.map((line) => (
          <div key={line} style={{ fontSize: 128, fontWeight: 900, lineHeight: 1.14, letterSpacing: -4 }}>
            <Rich text={line} accent={color.signal} />
          </div>
        ))}
        <div style={{ marginTop: 40, display: "inline-block", background: color.signal, color: color.ink, fontSize: 46, fontWeight: 900, padding: "12px 24px" }}>{tag}</div>
      </div>
    </Stage>
  );
}
