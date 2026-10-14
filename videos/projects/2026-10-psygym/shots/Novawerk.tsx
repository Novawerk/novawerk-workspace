import { interpolate, useCurrentFrame } from "remotion";

import { Note, NovaStar } from "../../../kit/brand";
import { Lines, Stamp } from "./parts";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { CUES, EMAIL, HOOK, PITCH, TYPING, color, ease, sec } from "../theme";

// The first half, in Novawerk's look: white, ink-bordered notes, green.

/** 0:00–0:03 · The pitch lands as a note; its date stamp; a dashed line to where it is going. */
export function Shot1Hook() {
  const f = useCurrentFrame();
  const c = copy.hook;
  const land = progress(f, sec(HOOK.note), 6, ease.spring);
  const line = progress(f, sec(HOOK.line), 12);
  const goal = progress(f, sec(HOOK.goal), 7, ease.spring);
  return (
    <Stage>
      <Lines f={f} at={4} lines={c.caption} accent={color.accent} style={{ position: "absolute", left: 72, right: 72, top: 100 }} />
      <Note style={{ position: "absolute", left: 96, top: 520, padding: "30px 44px 36px", transform: `rotate(-3deg) scale(${1.3 - 0.3 * land})`, opacity: Math.min(1, land * 1.5) }}>
        <div style={{ fontFamily: monoFamily, fontSize: 26, fontWeight: 600, letterSpacing: 3, color: color.accent }}>{c.pitchLabel}</div>
        <div style={{ marginTop: 6, fontSize: 76, fontWeight: 900, letterSpacing: -2 }}>{c.pitchTitle}</div>
      </Note>
      <Stamp f={f} at={sec(HOOK.stamp)} colour={color.accent} style={{ left: 600, top: 470, fontSize: 40, fontFamily: monoFamily }}>
        {c.stamp}
      </Stamp>
      {/* The road ahead: a dashed line drawing down to a ghost card. */}
      <svg width={1080} height={1440} style={{ position: "absolute", inset: 0 }}>
        <clipPath id="road">
          <rect x={0} y={740} width={1080} height={300 * line} />
        </clipPath>
        <path d="M 420 760 C 420 900, 640 900, 640 1030" fill="none" stroke={color.accent} strokeWidth={6} strokeDasharray="18 14" clipPath="url(#road)" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 430,
          top: 1040,
          border: `4px dashed ${color.accent}`,
          color: color.accent,
          background: color.paper,
          padding: "22px 40px",
          fontSize: 60,
          fontWeight: 900,
          transform: `rotate(2deg) scale(${0.8 + 0.2 * goal})`,
          opacity: goal,
        }}
      >
        {c.goal}
      </div>
    </Stage>
  );
}

