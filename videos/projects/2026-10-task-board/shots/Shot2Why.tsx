import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";

import { Stage, progress } from "../../../kit/motion";
import { Banner, BoxCaption, Builder, C, Mosaic, OUT, Star, Tag, pop, type PanelSpec } from "../collage";
import { copy } from "../copy";
import { CUES, WHY, ease, sec } from "../theme";

// 0:06–0:10.5 · Why, as two collages: the two ways we could have taken members in, each struck through.
// 方案一：我们带着做 (one builder leading a row) — 我们不想用自己的想法，去规定大家怎么贡献。
// 方案二：每人每周固定投入时间 (a week booked solid) — 我们也不想让参与变得沉重。
export const SHOT_WHY_FRAMES = sec(CUES.idea - CUES.why);

type Fill = PanelSpec["fill"];
const frame = (top: Fill, side: Fill, side2: Fill, bottom: Fill): PanelSpec[] => [
  { x: 0, y: 0, w: 1080, h: 140, fill: top },
  { x: 0, y: 140, w: 90, h: 820, fill: side },
  { x: 990, y: 140, w: 90, h: 820, fill: side2 },
  { x: 0, y: 960, w: 1080, h: 480, fill: bottom },
];

const PANELS_1 = frame({ kind: "stripes", a: C.yellow, b: C.paper, size: 40 }, { kind: "dots", a: C.ink, b: C.cyan, size: 30 }, { kind: "checker", a: C.purple, b: C.paper, size: 30 }, { kind: "halftone", a: C.lime, b: C.blue, size: 40 });
const PANELS_2 = frame({ kind: "checker", a: C.pink, b: C.paper, size: 36 }, { kind: "waves", a: C.purple, b: C.lime, size: 36 }, { kind: "dots", a: C.paper, b: C.orange, size: 30 }, { kind: "stripes", a: C.cyan, b: C.ink, size: 44 });

/** A thick ink line drawn across the note. */
function Strike({ f }: { f: number }) {
  const p = progress(f, sec(WHY.strike), 8);
  return (
    <svg width={900} height={760} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <line x1={-30} y1={620} x2={-30 + 980 * p} y2={620 - 480 * p} stroke={C.ink} strokeWidth={30} strokeLinecap="round" />
    </svg>
  );
}

/** The note card: drops in, gets struck through, greys once struck. */
function Note({ f, height, shadow, children }: { f: number; height: number; shadow: string; children: ReactNode }) {
  const land = progress(f, sec(WHY.land), 7, ease.spring);
  const struck = progress(f, sec(WHY.strike) + 6, 6);
  return (
    <div style={{ position: "absolute", left: 90, top: 170, width: 900, height, transform: `rotate(-1.5deg) scale(${1.12 - 0.12 * land})`, opacity: land }}>
      <div style={{ position: "absolute", inset: 0, background: C.paper, border: `${OUT + 1}px solid ${C.ink}`, boxShadow: `20px 20px 0 ${shadow}`, padding: "40px 46px", boxSizing: "border-box" }}>
        {children}
        {struck > 0 ? <div style={{ position: "absolute", inset: 0, background: C.paper, opacity: 0.4 * struck }} /> : null}
      </div>
      <Strike f={f} />
    </div>
  );
}

function Plan1({ f }: { f: number }) {
  const [tag, title] = copy.why.plan1.split("：");
  return (
    <Stage>
      <Mosaic panels={PANELS_1} f={f + 20} seed="w1" />
      <Note f={f} height={720} shadow={C.pink}>
        <Tag text={tag!} bg={C.yellow} size={46} style={{ position: "relative", display: "inline-flex" }} />
        <div style={{ marginTop: 26 }}>
          <Banner bg={C.cyan} size={104} shadow={C.ink} pad={[8, 26]}>
            {title}
          </Banner>
        </div>
        {/* one builder leading, a row following */}
        <div style={{ position: "relative", height: 330, marginTop: 30 }}>
          <Builder h={300} body={C.pink} hat={C.yellow} brick={C.lime} style={{ left: 0, top: 0 }} />
          {[0, 1, 2, 3].map((i) => (
            <Builder key={i} h={200} body={[C.cyan, C.lime, C.orange, C.purple][i]} hat={C.paper} brick={C.paper} style={{ left: 220 + i * 150, top: 110 }} />
          ))}
        </div>
      </Note>
      <div style={{ ...pop(f, 4, 0), position: "absolute", left: 900, top: 20 }}>
        <Star d={130} />
      </div>
      <BoxCaption lines={copy.why.plan1Caption} f={f} at={WHY.caption} size={76} bg={C.paper} shadow={C.pink} style={{ left: 50, top: 1030 }} />
    </Stage>
  );
}

function Plan2({ f }: { f: number }) {
  const { plan2, days } = copy.why;
  const cells = [C.pink, C.yellow, C.cyan, C.lime, C.purple, C.orange, C.blue];
  return (
    <Stage>
      <Mosaic panels={PANELS_2} f={f + 20} seed="w2" />
      <Note f={f} height={760} shadow={C.cyan}>
        <Tag text={plan2[0].replace("：", "")} bg={C.pink} size={46} style={{ position: "relative", display: "inline-flex" }} />
        <div style={{ marginTop: 24 }}>
          <Banner bg={C.yellow} size={72} shadow={C.ink} pad={[8, 22]}>
            {plan2[1]}
          </Banner>
        </div>
        {/* a week, every slot booked */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginTop: 34 }}>
          {days.map((d) => (
            <div key={d} style={{ fontSize: 34, fontWeight: 900, textAlign: "center", color: C.ink }}>
              {d}
            </div>
          ))}
          {Array.from({ length: 7 * 5 }, (_, i) => {
            const at = sec(WHY.land) + 4 + (i % 7) * 0.6 + Math.floor(i / 7) * 0.9;
            return <div key={i} style={{ height: 50, background: f >= at ? cells[(i * 3) % 7] : C.paper, border: `5px solid ${C.ink}` }} />;
          })}
        </div>
      </Note>
      <BoxCaption lines={copy.why.plan2Caption} f={f} at={WHY.caption} size={92} bg={C.yellow} shadow={C.ink} style={{ left: 50, top: 1040 }} />
    </Stage>
  );
}

export function Shot2Why() {
  const f = useCurrentFrame();
  return f < sec(WHY.plan2) ? <Plan1 f={f} /> : <Plan2 f={f - sec(WHY.plan2)} />;
}
