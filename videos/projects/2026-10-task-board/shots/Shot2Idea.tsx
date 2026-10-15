import { random, useCurrentFrame } from "remotion";

import { Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { CUES, IDEA, color, ease, sec } from "../theme";

// 0:10–0:14 · The idea: the two struck-out notes fly off, and the 18 open tasks sort themselves
// into their areas — an open, self-organizing board. Real ids, titles and areas.
export const SHOT2_FRAMES = sec(CUES.trial - CUES.idea);

const COL_W = 200;
const CARD_H = 118;
const colX = (c: number) => 24 + c * 210;
const cardY = (k: number) => 600 + k * 128;

export function Shot2Idea() {
  const f = useCurrentFrame();
  const { caption, sub, columns, titles } = copy.idea;
  let n = 0;
  return (
    <Stage bg={color.ink} fg={color.paper}>
      {columns.map(([area, ids], c) => (
        <div key={area} style={{ position: "absolute", left: colX(c), top: 540, width: COL_W, fontFamily: monoFamily, fontSize: 28, color: color.signal, opacity: progress(f, sec(IDEA.fly), 8), borderBottom: `3px solid ${color.signal}`, paddingBottom: 8 }}>
          {area} <span style={{ color: color.muted }}>{ids.length}</span>
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
          const x = sx + (colX(c) - sx) * p;
          const y = sy + (cardY(k) - sy) * p;
          return (
            <div
              key={id}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: COL_W,
                height: CARD_H,
                background: color.paper,
                color: color.ink,
                border: `3px solid ${color.ink}`,
                padding: "10px 12px",
                transform: `rotate(${sr * (1 - p)}deg)`,
                overflow: "hidden",
              }}
            >
              <div style={{ fontFamily: monoFamily, fontSize: 20, color: color.muted }}>{id}</div>
              <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.15, marginTop: 4 }}>{titles[id as keyof typeof titles]}</div>
            </div>
          );
        }),
      )}
      {[-1, 1].map((d) => {
        const p = progress(f, sec(IDEA.sweep), 14);
        return p < 1 ? (
          <div key={d} style={{ position: "absolute", left: 300 + d * 120 + d * 1300 * p, top: 640, width: 480, height: 340, background: color.paper, border: `5px solid ${color.ink}`, transform: `rotate(${d * (6 + 40 * p)}deg)`, opacity: 0.7 }}>
            <div style={{ position: "absolute", left: -10, right: -10, top: "50%", height: 14, background: color.ink, transform: "rotate(-20deg)" }} />
          </div>
        ) : null;
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 520, background: color.ink }} />
      <div style={{ position: "absolute", left: 72, right: 40, top: 90 }}>
        {caption.map((line, k) => {
          const p = progress(f, sec(IDEA.caption) + k * 3, 7, ease.spring);
          return (
            <div key={line} style={{ fontSize: 104, fontWeight: 900, lineHeight: 1.14, letterSpacing: -3, whiteSpace: "nowrap", opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Rich text={line} accent={color.signal} />
            </div>
          );
        })}
        <div style={{ marginTop: 22, fontSize: 44, fontWeight: 600, color: "#cfcfcf", opacity: progress(f, sec(IDEA.sub), 7), whiteSpace: "nowrap" }}>
          <Rich text={sub} accent={color.signal} />
        </div>
      </div>
    </Stage>
  );
}
