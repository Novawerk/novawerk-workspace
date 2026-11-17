import { useCurrentFrame } from "remotion";

import { Lockup, Rich, starFall } from "../../../kit/brand";
import { copy } from "../copy";
import { CLOSE, HABITS, STAR_FALL, color, sec, when } from "../theme";
import { Icon, Shell, fade, frameIn, framesOf, land } from "./parts";

// The last two shots: three habits, and the close.

const F7 = frameIn("habits");
export const HABITS_FRAMES = framesOf("habits");
const HABIT_ICONS = ["issue", "back", "lock"] as const;

export function Shot7Habits() {
  const f = useCurrentFrame();
  const c = copy.habits;
  const privateAt = F7(when("habits", 2, 1));
  return (
    <Shell shot="habits" title={c.title}>
      {c.notes.map((text, i) => {
        const at = F7(HABITS.notes[i]!);
        const d = land(f, at, 9);
        const tilt = [-1.5, 1.2, -0.8][i]!;
        return (
          <div key={text} style={{ position: "absolute", left: 64, top: 300 + i * 292, width: 952, height: 256, background: color.paper, border: `3px solid ${color.ink}`, display: "flex", alignItems: "center", gap: 34, padding: "0 36px", opacity: fade(f, at, 3), transform: `translateY(${(1 - d) * -50}px) rotate(${tilt + (1 - d) * 6}deg)` }}>
            <div style={{ width: 132, height: 132, flexShrink: 0, background: color.ink, color: color.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={HABIT_ICONS[i]!} size={84} stroke={2} />
            </div>
            <div>
              <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: -2, whiteSpace: "nowrap" }}>
                <Rich text={text} accent={color.accent} />
              </div>
              {i === 2 ? <div style={{ fontSize: 36, fontWeight: 700, color: color.muted, marginTop: 8, opacity: fade(f, privateAt, 6) }}>{c.private}</div> : null}
            </div>
          </div>
        );
      })}
    </Shell>
  );
}

const F8 = frameIn("close");
export const CLOSE_FRAMES = framesOf("close");
const SPIN = 360 / (14 * 30); // the site's 14-second turn, per frame

export function Shot8Close() {
  const f = useCurrentFrame();
  const c = copy.close;
  const start = F8(CLOSE.land) - sec(STAR_FALL);
  const fall = starFall(f - start, sec(STAR_FALL));
  const word = fade(f, F8(CLOSE.land) + 5, 8);
  const number = land(f, F8(CLOSE.land) + 12, 10);
  const line = fade(f, F8(CLOSE.line), 8);
  return (
    <Shell shot="close" dark>
      <div style={{ position: "absolute", left: 0, right: 0, top: 400, display: "flex", justifyContent: "center", opacity: f >= start ? 1 : 0 }}>
        <Lockup
          height={104}
          tone="dark"
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 700}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin + f * SPIN}deg)` }}
          wordmarkStyle={{ opacity: word, transform: `translateX(${(1 - word) * -40}px)` }}
        />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 520, textAlign: "center", fontSize: 300, fontWeight: 800, letterSpacing: -12, lineHeight: 1.1, color: color.signal, opacity: fade(f, F8(CLOSE.land) + 12, 4), transform: `scale(${0.85 + 0.15 * number})` }}>{c.number}</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 930, textAlign: "center", fontSize: 66, fontWeight: 900, letterSpacing: -1, opacity: line, transform: `translateY(${(1 - line) * 18}px)` }}>
        <Rich text={c.line} accent={color.signal} />
      </div>
    </Shell>
  );
}
