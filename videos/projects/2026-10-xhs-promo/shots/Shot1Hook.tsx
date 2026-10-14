import { interpolate, interpolateColors, random, useCurrentFrame } from "remotion";

import { Stage, progress } from "../../../kit/motion";
import { useCopy } from "../copy";
import { BEAT, CUES, color, ease, sec } from "../theme";

// 0:00–0:03 · The pile. Idea notes drop in on every half beat and stack up; the camera pulls
// back; on beat 2 an ink panel wipes up with the line, on bar 2 the notes go grey.
// The music (music.ts) puts a thud on every landing and a whoosh on the panel.
export const SHOT1_FRAMES = sec(CUES.intro);
const HALF = BEAT / 2;
const GREY_AT = sec(CUES.hookGrey);
const PANEL_AT = sec(CUES.hookPanel);

export function Shot1Hook() {
  const frame = useCurrentFrame();
  const { pile, caption, spread, pileSize } = useCopy().hook;
  const zoom = interpolate(frame, [0, 90], [1.12, 0.94]);

  return (
    <Stage>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: "50% 35%" }}>
        {pile.map((idea, k) => {
          const at = Math.round(k * HALF);
          if (frame < at) return null;
          const land = progress(frame, at, 6, ease.spring);
          const x = 70 + random(`x${k}`) * spread;
          const y = 90 + k * 78 + random(`y${k}`) * 30;
          const rot = (random(`r${k}`) - 0.5) * 14;
          const grey = progress(frame, GREY_AT + (k % 4), 6);
          const ink = interpolateColors(grey, [0, 1], [color.ink, color.lineStrong]);
          return (
            <div
              key={idea}
              style={{
                position: "absolute",
                left: x,
                top: y,
                padding: "26px 34px",
                background: color.paper,
                border: `3px solid ${ink}`,
                color: ink,
                fontSize: pileSize,
                fontWeight: 800,
                whiteSpace: "nowrap",
                transform: `rotate(${rot}deg) scale(${1.25 - 0.25 * land})`,
                opacity: land,
              }}
            >
              {idea}
            </div>
          );
        })}
      </div>

      <Panel frame={frame} caption={caption} />
    </Stage>
  );
}

function Panel({ frame, caption }: { frame: number; caption: readonly string[] }) {
  const up = progress(frame, PANEL_AT, 8);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: -240, // runs past the safe area so the 9:16 version is covered too
        height: 640 + 240,
        background: color.ink,
        color: color.paper,
        transform: `translateY(${(1 - up) * 100}%)`,
        padding: "70px 72px",
      }}
    >
      {caption.map((line, k) => {
        const p = progress(frame, PANEL_AT + 5 + k * 3, 7, ease.spring);
        return (
          <div key={line} style={{ fontSize: 120, fontWeight: 900, lineHeight: 1.15, letterSpacing: -2, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
            {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
              part.startsWith("**") ? (
                <span key={j} style={{ color: color.signal }}>
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
