import { Easing, interpolate, random, useCurrentFrame } from "remotion";

import { Rich } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { MemberForm, Stamp, TaskNote } from "../parts";
import { CUES, D, color, ease, sec } from "../theme";

export const HOOK_D_FRAMES = sec(CUES.why - CUES.hook);

// Hook D, 6 s in beats of 3, 3, 1, 5: the 已关闭 stamp slams onto 成员申请 and the frame holds (the
// stamp is the caption); 1.5 s 我们不再接受成员申请了, held; half a beat of silence; 3.5 s a flash and
// a zoom punch into the open board: 因为，你已经是了。, huge and green, held to read twice.

const STAMP_X = 540;
const STAMP_Y = 760;

/** The form with the stamp at frame `f` (0 = the stamp in the air). Also the cover. */
export function Closed({ f, line = true }: { f: number; line?: boolean }) {
  const fall = interpolate(f, [0, D.slam], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const after = f - D.slam;
  const shake = after >= 0 && after < 7 ? (random(`k${f}`) - 0.5) * 34 * (1 - after / 7) : 0;
  const creep = interpolate(f, [D.line1, D.cut], [1, 1.05], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const chips =
    after >= 0 && after < 16
      ? Array.from({ length: 18 }, (_, i) => {
          const a = (i / 18) * Math.PI * 2 + random(`a${i}`) * 0.4;
          const d = 220 + after * (15 + random(`v${i}`) * 18);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: STAMP_X + Math.cos(a) * d,
                top: STAMP_Y + Math.sin(a) * d * 0.7 + after * after,
                width: 20 + random(`w${i}`) * 28,
                height: 12 + random(`h${i}`) * 18,
                background: i % 3 ? color.paper : color.ink,
                border: `2px solid ${color.ink}`,
                transform: `rotate(${random(`r${i}`) * 360 + after * 30}deg)`,
                opacity: 1 - after / 16,
              }}
            />
          );
        })
      : null;
  const lp = line ? progress(f, D.line1, 8, ease.spring) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${shake}px, ${shake * 0.6}px) scale(${creep})`, transformOrigin: "50% 45%" }}>
      <MemberForm title={copy.d.formTitle} width={960} height={1300} style={{ position: "absolute", left: 60, top: 70, transform: "rotate(-1.5deg)" }} />
      <div
        style={{
          position: "absolute",
          left: STAMP_X,
          top: STAMP_Y - (1 - fall) * 300,
          transform: `translate(-50%, -50%) rotate(${-16 + (1 - fall) * 12}deg) scale(${3 - 2 * fall})`,
          opacity: 0.35 + 0.65 * fall,
        }}
      >
        <Stamp big={copy.d.stamp} small={copy.d.stampSub} size={240} />
      </div>
      {chips}
      {lp > 0 ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 360, background: color.ink, color: color.paper, padding: "44px 72px", transform: `translateY(${(1 - lp) * 100}%)` }}>
          {copy.d.line1.map((l) => (
            <div key={l} style={{ fontSize: 124, fontWeight: 900, lineHeight: 1.14, letterSpacing: -3, whiteSpace: "nowrap" }}>
              {l}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
  const punch = interpolate(a, [0, 7], [1.25, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const flash = a < 3 ? 1 - a / 3 : 0;
  return (
    <Stage bg={color.ink} fg={color.paper}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${punch})`, transformOrigin: "50% 30%" }}>
        {copy.d.rows.map((row, i) => {
          const p = progress(a, 8 + i * 3, 8, ease.spring);
          return (
            <TaskNote
              key={row[0]}
              row={row}
              width={930}
              style={{ position: "absolute", left: 75 + (i % 2 ? 14 : -6), top: 540 + i * 108 + (1 - p) * 260, transform: `rotate(${(random(`t${i}`) - 0.5) * 3}deg)`, opacity: Math.min(1, p * 1.5) }}
            />
          );
        })}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 530, background: color.ink }} />
        <div style={{ position: "absolute", left: 72, right: 40, top: 100 }}>
          <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.2, letterSpacing: -1 }}>{copy.d.line2[0]}</div>
          <div style={{ fontSize: 158, fontWeight: 900, lineHeight: 1.12, letterSpacing: -4, whiteSpace: "nowrap" }}>
            <Rich text={copy.d.line2[1]!} accent={color.signal} />
          </div>
        </div>
      </div>
      {flash > 0 ? <div style={{ position: "absolute", inset: -400, background: color.paper, opacity: flash }} /> : null}
    </Stage>
  );
}
