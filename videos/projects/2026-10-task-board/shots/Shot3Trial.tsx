import { random, useCurrentFrame } from "remotion";

import { Rich } from "../../../kit/brand";
import { monoFamily } from "../../../kit/fonts";
import { Stage, progress } from "../../../kit/motion";
import { Robots, type Robot } from "../../../kit/robots";
import { copy } from "../copy";
import { TaskNote } from "../parts";
import { CUES, SAFE, TRIAL, color, ease, sec } from "../theme";

// 0:14–0:29 · The trial run on our own site: /contribute, the board (five real tasks), the short
// flow (Task: NW-11 → merged → +8 Werk, thanks not money), and your coding agent.
export const SHOT3_FRAMES = sec(CUES.tower - CUES.trial);

function Caption({ lines, at, f, size = 104, accent = color.accent }: { lines: readonly string[]; at: number; f: number; size?: number; accent?: string }) {
  return (
    <div style={{ position: "absolute", left: 72, right: 40, top: 80 }}>
      {lines.map((line, k) => {
        const p = progress(f, sec(at) + k * 3, 7, ease.spring);
        return (
          <div key={line} style={{ fontSize: size, fontWeight: 900, lineHeight: 1.14, letterSpacing: -3, whiteSpace: "nowrap", opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            <Rich text={line} accent={accent} />
          </div>
        );
      })}
    </div>
  );
}

const Tag = () => <div style={{ position: "absolute", right: 56, top: 40, fontSize: 26, color: color.muted }}>{copy.illustration}</div>;

function Site({ f }: { f: number }) {
  const t = copy.trial;
  const card = progress(f, 6, 10, ease.spring);
  return (
    <Stage>
      <Tag />
      <Caption lines={t.caption} at={TRIAL.site + 0.1} f={f} />
      <div style={{ position: "absolute", left: 70, right: 70, top: 440, height: 760, background: color.paper, border: `4px solid ${color.ink}`, transform: `translateY(${(1 - card) * 120}px) rotate(-1deg)`, opacity: card }}>
        <div style={{ height: 56, borderBottom: `3px solid ${color.ink}`, display: "flex", alignItems: "center", gap: 12, padding: "0 22px" }}>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ width: 16, height: 16, border: `3px solid ${color.ink}` }} />
          ))}
        </div>
        <div style={{ padding: "54px 56px" }}>
          <div style={{ fontFamily: monoFamily, fontSize: 30, color: color.muted }}>{t.eyebrow}</div>
          <div style={{ marginTop: 22, fontSize: 92, fontWeight: 700, lineHeight: 1.06, letterSpacing: -3 }}>
            <div>{t.hero[0]}</div>
            <div>
              <span style={{ color: color.accent, fontStyle: "italic", display: "inline-block", transform: `scale(${0.9 + 0.1 * progress(f, 22, 8, ease.spring)})`, transformOrigin: "0 70%" }}>{t.hero[1]}</span> {t.hero[2]}
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 56 }}>
            {t.buttons.map((b, k) => {
              const on = progress(f, 30 + k * 15, 6, ease.spring);
              return (
                <div key={b} style={{ fontSize: 34, fontWeight: 700, padding: "20px 30px", border: `3px solid ${k ? color.lineStrong : color.accent}`, background: k ? color.paper : color.accent, color: k ? color.ink : color.paper, transform: `scale(${0.92 + 0.08 * on})`, opacity: 0.3 + 0.7 * on }}>
                  {b}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Stage>
  );
}

function Tasks({ f }: { f: number }) {
  const t = copy.trial;
  return (
    <Stage>
      <Tag />
      <Caption lines={t.tasksCaption} at={0.1} f={f} />
      <div style={{ position: "absolute", left: 72, top: 345, fontSize: 48, fontWeight: 600, color: color.muted, opacity: progress(f, sec(2.6), 7) }}>{t.tasksSub}</div>
      {t.tasks.map((row, i) => {
        const at = sec(0.5 + i * TRIAL.taskStep);
        const p = progress(f, at, 7, ease.spring);
        if (f < at) return null;
        return (
          <TaskNote
            key={row[0]}
            row={row}
            width={940}
            style={{ position: "absolute", left: 70, top: 470 + i * 160, transform: `rotate(${(random(`r${i}`) - 0.5) * 3}deg) scale(${1.25 - 0.25 * p})`, opacity: Math.min(1, p * 1.4) }}
          />
        );
      })}
    </Stage>
  );
}

function Flow({ f }: { f: number }) {
  const t = copy.trial;
  const rel = (s: number) => sec(s - TRIAL.flow);
  const typed = t.prLine.slice(0, Math.max(0, f - rel(TRIAL.typing)));
  const werk = progress(f, rel(TRIAL.werk), 8, ease.spring);
  return (
    <Stage>
      <Tag />
      <Caption lines={t.flowCaption} at={0.1} f={f} size={90} />
      {t.steps.map((label, i) => {
        const on = progress(f, rel(TRIAL.steps[i]!), 6, ease.spring);
        const lit = f >= rel(TRIAL.steps[i]!);
        return (
          <div key={label} style={{ position: "absolute", left: 70, top: 400 + i * 150, width: 940, height: 120, display: "flex", alignItems: "center", gap: 28, padding: "0 30px", background: color.paper, border: `4px solid ${lit ? color.accent : color.lineStrong}`, color: lit ? color.ink : color.lineStrong, transform: `scale(${0.97 + 0.03 * on})` }}>
            <div style={{ width: 66, height: 66, flex: "none", display: "grid", placeItems: "center", background: lit ? color.accent : color.paper, color: lit ? color.paper : color.lineStrong, border: `4px solid ${lit ? color.accent : color.lineStrong}`, fontFamily: monoFamily, fontSize: 34, fontWeight: 700 }}>{i + 1}</div>
            <div style={{ fontSize: 46, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</div>
            {i === 3 && lit ? (
              <div style={{ fontFamily: monoFamily, fontSize: 40, fontWeight: 700, background: color.ink, color: color.paper, padding: "8px 16px", minWidth: 300 }}>
                {typed}
                {typed.length < t.prLine.length && Math.floor(f / 6) % 2 === 0 ? "▌" : ""}
              </div>
            ) : null}
            {i === 4 && werk > 0 ? (
              <div style={{ marginLeft: "auto", fontFamily: monoFamily, fontSize: 52, fontWeight: 700, color: color.paper, background: color.accent, padding: "6px 20px", transform: `scale(${werk})` }}>{t.werk}</div>
            ) : null}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 72, right: 40, top: 1180, fontSize: 52, fontWeight: 800, opacity: progress(f, rel(TRIAL.thanks), 7), transform: `translateY(${(1 - progress(f, rel(TRIAL.thanks), 7)) * 20}px)`, whiteSpace: "nowrap" }}>
        <Rich text={t.thanks} accent={color.accent} />
      </div>
    </Stage>
  );
}

const ROBOTS: readonly Robot[] = [
  { enter: CUES.trial + TRIAL.agent + 0.1, lane: 0.6, size: 150, speed: 22, dir: 1, carry: "note" },
  { enter: CUES.trial + TRIAL.agent + 0.4, lane: 0.82, size: 110, speed: 26, dir: -1, carry: "box" },
  { enter: CUES.trial + TRIAL.agent + 0.7, lane: 0.7, size: 90, speed: 30, dir: 1, carry: "gear" },
];

function Agent({ f }: { f: number }) {
  const t = copy.trial;
  const stamp = progress(f, sec(0.9), 6, ease.spring);
  return (
    <Stage bg={color.ink} fg={color.paper}>
      <Caption lines={t.agentCaption} at={0.05} f={f} accent={color.signal} />
      <div style={{ position: "absolute", left: 72, top: 345, fontSize: 46, fontWeight: 600, color: "#cfcfcf", opacity: progress(f, sec(0.5), 7), whiteSpace: "nowrap" }}>{t.agentSub}</div>
      <Robots robots={ROBOTS} f={f} shotStart={CUES.trial + TRIAL.agent} width={SAFE.width} height={SAFE.height} />
      {stamp > 0 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 560, display: "flex", justifyContent: "center" }}>
          <div style={{ border: `12px solid ${color.signal}`, color: color.signal, background: color.ink, padding: "8px 40px", fontSize: 140, fontWeight: 900, letterSpacing: 8, transform: `rotate(-7deg) scale(${2.2 - 1.2 * stamp})`, opacity: Math.min(1, stamp * 2) }}>{t.waiting}</div>
        </div>
      ) : null}
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