/** 0:03–0:10 · /submit, drawn: the pitch is typed and sent; three parts of it tick. */
export function Shot2Pitch() {
  const f = useCurrentFrame();
  const c = copy.pitch;
  const at = (t: number) => sec(t - CUES.pitch);
  const typeAt = at(TYPING.pitch.at);
  const send = at(PITCH.send);
  const ticks = PITCH.ticks.map(at);
  const typed = Math.max(0, Math.min(TYPING.pitch.chars, Math.floor((f - typeAt) / TYPING.pitch.every) + 1));
  const draft = f >= typeAt && f < send ? [...c.message].slice(0, typed).join("") : "";
  const sent = progress(f, send, 6, ease.spring);
  const done = ticks.filter((t) => f >= t).length;
  return (
    <Stage>
      <Lines f={f} at={0} lines={c.caption} accent={color.accent} size={92} style={{ position: "absolute", left: 72, right: 72, top: 90 }} />

      <div style={{ position: "absolute", left: 72, right: 72, top: 360, border: `3px solid ${color.ink}`, background: color.paper, transform: "rotate(-1.2deg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 28px", borderBottom: `2px solid ${color.line}` }}>
          <NovaStar size={32} />
          <div>
            <div style={{ fontSize: 30, fontWeight: 600 }}>{c.header}</div>
            <div style={{ fontSize: 22, color: color.muted }}>{c.intro}</div>
          </div>
        </div>
        <div style={{ height: 120, padding: "18px 28px", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
          {f >= send ? (
            <div style={{ background: color.ink, color: color.paper, fontSize: 34, fontWeight: 500, padding: "16px 24px", opacity: sent, transform: `translateY(${(1 - sent) * 20}px)` }}>{c.message}</div>
          ) : null}
        </div>
        <div style={{ margin: "0 28px 24px", border: `2px solid ${color.lineStrong}`, padding: "14px 20px", fontSize: 32, minHeight: 48, display: "flex", alignItems: "center" }}>
          {draft}
          {f >= typeAt && f < send ? <span style={{ display: "inline-block", width: 4, height: 38, marginLeft: 4, background: color.accent }} /> : null}
        </div>
      </div>

      <div style={{ position: "absolute", left: 72, right: 72, top: 790, border: `3px solid ${color.ink}`, background: color.paper, transform: "rotate(1deg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "20px 30px", borderBottom: `2px solid ${color.line}` }}>
          <span style={{ fontSize: 34, fontWeight: 700 }}>{c.panel}</span>
          <span style={{ fontFamily: monoFamily, fontSize: 26, color: done ? color.accent : color.muted }}>{done} of 8</span>
        </div>
        {c.fields.map((field, k) => {
          const ticked = f >= ticks[k]!;
          const t = progress(f, ticks[k]!, 7, ease.spring);
          return (
            <div key={field.label} style={{ display: "flex", gap: 22, padding: "20px 30px", borderBottom: k < c.fields.length - 1 ? `2px solid ${color.line}` : undefined }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  marginTop: 2,
                  flexShrink: 0,
                  borderRadius: 18,
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
                <div style={{ marginTop: 6, fontSize: 34, fontWeight: 700, lineHeight: 1.35, opacity: ticked ? Math.min(1, t) : 0 }}>{field.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

/** 0:10–0:15 · Our reply slides in; its two lines; the stamp. */
export function Shot3Email() {
  const f = useCurrentFrame();
  const c = copy.email;
  const arrive = progress(f, sec(EMAIL.arrive - CUES.email), 10);
  const stampAt = sec(EMAIL.stamp - CUES.email);
  // The card jolts for three frames when the stamp hits.
  const jolt = f >= stampAt && f < stampAt + 4 ? [0, 6, -4, 2][f - stampAt]! : 0;
  return (
    <Stage>
      <Lines f={f} at={4} lines={c.caption} accent={color.accent} style={{ position: "absolute", left: 72, right: 72, top: 100 }} />
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 430,
          background: color.paper,
          border: `3px solid ${color.ink}`,
          transform: `translateX(${(1 - arrive) * 900 + jolt}px) rotate(${interpolate(arrive, [0, 1], [6, -1.5])}deg)`,
        }}
      >
        <div style={{ padding: "26px 36px", borderBottom: `2px solid ${color.line}`, fontSize: 28, color: color.muted, lineHeight: 1.6 }}>
          <div>
            <span style={{ fontFamily: monoFamily }}>From</span>　{c.from}
          </div>
          <div>
            <span style={{ fontFamily: monoFamily }}>To</span>　　{c.to}
          </div>
        </div>
        <div style={{ padding: "30px 36px 40px" }}>
          <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.3 }}>{c.subject}</div>
          {c.body.map((line, k) => {
            const p = progress(f, 15 + k * 12, 8);
            return (
              <div key={line} style={{ marginTop: k ? 14 : 26, fontSize: 31, lineHeight: 1.5, color: color.ink, opacity: p, transform: `translateY(${(1 - p) * 12}px)` }}>
                {line}
              </div>
            );
          })}
        </div>
      </div>
      <Stamp f={f} at={stampAt} colour={color.accent} style={{ left: 640, top: 1050, fontSize: 110, lineHeight: 1 }}>
        {c.stamp}
        <div style={{ fontFamily: monoFamily, fontSize: 34, textAlign: "center", marginTop: 6 }}>{c.stampDate}</div>
      </Stamp>
    </Stage>
  );
}
