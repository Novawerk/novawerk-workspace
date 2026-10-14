import { useCurrentFrame } from "remotion";

import { Note, Rich } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { Robots } from "../../../kit/robots";
import { useCopy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { CUES, ROBOTS, SAFE, TEAM, color, ease, sec } from "../theme";

// 0:15–0:25 · Who you build with, one scene on ink. The question; "these people" and three cards
// slam in; the roles of everyone else light up on half beats; "当然，" … "还有" … and the Agent lands
// last — bigger, green, the frame shakes, a parade of little robots runs across; the closing line.
export const SHOT4_FRAMES = sec(CUES.real - CUES.team);

const at = (t: number) => sec(t - CUES.team);
const CREW_CAPTION = at(TEAM.crewCaption);
const tilt = [-2.5, 2, -1.5, 2.5];

export function Shot4Team() {
  const f = useCurrentFrame();
  const c = useCopy().team;
  const en = useCopy().lang === "en";
  const lines = f < CREW_CAPTION ? c.ask : c.crewCaption;
  const linesAt = f < CREW_CAPTION ? 0 : CREW_CAPTION;
  const partners = progress(f, at(TEAM.roles[0]!) - 4, 7);
  const close = progress(f, at(TEAM.close), 8, ease.spring);

  // The Agent lands hard: the whole frame shakes for a few frames.
  const hit = f - at(TEAM.crew[3]!);
  const amp = hit >= 0 && hit < 14 ? 22 * Math.exp(-hit / 4) : 0;
  const shake = `translate(${amp * Math.sin(hit * 2.7)}px, ${amp * Math.cos(hit * 3.3)}px)`;

  return (
    <Stage bg={color.ink} fg={color.paper}>
      <div style={{ position: "absolute", inset: 0, transform: shake }}>
      <div style={{ position: "absolute", left: 72, right: 72, top: 90, fontSize: 104, fontWeight: 900, lineHeight: 1.14, letterSpacing: -2 }}>
        {lines.map((line, k) => {
          const p = progress(f, linesAt + k * 3, 7, ease.spring);
          return (
            <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Rich text={line} accent={color.signal} />
            </div>
          );
        })}
      </div>

      {c.crew.map((m, k) => {
        const s = at(TEAM.crew[k]!);
        if (f < s) return null;
        const headliner = k === c.crew.length - 1;
        const d = progress(f, s, headliner ? 8 : 6, ease.spring);
        const flash = f - s < 2; // a two-frame flash on impact
        return (
          <Note
            key={m.title}
            style={{
              position: "absolute",
              left: 72,
              right: 72,
              top: 360 + k * 182,
              padding: "18px 40px 22px",
              border: "none",
              background: headliner ? (flash ? color.paper : color.signal) : flash ? color.signal : color.paper,
              transform: `rotate(${tilt[k]}deg) scale(${(headliner ? 2.2 : 1.5) - (headliner ? 1.2 : 0.5) * d})`,
              opacity: Math.min(1, d * 1.5),
            }}
          >
            <div style={{ fontFamily: monoFamily, fontSize: headliner ? 28 : 22, fontWeight: 600, letterSpacing: 3, color: headliner ? color.ink : color.accent }}>
              0{k + 1} · {m.tag}
            </div>
            <div style={{ marginTop: 2, fontSize: headliner ? c.headlinerSize : c.crewSize, fontWeight: 900, letterSpacing: -3, lineHeight: 1.05 }}>{m.title}</div>
          </Note>
        );
      })}

      {/* "当然，" … "还有" … ("And," … "of course,") one word a beat in the last slot; the Agent card lands on top of them. */}
      {f < at(TEAM.crew[3]!) + 2 ? (
        <div style={{ position: "absolute", left: 112, top: 930, display: "flex", fontSize: 100, fontWeight: 900, letterSpacing: -2 }}>
          {c.aside.map((word, k) => {
            const s = at(TEAM.aside[k]!);
            if (f < s) return null;
            const p = progress(f, s, 5, ease.spring);
            return (
              <span key={word} style={{ display: "inline-block", marginLeft: k && en ? 28 : 0, color: k ? color.signal : color.paper, transform: `scale(${1.4 - 0.4 * p})`, opacity: p, transformOrigin: "0% 70%" }}>
                {word}
              </span>
            );
          })}
        </div>
      ) : null}

      <div style={{ position: "absolute", left: 72, right: 72, top: 1120, opacity: partners }}>
        <div style={{ fontSize: 36, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{c.partners}</div>
        <div style={{ marginTop: 18, display: "flex", gap: 14 }}>
          {c.roles.map((role, k) => {
            const s = at(TEAM.roles[k]!);
            const on = f >= s;
            const p = progress(f, s, 5, ease.spring);
            return (
              <span
                key={role}
                style={{
                  fontSize: c.roleSize,
                  fontWeight: 800,
                  padding: "10px 20px",
                  border: `3px solid ${on ? color.signal : "rgba(255,255,255,0.3)"}`,
                  background: on ? color.signal : "transparent",
                  color: on ? color.ink : "rgba(255,255,255,0.5)",
                  transform: `scale(${on ? 0.85 + 0.15 * p : 1})`,
                }}
              >
                {role}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ position: "absolute", left: 72, right: 72, top: 1300, fontSize: 64, fontWeight: 900, opacity: close, transform: `translateY(${(1 - close) * 20}px)` }}>
        <Rich text={c.close} accent={color.signal} />
      </div>

      <Robots robots={ROBOTS} f={f} shotStart={CUES.team} width={SAFE.width} height={SAFE.height} />
      </div>
    </Stage>
  );
}
