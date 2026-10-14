import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { color, ease, ms, SAFE, type } from "./theme";
import { fontFamily } from "./fonts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 over `duration` frames from `start`, with the UI easing. */
export function progress(frame: number, start: number, duration: number, easing = ease.ui) {
  return interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing });
}

/** White page; children lay out in the 1080×1440 safe area, centred vertically in 9:16. */
export function Page({ children }: { children: ReactNode }) {
  return <Stage>{children}</Stage>;
}

/** A full-bleed ground; children lay out in the 1080×1440 safe area, centred in 9:16. */
export function Stage({ bg = color.paper, fg = color.ink, children }: { bg?: string; fg?: string; children: ReactNode }) {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: bg, fontFamily, color: fg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: (width - SAFE.width) / 2,
          top: (height - SAFE.height) / 2,
          width: SAFE.width,
          height: SAFE.height,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

/** Fade in and rise 16 px, 220 ms. */
export function Enter({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const p = progress(frame, at, ms(220));
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * 16}px)` }}>{children}</div>;
}

/**
 * A caption line. **word** is set in brand green and lands with a small spring 2 frames
 * after the line itself.
 */
export function Caption({
  lines,
  at,
  size = "caption",
  lineGap = 0,
  style,
}: {
  lines: readonly string[];
  at: number;
  size?: keyof typeof type;
  lineGap?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const t = type[size];
  return (
    <div style={{ ...t, color: size === "sub" ? color.muted : color.ink, ...style }}>
      {lines.map((line, i) => {
        const lineAt = at + i * 3;
        const p = progress(frame, lineAt, ms(220));
        return (
          <div key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 16}px)`, marginTop: i ? lineGap : 0 }}>
            {line.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
              if (!part.startsWith("**")) return <span key={j}>{part}</span>;
              const s = progress(frame, lineAt + 2, ms(320), ease.spring);
              return (
                <span
                  key={j}
                  style={{
                    color: color.accent,
                    display: "inline-block",
                    transform: `scale(${0.9 + 0.1 * s})`,
                    transformOrigin: "50% 80%",
                  }}
                >
                  {part.slice(2, -2)}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
