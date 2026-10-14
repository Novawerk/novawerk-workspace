import { useCurrentFrame } from "remotion";

import { Lockup, Rich, starFall } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { copy } from "../copy";
import { BEAT, CUES, STAR_FALL, color, ease, sec } from "../theme";

// 0:06–0:12 · The call to action: the star falls into the lockup and unfolds, the line, the address.
export const SHOT2_FRAMES = sec(CUES.end - CUES.cta);
const SPIN = 360 / (14 * 30); // the site's 14-second turn, per frame

export function Shot2Cta() {
  const f = useCurrentFrame();
  const { caption, url } = copy.cta;
  const fall = starFall(f, sec(STAR_FALL));
  const word = progress(f, sec(STAR_FALL) + 5, 8);
  const pill = progress(f, 2 * BEAT, 9, ease.spring);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, display: "flex", justifyContent: "center" }}>
        <Lockup
          height={110}
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 700}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin + f * SPIN}deg)` }}
          wordmarkStyle={{ opacity: word, transform: `translateX(${(1 - word) * -40}px)` }}
        />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 600, textAlign: "center", fontSize: 108, fontWeight: 900, lineHeight: 1.15, letterSpacing: -2 }}>
        {caption.map((line, k) => {
          const p = progress(f, k * 3, 7, ease.spring);
          return (
            <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Rich text={line} accent={color.accent} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, display: "flex", justifyContent: "center" }}>
        <div style={{ background: color.ink, color: color.paper, fontSize: 84, fontWeight: 700, letterSpacing: -2, padding: "28px 64px 34px", transform: `scale(${0.6 + 0.4 * pill})`, opacity: pill }}>{url}</div>
      </div>
    </Stage>
  );
}
