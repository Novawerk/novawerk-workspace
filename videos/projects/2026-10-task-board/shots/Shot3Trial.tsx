import { random, useCurrentFrame } from "remotion";

import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { BoxCaption, Bot, Builder, C, Laptop, Mosaic, OUT, SolidStamp, Star, Tag, pop, type PanelSpec } from "../collage";
import { copy } from "../copy";
import { CUES, TRIAL, ease, sec } from "../theme";

// 0:14.5–0:29.5 · The trial run on our own site, as collages (real labels, marked 示意): /contribute,
// the board (five real tasks), the short flow (Task: NW-11 → merged → +8 Werk, thanks not money),
// and your coding agent: robot stickers carrying notes, a red 待你确认 stamp.
export const SHOT3_FRAMES = sec(CUES.tower - CUES.trial);

type Fill = PanelSpec["fill"];
/** A frame of panels around a white middle: a top band for the caption, sides, a bottom band. */
const frame = (top: Fill, left: Fill, right: Fill, bottom: Fill, topH = 380, bottomY = 1240): PanelSpec[] => [
  { x: 0, y: 0, w: 1080, h: topH, fill: top },
  { x: 0, y: topH, w: 60, h: bottomY - topH, fill: left },
  { x: 1020, y: topH, w: 60, h: bottomY - topH, fill: right },
  { x: 0, y: bottomY, w: 1080, h: 1440 - bottomY, fill: bottom },
  { x: 60, y: topH, w: 960, h: bottomY - topH, fill: { kind: "solid", a: C.paper } },
];

const SITE = frame({ kind: "checker", a: C.yellow, b: C.paper, size: 40 }, { kind: "stripes", a: C.pink, b: C.paper, size: 30 }, { kind: "dots", a: C.ink, b: C.cyan, size: 28 }, { kind: "waves", a: C.purple, b: C.lime, size: 40 });
const TASKS = frame({ kind: "dots", a: C.paper, b: C.pink, size: 36 }, { kind: "grid", a: C.ink, b: C.yellow, size: 28 }, { kind: "checker", a: C.purple, b: C.paper, size: 28 }, { kind: "stripes", a: C.lime, b: C.blue, size: 44 }, 410, 1300);
const FLOW = frame({ kind: "stripes", a: C.cyan, b: C.paper, size: 40 }, { kind: "halftone", a: C.orange, b: C.yellow, size: 30 }, { kind: "waves", a: C.pink, b: C.paper, size: 30 }, { kind: "checker", a: C.ink, b: C.lime, size: 40 }, 350, 1150);
const AGENT: readonly PanelSpec[] = [
  { x: 0, y: 0, w: 1080, h: 1440, fill: { kind: "halftone", a: "#2a2a33", b: C.ink, size: 30 } },
  { x: 0, y: 1180, w: 1080, h: 260, fill: { kind: "stripes", a: C.yellow, b: C.ink, size: 44 } },
];

const SIZE_FILL: Record<string, string> = { XL: C.pink, L: C.yellow, M: C.cyan, S: C.lime };
const Mark = () => <Tag text={copy.illustration} bg={C.paper} size={34} rot={4} style={{ right: 30, top: 20 }} />;

