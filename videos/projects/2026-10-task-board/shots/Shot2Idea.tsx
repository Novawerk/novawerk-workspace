import { random, useCurrentFrame } from "remotion";

import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { Banner, BoxCaption, C, Mosaic, OUT, Star, pop, type PanelSpec } from "../collage";
import { copy } from "../copy";
import { CUES, IDEA, ease, sec } from "../theme";

// 0:10.5–0:14.5 · The idea, as a collage: the two struck-out notes fly off, and the 18 open tasks
// sort themselves into their areas on a board — open and self-organizing. Real ids, titles, areas.
export const SHOT2_FRAMES = sec(CUES.trial - CUES.idea);

const COL_W = 196;
const CARD_H = 118;
const colX = (c: number) => 30 + c * 206;
const cardY = (k: number) => 588 + k * 128;
const COLS = [C.pink, C.yellow, C.cyan, C.lime, C.orange];

const PANELS: readonly PanelSpec[] = [
  { x: 0, y: 0, w: 1080, h: 480, fill: { kind: "halftone", a: "#2a2a33", b: C.ink, size: 30 } },
  { x: 0, y: 480, w: 1080, h: 890, fill: { kind: "grid", a: "#e4e4e7", b: C.paper, size: 40 } },
  { x: 0, y: 1370, w: 1080, h: 70, fill: { kind: "stripes", a: C.yellow, b: C.ink, size: 40 } },
];

export function Shot2Idea() {
  const f = useCurrentFrame();
  const { caption, sub, columns, titles } = copy.idea;
  let n = 0;
  return (
    <Stage bg={C.ink} fg={C.paper}>
      <Mosaic panels={PANELS} f={f + 20} seed="i" />
      {columns.map(([area, ids], c) => (
        <div key={area} style={{ position: "absolute", left: colX(c), top: 500, width: COL_W - 14, ...pop(f, sec(IDEA.fly) + c * 2, c % 2 ? 2 : -2) }}>
          <div style={{ background: COLS[c], color: C.ink, border: `5px solid ${C.ink}`, boxShadow: `6px 6px 0 ${C.ink}`, fontFamily: monoFamily, fontSize: 30, fontWeight: 700, padding: "4px 12px", display: "flex", justifyContent: "space-between" }}>
            <span>{area}</span>
            <span>{ids.length}</span>
          </div>
        </div>
      ))}
      {columns.flatMap(([, ids], c) =>
        ids.map((id, k) => {
          const i = n++;
          const p = progress(f, sec(IDEA.fly + i * IDEA.flyStep), 12, ease.spring);
          // Start: scattered where the hook's board left them.
          const sx = 80 + random(`sx${i}`) * 720;
          const sy = 560 + random(`sy${i}`) * 700;
          const sr = (random(`sr${i}`) - 0.5) * 30;
          return (
            <div
              key={id}
              style={{
                position: "absolute",
                left: sx + (colX(c) - sx) * p,
                top: sy + (cardY(k) - sy) * p,
                width: COL_W - 14,
                height: CARD_H - 10,
                boxSizing: "border-box",
                background: C.paper,
                color: C.ink,
                border: `4px solid ${C.ink}`,
                boxShadow: `7px 7px 0 ${COLS[c]}`,
                padding: "8px 10px",
                transform: `rotate(${sr * (1 - p)}deg)`,
                overflow: "hidden",
              }}
            >
              <div style={{ fontFamily: monoFamily, fontSize: 19, color: "#5c5c5c" }}>{id}</div>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15, marginTop: 2 }}>{titles[id as keyof typeof titles]}</div>
            </div>
          );
        }),
      )}
      {[-1, 1].map((d) => {
        const p = progress(f, sec(IDEA.sweep), 14);
        return p < 1 ? (
          <div key={d} style={{ position: "absolute", left: 300 + d * 120 + d * 1300 * p, top: 680, width: 480, height: 340, background: C.paper, border: `${OUT}px solid ${C.ink}`, boxShadow: `14px 14px 0 ${d < 0 ? C.pink : C.cyan}`, transform: `rotate(${d * (6 + 40 * p)}deg)` }}>
            <div style={{ position: "absolute", left: -10, right: -10, top: "50%", height: 22, background: C.ink, transform: "rotate(-20deg)" }} />
          </div>
        ) : null;
      })}
      <div style={{ ...pop(f, sec(IDEA.caption), -3), position: "absolute", left: 40, top: 46 }}>
        <Banner bg={C.yellow} size={78} shadow={C.pink} pad={[8, 24]}>
          {caption[0]}
        </Banner>
      </div>
      <BoxCaption lines={[caption[1]!]} f={f} at={IDEA.caption + 0.1} size={124} bg={C.ink} fg={C.paper} accent={C.signal} shadow={C.pink} rot={-1} style={{ left: 30, top: 180, border: `${OUT}px solid ${C.paper}` }} />
      <BoxCaption lines={[sub]} f={f} at={IDEA.sub} size={40} bg={C.paper} shadow={C.cyan} rot={0} style={{ left: 40, top: 378 }} />
      <div style={{ ...pop(f, sec(IDEA.caption) + 6, 0), position: "absolute", left: 900, top: 40 }}>
        <Star d={140} />
      </div>
    </Stage>
  );
}
