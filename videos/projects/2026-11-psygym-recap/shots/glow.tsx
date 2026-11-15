import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useVideoConfig } from "remotion";

import { fontFamily, monoFamily } from "../../../kit/fonts";
import { progress } from "../../../kit/motion";
import { SAFE } from "../theme";

// This film's look ("B · glow", picked 2026-11-15): PSYGYM's lilac at night, glass chips, the
// app's real screens in floating phones, headlines in a lilac-to-mint gradient.

export const glow = {
  night: "#0e0a18",
  deep: "#1c1430",
  violet: "#4b3672",
  lilac: "#d9c6ff",
  haze: "#b79cf0",
  mint: "#8ff0b4",
  text: "#ffffff",
  dim: "rgba(255,255,255,0.68)",
  glass: "rgba(255,255,255,0.10)",
  glassLine: "rgba(255,255,255,0.32)",
  bezel: "#2b2240",
} as const;

export const gradient = `linear-gradient(90deg, ${glow.lilac}, ${glow.mint})`;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** 0 → 1 with a long, soft landing. */
export const rise = (f: number, at: number, dur = 18) => interpolate(f, [at, at + dur], [0, 1], { ...clamp, easing: easeOut });

/** The night sky: a radial violet, two haze blobs drifting slowly. Children lay out in the safe area. */
export function Night({ f, children, hazeAt = [0.68, 0.22] }: { f: number; children: ReactNode; hazeAt?: readonly [number, number] }) {
  const { width, height } = useVideoConfig();
  const drift = (k: number) => Math.sin(f / 70 + k) * 40;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 80% at ${hazeAt[0] * 100}% ${hazeAt[1] * 100}%, ${glow.violet} 0%, ${glow.deep} 55%, ${glow.night} 100%)`, fontFamily, color: glow.text, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: width * hazeAt[0] - 350 + drift(0), top: height * hazeAt[1] - 300 + drift(1), width: 700, height: 700, borderRadius: 350, background: glow.haze, filter: "blur(170px)", opacity: 0.35 + 0.06 * Math.sin(f / 12) }} />
      <div style={{ position: "absolute", left: width * 0.1 + drift(2), top: height * 0.75 + drift(3), width: 520, height: 520, borderRadius: 260, background: glow.mint, filter: "blur(190px)", opacity: 0.12 }} />
      <div style={{ position: "absolute", left: (width - SAFE.width) / 2, top: (height - SAFE.height) / 2, width: SAFE.width, height: SAFE.height }}>{children}</div>
    </AbsoluteFill>
  );
}

/** A headline: each line blurs in and rises; **word** in the gradient. */
export function Headline({ f, at, lines, size = 104, style }: { f: number; at: number; lines: readonly string[]; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.04, letterSpacing: -size * 0.035, ...style }}>
      {lines.map((line, k) => {
        const p = rise(f, at + k * 4, 16);
        return (
          <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, filter: `blur(${(1 - p) * 12}px)` }}>
            {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
              part.startsWith("**") ? (
                <span key={j} style={{ background: gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  {part.slice(2, -2)}
                </span>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A small mono label in lilac. */
export function Label({ f, at, children, style }: { f: number; at: number; children: ReactNode; style?: CSSProperties }) {
  const p = rise(f, at, 12);
  return <div style={{ fontFamily: monoFamily, fontSize: 26, fontWeight: 600, letterSpacing: 4, color: glow.lilac, opacity: p, ...style }}>{children}</div>;
}

/** Frosted glass: a pill or a card. Pops in from below with a small overshoot. */
export function Glass({ f, at, children, style, radius = 40 }: { f: number; at: number; children: ReactNode; style?: CSSProperties; radius?: number }) {
  if (f < at) return null;
  const p = progress(f, at, 12, Easing.bezier(0.34, 1.4, 0.64, 1));
  return (
    <div
      style={{
        position: "absolute",
        borderRadius: radius,
        background: glow.glass,
        border: `1.5px solid ${glow.glassLine}`,
        backdropFilter: "blur(24px)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
        opacity: Math.min(1, p),
        transform: `translateY(${(1 - p) * 34}px) scale(${0.94 + 0.06 * p})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A phone floating in 3D with one of the app's real screens (public/screenN.png, cropped from
 * the App Store listing). `turn` is its Y rotation in degrees.
 */
export function Phone({ src, width, turn, tiltX = 6, lift = 0, bob = 0, style }: { src: string; width: number; turn: number; tiltX?: number; lift?: number; bob?: number; style?: CSSProperties }) {
  const height = (width * 944) / 426;
  return (
    <div style={{ position: "absolute", perspective: 1800, ...style }}>
      <div
        style={{
          width,
          height,
          borderRadius: width * 0.13,
          border: `${Math.round(width * 0.02)}px solid ${glow.bezel}`,
          background: "#fff",
          overflow: "hidden",
          boxShadow: "0 60px 140px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
          transform: `translateY(${lift + bob}px) rotateY(${turn}deg) rotateX(${tiltX}deg)`,
        }}
      >
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    </div>
  );
}