function Site({ f }: { f: number }) {
  const t = copy.trial;
  const card = progress(f, 6, 10, ease.spring);
  return (
    <Stage>
      <Mosaic panels={SITE} f={f + 20} seed="ts" />
      <BoxCaption lines={t.caption} f={f} at={TRIAL.site + 0.1} size={84} bg={C.paper} shadow={C.pink} style={{ left: 40, top: 60 }} />
      <div style={{ position: "absolute", left: 100, top: 430, width: 880, height: 740, background: C.paper, border: `${OUT + 1}px solid ${C.ink}`, boxShadow: `20px 20px 0 ${C.ink}`, transform: `translateY(${(1 - card) * 120}px) rotate(-1deg)`, opacity: card }}>
        <div style={{ height: 56, background: C.purple, borderBottom: `${OUT}px solid ${C.ink}`, display: "flex", alignItems: "center", gap: 14, padding: "0 22px" }}>
          {[C.pink, C.yellow, C.lime].map((c) => (
            <div key={c} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: `4px solid ${C.ink}` }} />
          ))}
        </div>
        <div style={{ padding: "50px 54px", color: C.ink }}>
          <div style={{ fontFamily: monoFamily, fontSize: 32, color: "#5c5c5c" }}>{t.eyebrow}</div>
          <div style={{ marginTop: 20, fontSize: 90, fontWeight: 800, lineHeight: 1.06, letterSpacing: -3 }}>
            <div>{t.hero[0]}</div>
            <div>
              <span style={{ color: C.green, fontStyle: "italic" }}>{t.hero[1]}</span> {t.hero[2]}
            </div>
          </div>
          <div style={{ display: "flex", gap: 22, marginTop: 56 }}>
            {t.buttons.map((b, k) => (
              <div key={b} style={{ ...pop(f, 30 + k * 15, 0), fontSize: 36, fontWeight: 800, padding: "20px 30px", border: `${OUT - 1}px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.ink}`, background: k ? C.paper : C.green, color: k ? C.ink : C.paper }}>
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ ...pop(f, 40, 8), position: "absolute", left: 820, top: 1180 }}>
        <Star d={170} />
      </div>
      <Mark />
    </Stage>
  );
}

function Tasks({ f }: { f: number }) {
  const t = copy.trial;
  return (
    <Stage>
      <Mosaic panels={TASKS} f={f + 20} seed="tt" />
      <BoxCaption lines={t.tasksCaption} f={f} at={0.1} size={100} bg={C.paper} shadow={C.ink} style={{ left: 40, top: 40 }} />
      {f >= sec(2.6) ? <Tag text={t.tasksSub} bg={C.cyan} size={42} rot={-2} style={{ left: 600, top: 320, ...pop(f, sec(2.6), -2) }} /> : null}
      {t.tasks.map((row, i) => {
        const at = sec(0.5 + i * TRIAL.taskStep);
        if (f < at) return null;
        const p = progress(f, at, 7, ease.spring);
        const [id, name, badge] = row;
        const size = badge.split(" ")[0]!;
        return (
          <div key={id} style={{ position: "absolute", left: 90, top: 450 + i * 162, width: 900, display: "flex", alignItems: "center", gap: 20, background: C.paper, color: C.ink, border: `5px solid ${C.ink}`, boxShadow: `10px 10px 0 ${SIZE_FILL[size]}`, padding: "18px 22px", transform: `rotate(${(random(`r${i}`) - 0.5) * 3}deg) scale(${1.2 - 0.2 * p})`, opacity: Math.min(1, p * 1.4) }}>
            <span style={{ fontFamily: monoFamily, fontSize: 28, color: "#5c5c5c", flex: "none" }}>{id}</span>
            <span style={{ fontSize: 34, fontWeight: 800, flex: 1, lineHeight: 1.18 }}>{name}</span>
            <span style={{ fontFamily: monoFamily, fontSize: 28, fontWeight: 700, background: SIZE_FILL[size], border: `4px solid ${C.ink}`, padding: "2px 12px", flex: "none" }}>{badge}</span>
          </div>
        );
      })}
      <Mark />
    </Stage>
  );
}

