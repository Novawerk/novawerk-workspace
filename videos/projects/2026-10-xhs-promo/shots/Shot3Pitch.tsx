import { interpolate, useCurrentFrame } from "remotion";

import { NovaStar, SwapCaption } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { useCopy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { CUES, PITCH, TYPING, color, ease, sec } from "../theme";

// 0:08–0:15 · /submit, drawn. The idea is typed into the chat (a key click each character), sent,
// the assistant asks one question, the pitch panel comes forward and five parts tick, one a half beat.
// Not a screen recording: the site's layout and labels in the video's own style.
export const SHOT3_FRAMES = sec(CUES.team - CUES.pitch);

const at = (t: number) => sec(t - CUES.pitch);
const SEND = at(PITCH.send);
const REPLY = at(PITCH.reply);
const TICKS = PITCH.ticks.map(at);
const FOCUS = at(PITCH.focus); // the pitch panel comes forward

export function Shot3Pitch() {
  const f = useCurrentFrame();
  const { pitch: c, lang } = useCopy();
  const typing = TYPING[lang].pitchChat;
  const TYPE_AT = at(typing.at);
  const typed = Math.max(0, Math.min(typing.chars, Math.floor((f - TYPE_AT) / typing.every) + 1));
  const draft = f < SEND ? [...c.message].slice(0, f >= TYPE_AT ? typed : 0).join("") : "";
  const sent = progress(f, SEND, 6, ease.spring);
  const reply = progress(f, REPLY, 6, ease.spring);
  const focus = progress(f, FOCUS, 12);
  const done = TICKS.filter((t) => f >= t).length;
  const subIn = progress(f, FOCUS + 6, 7);

  return (
    <Stage>
      <SwapCaption f={f} captions={c.captions} accent={color.accent} style={{ position: "absolute", left: 72, right: 72, top: 90 }} />

      {/* The chat. */}
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 380,
          height: 470,
          border: `3px solid ${color.ink}`,
          background: color.paper,
          display: "flex",
          flexDirection: "column",
          transform: `rotate(-1.5deg) scale(${1 - 0.06 * focus}) translateY(${-30 * focus}px)`,
          opacity: 1 - 0.55 * focus,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 28px", borderBottom: `2px solid ${color.line}` }}>
          <NovaStar size={34} />
          <div>
            <div style={{ fontSize: 30, fontWeight: 600 }}>{c.header}</div>
            <div style={{ fontSize: 22, color: color.muted }}>{c.intro}</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: "22px 28px", display: "flex", flexDirection: "column", gap: 16, justifyContent: "flex-end" }}>
          {f >= SEND ? (
            <div style={{ alignSelf: "flex-end", maxWidth: 680, background: color.ink, color: color.paper, fontSize: 32, fontWeight: 500, lineHeight: 1.35, padding: "16px 22px", opacity: sent, transform: `translateY(${(1 - sent) * 20}px)` }}>
              {c.message}
            </div>
          ) : null}
          {f >= SEND + 6 && f < REPLY ? <Dots f={f} /> : null}
          {f >= REPLY ? (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", opacity: reply, transform: `translateY(${(1 - reply) * 20}px)` }}>
              <NovaStar size={30} style={{ marginTop: 10 }} />
              <div style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.35 }}>{c.reply}</div>
            </div>
          ) : null}
        </div>
        <div style={{ margin: "0 28px 24px", border: `2px solid ${color.lineStrong}`, padding: "14px 20px", fontSize: 30, minHeight: 46, color: draft ? color.ink : color.muted, display: "flex", alignItems: "center" }}>
          {draft || (f < SEND ? "" : "Describe your idea…")}
          {f >= TYPE_AT && f < SEND ? <span style={{ display: "inline-block", width: 4, height: 36, marginLeft: 4, background: color.accent }} /> : null}
        </div>
      </div>

      {/* The pitch panel, filling in. */}
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 900,
          background: color.paper,
          border: `3px solid ${color.ink}`,
          transform: `rotate(${interpolate(focus, [0, 1], [1.5, 0])}deg) translateY(${-330 * focus}px) scale(${1 + 0.04 * focus})`,
          transformOrigin: "50% 0%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "22px 30px", borderBottom: `2px solid ${color.line}` }}>
          <span style={{ fontSize: 34, fontWeight: 700 }}>{c.panel}</span>
          <span style={{ fontFamily: monoFamily, fontSize: 26, color: done ? color.accent : color.muted }}>
            {done} of {c.total}
          </span>
        </div>
        {c.fields.map((field, k) => {
          const tickAt = TICKS[k];
          const ticked = tickAt !== undefined && f >= tickAt;
          const t = tickAt === undefined ? 0 : progress(f, tickAt, 7, ease.spring);
          return (
            <div key={field.label} style={{ display: "flex", gap: 22, padding: "20px 30px", borderBottom: k < c.fields.length - 1 ? `2px solid ${color.line}` : undefined }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  marginTop: 4,
                  flexShrink: 0,
                  borderRadius: 17,
                  border: `3px solid ${ticked ? color.accent : color.lineStrong}`,
                  background: ticked ? color.accent : "transparent",
                  color: color.paper,
                  fontSize: 22,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${ticked ? 0.7 + 0.3 * t : 1})`,
                }}
              >
                {ticked ? "✓" : ""}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 30, fontWeight: 600 }}>{field.label}</div>
                {ticked && field.value ? (
                  <div style={{ marginTop: 6, fontSize: 25, color: color.muted, lineHeight: 1.35, opacity: t }}>{field.value}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: "absolute", left: 72, right: 72, top: 1340, fontFamily: monoFamily, fontSize: 32, color: color.muted, opacity: subIn }}>{c.sub}</div>
    </Stage>
  );
}

function Dots({ f }: { f: number }) {
  return (
    <div style={{ display: "flex", gap: 10, paddingLeft: 44 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: color.muted, opacity: 0.3 + 0.7 * (Math.floor(f / 3) % 3 === i ? 1 : 0) }} />
      ))}
    </div>
  );
}
