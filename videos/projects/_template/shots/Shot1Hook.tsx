import { random, useCurrentFrame } from "remotion";

import { Note, Rich } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { BEAT, CUES, color, ease, sec } from "../theme";

// 0:00–0:06 · The hook: notes drop in on beats, the question lands on an ink panel.
export const SHOT1_FRAMES = sec(CUES.cta - CUES.hook);

export function Shot1Hook() {
  const f = useCurrentFrame();
  const { notes, caption } = copy.hook;
  const panel = progress(f, 2 * BEAT, 8);
  return (
    <Stage>
      {notes.map((note, k) => {
        const at = k * BEAT;
        if (f < at) return null;
        const d = progress(f, at, 6, ease.spring);
        return (
          <Note
            key={note}
            style={{
              position: "absolute",
              left: 120 + random(`x${k}`) * 380,
              top: 140 + k * 130,
              transform: `rotate(${(random(`r${k}`) - 0.5) * 12}deg) scale(${1.25 - 0.25 * d})`,
              opacity: d,
            }}
          >
            {note}
          </Note>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: -240, height: 880, background: color.ink, color: color.paper, padding: "70px 72px", transform: `translateY(${(1 - panel) * 100}%)` }}>
        {caption.map((line, k) => {
          const p = progress(f, 2 * BEAT + 5 + k * 3, 7, ease.spring);
          return (
            <div key={line} style={{ fontSize: 120, fontWeight: 900, lineHeight: 1.15, letterSpacing: -2, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Rich text={line} accent={color.signal} />
            </div>
          );
        })}
      </div>
    </Stage>
  );
}
