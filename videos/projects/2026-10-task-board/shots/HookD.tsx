import { Easing, interpolate, random, useCurrentFrame } from "remotion";

import { Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { Badge, Banner, Builder, Bricks, C, Keyboard, Laptop, Mosaic, OUT, PrCard, SolidStamp, Star, Tag, pop, type PanelSpec } from "../collage";
import { copy } from "../copy";
import { Burst } from "../memphis";
import { CUES, D, ease, sec } from "../theme";

export const HOOK_D_FRAMES = sec(CUES.why - CUES.hook);

// Hook D, 6 s in beats of 3, 3, 1, 5, as a Memphis collage: the 成员申请 form sits among patterned
// panels and stickers (laptop, keyboard, star, a builder); the 已关闭 stamp slams and shapes burst;
// 1.5 s a pink banner 我们不再接受成员申请了, held; half a beat of silence; 3.5 s a cut into a second
// collage: 因为，/ 你已经是了。 in a big ink box, the open tasks on a board, a merged PR, bricks.

const STAMP_X = 540;
const STAMP_Y = 720;

const PANELS_A: readonly PanelSpec[] = [
  { x: 0, y: 0, w: 400, h: 250, fill: { kind: "checker", a: C.yellow, b: C.paper, size: 40 } },
  { x: 400, y: 0, w: 380, h: 180, fill: { kind: "stripes", a: C.pink, b: C.paper, size: 36 } },
  { x: 780, y: 0, w: 300, h: 300, fill: { kind: "dots", a: C.ink, b: C.cyan, size: 34 } },
  { x: 0, y: 250, w: 170, h: 560, fill: { kind: "waves", a: C.purple, b: C.lime, size: 40 } },
  { x: 910, y: 300, w: 170, h: 480, fill: { kind: "halftone", a: C.orange, b: C.yellow, size: 34 } },
  { x: 0, y: 810, w: 220, h: 360, fill: { kind: "grid", a: C.ink, b: C.cyan, size: 36 } },
  { x: 860, y: 780, w: 220, h: 390, fill: { kind: "checker", a: C.purple, b: C.paper, size: 34 } },
  { x: 0, y: 1170, w: 560, h: 270, fill: { kind: "stripes", a: C.lime, b: C.blue, size: 44 } },
  { x: 560, y: 1170, w: 520, h: 270, fill: { kind: "dots", a: C.paper, b: C.pink, size: 40 } },
  { x: 150, y: 170, w: 780, h: 1000, fill: { kind: "solid", a: C.blue } },
];

const PANELS_B: readonly PanelSpec[] = [
  { x: 0, y: 0, w: 1080, h: 520, fill: { kind: "halftone", a: "#2a2a33", b: C.ink, size: 30 } },
  { x: 0, y: 520, w: 190, h: 560, fill: { kind: "checker", a: C.cyan, b: C.ink, size: 38 } },
  { x: 890, y: 520, w: 190, h: 560, fill: { kind: "dots", a: C.yellow, b: C.pink, size: 36 } },
  { x: 0, y: 1080, w: 380, h: 360, fill: { kind: "waves", a: C.lime, b: C.purple, size: 40 } },
  { x: 380, y: 1300, w: 700, h: 140, fill: { kind: "stripes", a: C.yellow, b: C.ink, size: 40 } },
  { x: 890, y: 1080, w: 190, h: 220, fill: { kind: "grid", a: C.ink, b: C.orange, size: 34 } },
  { x: 190, y: 520, w: 700, h: 780, fill: { kind: "solid", a: C.paper } },
];

/** The member application as a collage card: a banner title, empty fields, an ink button. */
function Form() {
  return (
    <div style={{ position: "absolute", left: 190, top: 220, width: 700, height: 880, background: C.paper, border: `${OUT + 1}px solid ${C.ink}`, boxShadow: `18px 18px 0 ${C.ink}`, padding: "56px 54px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 34, transform: "rotate(-2deg)" }}>
      <Banner bg={C.yellow} size={150} shadow={C.pink} pad={[10, 26]} style={{ alignSelf: "flex-start" }}>
        {copy.d.formTitle}
      </Banner>
      {[0, 1, 2].map((k) => (
        <div key={k} style={{ display: "grid", gap: 12 }}>
          <div style={{ width: 160 + k * 60, height: 20, background: [C.cyan, C.lime, C.orange][k], border: `4px solid ${C.ink}` }} />
          <div style={{ height: 78, border: `${OUT - 1}px solid ${C.ink}`, background: C.paper }} />
        </div>
      ))}
      <div style={{ marginTop: "auto", height: 104, background: C.ink, border: `${OUT}px solid ${C.ink}`, boxShadow: `10px 10px 0 ${C.purple}` }} />
    </div>
  );
}

/** The form with the stamp at frame `f` (0 = the stamp in the air). Also the cover. */
/** `banner`: show the line-1 banner already in place (the cover). */
export function Closed({ f, line = true, banner = false }: { f: number; line?: boolean; banner?: boolean }) {
  const fall = interpolate(f, [0, D.slam], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const after = f - D.slam;
  const shake = after >= 0 && after < 7 ? (random(`k${f}`) - 0.5) * 34 * (1 - after / 7) : 0;
  const lp = banner ? 1 : line ? progress(f, D.line1, 8, ease.spring) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
      <Mosaic panels={PANELS_A} f={f} seed="a" spread={6} />
      <div style={{ ...pop(f, 2, -7), position: "absolute", left: 6, top: 18 }}>
        <Laptop w={360} />
      </div>
      <div style={{ ...pop(f, 3, 0), position: "absolute", left: 850, top: 40 }}>
        <Star d={190} />
      </div>
      <Tag text="任务板" bg={C.cyan} size={46} style={{ left: 450, top: 52, ...pop(f, 4, -3) }} />
      <Form />
      <Badge text="开源" bg={C.pink} d={160} style={{ left: 905, top: 330, ...pop(f, 5, 12) }} />
      <div style={{ ...pop(f, 6, 0), position: "absolute", left: 870, top: 880 }}>
        <Builder h={250} />
      </div>
      <div style={{ ...pop(f, 7, -5), position: "absolute", left: 30, top: 1060 }}>
        <Keyboard w={430} />
      </div>
      <div style={{ ...pop(f, 7, 4), position: "absolute", left: 20, top: 520 }}>
        <Bricks w={150} />
      </div>
      <div
        style={{
          position: "absolute",
          left: STAMP_X,
          top: STAMP_Y - (1 - fall) * 300,
          transform: `translate(-50%, -50%) rotate(${-14 + (1 - fall) * 12}deg) scale(${3 - 2 * fall})`,
          opacity: 0.35 + 0.65 * fall,
        }}
      >
        <SolidStamp big={copy.d.stamp} small={copy.d.stampSub} size={200} />
      </div>
      <Burst x={STAMP_X} y={STAMP_Y} after={after} />
      {lp > 0 ? (
        <div style={{ position: "absolute", left: 40, top: 1110, transform: `translateY(${(1 - lp) * 340}px) rotate(-2deg)` }}>
          <Banner bg={C.pink} size={108} shadow={C.ink} pad={[16, 34]}>
            {copy.d.line1.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </Banner>
        </div>
      ) : null}
    </div>
  );
}

const SIZE_FILL: Record<string, string> = { XL: C.pink, L: C.yellow, M: C.cyan, S: C.lime };

export function HookD() {
  const f = useCurrentFrame();
  if (f < D.cut) {
    return (
      <Stage>
        <Closed f={f} />
      </Stage>
    );
  }
  const a = f - D.cut;
  const punch = interpolate(a, [0, 7], [1.2, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <Stage bg={C.ink} fg={C.paper}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${punch})`, transformOrigin: "50% 30%" }}>
        <Mosaic panels={PANELS_B} f={a + 20} seed="b" />
        <div style={{ position: "absolute", left: 222, top: 556, width: 636, display: "flex", flexDirection: "column", gap: 14 }}>
          {copy.d.rows.slice(0, 6).map((row, i) => {
            const p = progress(a, 8 + i * 3, 8, ease.spring);
            const [id, name, size] = row;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 16, background: C.paper, color: C.ink, border: `5px solid ${C.ink}`, boxShadow: `8px 8px 0 ${SIZE_FILL[size]}`, padding: "12px 16px", transform: `translateY(${(1 - p) * 200}px) rotate(${(random(`t${i}`) - 0.5) * 2.5}deg)`, opacity: Math.min(1, p * 1.5) }}>
                <span style={{ fontFamily: monoFamily, fontSize: 24, color: "#5c5c5c", flex: "none" }}>{id}</span>
                <span style={{ fontSize: 30, fontWeight: 800, flex: 1, lineHeight: 1.15 }}>{name}</span>
                <span style={{ fontFamily: monoFamily, fontSize: 26, fontWeight: 700, background: SIZE_FILL[size], border: `4px solid ${C.ink}`, padding: "0 10px", flex: "none" }}>{size}</span>
              </div>
            );
          })}
        </div>
        <div style={{ ...pop(a, 2, -4), position: "absolute", left: 40, top: 70 }}>
          <Banner bg={C.yellow} size={84} shadow={C.pink} pad={[8, 26]}>
            {copy.d.line2[0]}
          </Banner>
        </div>
        <div style={{ ...pop(a, 4, -2), position: "absolute", left: 30, top: 250 }}>
          <Banner bg={C.ink} fg={C.paper} size={150} shadow={C.pink} pad={[14, 30]} style={{ border: `${OUT + 1}px solid ${C.paper}` }}>
            <Rich text={copy.d.line2[1]!} accent={C.signal} />
          </Banner>
        </div>
        <div style={{ ...pop(a, 3, 0), position: "absolute", left: 880, top: 40 }}>
          <Star d={150} />
        </div>
        <div style={{ ...pop(a, 14, 0), position: "absolute", left: 20, top: 1090 }}>
          <Builder h={300} body={C.orange} hat={C.lime} brick={C.cyan} />
        </div>
        <PrCard w={400} style={{ left: 640, top: 1110, ...pop(a, 18, 5) }} />
        <div style={{ ...pop(a, 22, -3), position: "absolute", left: 300, top: 1290 }}>
          <Bricks w={240} />
        </div>
      </div>
      {a < 2 ? <div style={{ position: "absolute", inset: -400, background: C.paper, opacity: 1 - a / 2 }} /> : null}
    </Stage>
  );
}
