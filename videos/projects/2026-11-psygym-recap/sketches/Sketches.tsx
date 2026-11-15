import type { ComponentType } from "react";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { AbsoluteFill, Audio, Composition, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";

import { NovaStar } from "../../../kit/brand";
import { fontFamily, monoFamily } from "../../../kit/fonts";
import { progress } from "../../../kit/motion";
import { color, ease } from "../theme";

// Three looks for the same 3.5-second opener, to pick a style for the whole film (nw-videos §2).
// Same line in each: six weeks, from a pitch to the App Store.

const serif = loadSerif("normal").fontFamily;
const serifItalic = loadSerif("italic").fontFamily;
const LEN = 105;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

// --- A · Editorial: cream paper, a giant serif 6, a hairline from pitch to store -------------

function SketchEditorial() {
  const f = useCurrentFrame();
  const cream = "#f3efe6";
  const six = interpolate(f, [0, 18], [1, 0], { ...clamp, easing: out });
  const weeks = progress(f, 10, 14);
  const rule = interpolate(f, [26, 56], [0, 1], { ...clamp, easing: out });
  const a = progress(f, 30, 10);
  const b = progress(f, 52, 10);
  const line = progress(f, 62, 16);
  const push = 1 + 0.035 * (f / LEN);
  return (
    <AbsoluteFill style={{ background: cream, color: color.ink, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push})`, transformOrigin: "50% 40%" }}>
        <div style={{ position: "absolute", left: 60, top: 40, fontFamily: serif, fontSize: 820, lineHeight: 1, letterSpacing: -30, transform: `translateY(${six * 420}px)`, clipPath: "inset(0 0 0 0)" }}>6</div>
        <div style={{ position: "absolute", left: 520, top: 560, fontFamily: serifItalic, fontSize: 200, lineHeight: 1, opacity: weeks, transform: `translateX(${(1 - weeks) * 40}px)` }}>weeks</div>
        <div style={{ position: "absolute", left: 72, top: 900, height: 3, width: 936 * rule, background: color.ink }} />
        <div style={{ position: "absolute", left: 72, top: 924, fontFamily: monoFamily, fontSize: 28, letterSpacing: 3, opacity: a }}>OCT 05 — PITCH</div>
        <div style={{ position: "absolute", right: 72, top: 924, fontFamily: monoFamily, fontSize: 28, letterSpacing: 3, color: color.accent, opacity: b }}>NOV 15 — APP STORE</div>
        <div style={{ position: "absolute", left: 72, right: 72, top: 1040, fontFamily: serif, fontSize: 100, lineHeight: 1.02, letterSpacing: -2, opacity: line, transform: `translateY(${(1 - line) * 20}px)` }}>
          From a pitch<br />to <span style={{ fontFamily: serifItalic, color: color.accent }}>the App Store.</span>
        </div>
        <div style={{ position: "absolute", left: 72, top: 70, fontFamily: monoFamily, fontSize: 22, letterSpacing: 4, color: color.muted }}>PSYGYM × NOVAWERK · CASE NOTE</div>
      </div>
    </AbsoluteFill>
  );
}

// --- B · Product glow: PSYGYM's lilac at night, a tilted phone floating, glass date chips ----

function SketchGlow() {
  const f = useCurrentFrame();
  const phone = interpolate(f, [0, 30], [0, 1], { ...clamp, easing: out });
  const turn = interpolate(f, [0, LEN], [-24, -10], clamp);
  const bob = Math.sin(f / 14) * 10;
  const chipA = progress(f, 22, 12, ease.spring);
  const chipB = progress(f, 44, 12, ease.spring);
  const head = progress(f, 56, 14);
  const glow = 0.55 + 0.1 * Math.sin(f / 10);
  const bubble = (at: number) => progress(f, at, 8, ease.spring);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 80% at 70% 30%, #4b3672 0%, #1c1430 55%, #0e0a18 100%)", fontFamily, color: "#fff", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 460, top: 120, width: 700, height: 700, borderRadius: 350, background: "#b79cf0", filter: "blur(160px)", opacity: glow * 0.6 }} />
      <div style={{ position: "absolute", left: 540, top: 130, perspective: 1600 }}>
        <div style={{ width: 460, height: 900, borderRadius: 64, border: "8px solid #2b2240", background: "linear-gradient(#f3eefa, #e3d6f4)", boxShadow: "0 60px 120px rgba(0,0,0,0.55)", transform: `translateY(${(1 - phone) * 500 + bob}px) rotateY(${turn}deg) rotateX(6deg)`, overflow: "hidden", color: color.ink, padding: "50px 26px", boxSizing: "border-box" }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>Xiao Chen <span style={{ fontSize: 20, color: "#7a6f8a", fontWeight: 600 }}>Session 2</span></div>
          <div style={{ marginTop: 40, marginLeft: "auto", width: 300, background: color.ink, color: "#fff", fontSize: 26, fontWeight: 600, padding: "14px 18px", borderRadius: "20px 20px 6px 20px", opacity: bubble(16), transform: `scale(${0.8 + 0.2 * bubble(16)})` }}>Where shall we start today?</div>
          <div style={{ marginTop: 18, width: 330, background: "#fff", fontSize: 26, padding: "14px 18px", borderRadius: "20px 20px 20px 6px", opacity: bubble(34), transform: `scale(${0.8 + 0.2 * bubble(34)})` }}>Last time we talked about my family…</div>
        </div>
      </div>
      {[
        { t: "Oct 5 · Pitch", x: 60, y: 300, p: chipA },
        { t: "Nov 15 · App Store", x: 60, y: 440, p: chipB },
      ].map((c) => (
        <div key={c.t} style={{ position: "absolute", left: c.x, top: c.y, padding: "18px 30px", borderRadius: 40, background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.35)", backdropFilter: "blur(20px)", fontSize: 38, fontWeight: 700, opacity: Math.min(1, c.p), transform: `translateY(${(1 - c.p) * 30}px)` }}>
          {c.t}
        </div>
      ))}
      <div style={{ position: "absolute", left: 72, right: 72, top: 1110, fontSize: 92, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3, opacity: head, transform: `translateY(${(1 - head) * 30}px)` }}>
        Six weeks.
        <br />
        <span style={{ background: "linear-gradient(90deg, #d9c6ff, #8ff0b4)", WebkitBackgroundClip: "text", color: "transparent" }}>Pitch to App Store.</span>
      </div>
    </AbsoluteFill>
  );
}

// --- C · Build log: a terminal, the project's history as commits, the headline stamps over --

const LOG = [
  { d: "oct 05", m: "pitch received: AI practice partners for counselors" },
  { d: "oct 10", m: "kickoff · we build it together" },
  { d: "oct 17", m: "first demo · AI client + AI supervisor" },
  { d: "nov 15", m: "shipped → App Store ✓" },
] as const;

function SketchLog() {
  const f = useCurrentFrame();
  const prompt = "$ git log psygym --oneline";
  const typed = Math.min(prompt.length, Math.floor(f / 0.8));
  const lineAt = (k: number) => 24 + k * 9;
  const big = progress(f, 66, 8, ease.spring);
  const cursor = Math.floor(f / 8) % 2 === 0;
  return (
    <AbsoluteFill style={{ background: "#0b0d0c", fontFamily: monoFamily, color: "#d6e2da", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 5px)" }} />
      <div style={{ position: "absolute", left: 72, top: 90, fontSize: 24, color: "rgba(214,226,218,0.5)", letterSpacing: 2 }}>~/novawerk/psygym</div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 150, fontSize: 36, lineHeight: 1.7 }}>
        <div>
          {prompt.slice(0, typed)}
          {f < lineAt(0) ? <span style={{ opacity: cursor ? 1 : 0, color: color.signal }}>▌</span> : null}
        </div>
        {LOG.map((l, k) => {
          const p = progress(f, lineAt(k), 3);
          const last = k === LOG.length - 1;
          return (
            <div key={l.d} style={{ opacity: p, display: "flex", gap: 28, color: last ? color.signal : undefined }}>
              <span style={{ color: last ? color.signal : "#e6b450", whiteSpace: "nowrap", flexShrink: 0, minWidth: 150 }}>{l.d}</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.m}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 820, fontFamily, color: "#fff", fontSize: 150, fontWeight: 800, lineHeight: 0.98, letterSpacing: -6, opacity: Math.min(1, big), transform: `scale(${1.15 - 0.15 * big})`, transformOrigin: "0 50%" }}>
        6 weeks.
        <div style={{ fontSize: 76, letterSpacing: -2, marginTop: 24, color: "rgba(255,255,255,0.75)" }}>
          Pitch to <span style={{ color: color.signal }}>App Store</span>.
        </div>
      </div>
      <div style={{ position: "absolute", right: 72, bottom: 80 }}>
        <NovaStar size={56} tone="dark" rotate={f * 2} />
      </div>
    </AbsoluteFill>
  );
}

function withMusic(C: ComponentType) {
  return function WithMusic() {
    return (
      <>
        <Audio src={staticFile("music.wav")} />
        <C />
      </>
    );
  };
}

export function Sketches() {
  const common = { durationInFrames: LEN, fps: 30, width: 1080, height: 1440 } as const;
  return (
    <>
      <Composition id="SketchA-Editorial" component={withMusic(SketchEditorial)} {...common} />
      <Composition id="SketchB-Glow" component={withMusic(SketchGlow)} {...common} />
      <Composition id="SketchC-Log" component={withMusic(SketchLog)} {...common} />
    </>
  );
}