function Flow({ f }: { f: number }) {
  const t = copy.trial;
  const rel = (s: number) => sec(s - TRIAL.flow);
  const typed = t.prLine.slice(0, Math.max(0, f - rel(TRIAL.typing)));
  const dots = [C.pink, C.yellow, C.cyan, C.lime, C.orange];
  return (
    <Stage>
      <Mosaic panels={FLOW} f={f + 20} seed="tf" />
      <BoxCaption lines={t.flowCaption} f={f} at={0.1} size={84} bg={C.yellow} shadow={C.ink} style={{ left: 40, top: 50 }} />
      {t.steps.map((label, i) => {
        const lit = f >= rel(TRIAL.steps[i]!);
        const on = progress(f, rel(TRIAL.steps[i]!), 6, ease.spring);
        return (
          <div key={label} style={{ position: "absolute", left: 90, top: 380 + i * 150, width: 900, height: 120, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 26, padding: "0 26px", background: C.paper, border: `5px solid ${lit ? C.ink : "#c4c4cb"}`, boxShadow: lit ? `10px 10px 0 ${dots[i]}` : "none", color: lit ? C.ink : "#b4b4bb", transform: `scale(${0.97 + 0.03 * on})` }}>
            <div style={{ width: 70, height: 70, flex: "none", display: "grid", placeItems: "center", borderRadius: "50%", background: lit ? dots[i] : C.paper, border: `5px solid ${lit ? C.ink : "#c4c4cb"}`, fontFamily: monoFamily, fontSize: 36, fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 46, fontWeight: 900, whiteSpace: "nowrap" }}>{label}</div>
            {i === 3 && lit ? (
              <div style={{ fontFamily: monoFamily, fontSize: 40, fontWeight: 700, background: C.ink, color: C.paper, padding: "8px 16px", minWidth: 290, border: `4px solid ${C.ink}` }}>
                {typed}
                {typed.length < t.prLine.length && Math.floor(f / 6) % 2 === 0 ? "▌" : ""}
              </div>
            ) : null}
            {i === 4 && f >= rel(TRIAL.werk) ? (
              <div style={{ ...pop(f, rel(TRIAL.werk), -4), marginLeft: "auto", fontFamily: monoFamily, fontSize: 52, fontWeight: 700, color: C.paper, background: C.green, border: `5px solid ${C.ink}`, boxShadow: `8px 8px 0 ${C.ink}`, padding: "4px 20px" }}>{t.werk}</div>
            ) : null}
          </div>
        );
      })}
      <BoxCaption lines={[t.thanks]} f={f} at={TRIAL.thanks - TRIAL.flow} size={58} bg={C.paper} shadow={C.pink} style={{ left: 40, top: 1200 }} />
      <Mark />
    </Stage>
  );
}

const BOTS = [
  { enter: 0.1, y: 960, h: 250, speed: 9, dir: 1, body: C.cyan },
  { enter: 0.4, y: 1080, h: 190, speed: 11, dir: -1, body: C.pink },
  { enter: 0.7, y: 1010, h: 160, speed: 13, dir: 1, body: C.lime },
] as const;

function Agent({ f }: { f: number }) {
  const t = copy.trial;
  const at = sec(0.9);
  const stamp = progress(f, at, 6, ease.spring);
  return (
    <Stage bg={C.ink} fg={C.paper}>
      <Mosaic panels={AGENT} f={f + 20} seed="ta" />
      <BoxCaption lines={t.agentCaption} f={f} at={0.05} size={110} bg={C.ink} fg={C.paper} accent={C.signal} shadow={C.pink} style={{ left: 40, top: 60, border: `${OUT}px solid ${C.paper}` }} />
      <BoxCaption lines={[t.agentSub]} f={f} at={0.5} size={44} bg={C.paper} shadow={C.cyan} rot={0} style={{ left: 40, top: 420 }} />
      {BOTS.map((b, i) => {
        const e = sec(b.enter);
        if (f < e) return null;
        const w = (b.h * 160) / 220;
        const x = b.dir > 0 ? -w + b.speed * (f - e) : 1080 + b.speed * -(f - e);
        const hop = Math.abs(Math.sin((f - e) / 3)) * 14;
        return <Bot key={i} h={b.h} body={b.body} style={{ left: x, top: b.y - hop, transform: b.dir < 0 ? "scaleX(-1)" : undefined }} />;
      })}
      <div style={{ ...pop(f, 4, 0), position: "absolute", left: 860, top: 1240 }}>
        <Builder h={170} body={C.purple} hat={C.yellow} brick={C.orange} />
      </div>
      {stamp > 0 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 590, display: "flex", justifyContent: "center" }}>
          <SolidStamp big={t.waiting} size={130} style={{ transform: `rotate(-7deg) scale(${2.2 - 1.2 * stamp})`, opacity: Math.min(1, stamp * 2) }} />
        </div>
      ) : null}
      <div style={{ ...pop(f, 2, -8), position: "absolute", left: 790, top: 260 }}>
        <Laptop w={250} screen={C.purple} />
      </div>
    </Stage>
  );
}

export function Shot3Trial() {
  const f = useCurrentFrame();
  if (f < sec(TRIAL.tasks)) return <Site f={f} />;
  if (f < sec(TRIAL.flow)) return <Tasks f={f - sec(TRIAL.tasks)} />;
  if (f < sec(TRIAL.agent)) return <Flow f={f - sec(TRIAL.flow)} />;
  return <Agent f={f - sec(TRIAL.agent)} />;
}
