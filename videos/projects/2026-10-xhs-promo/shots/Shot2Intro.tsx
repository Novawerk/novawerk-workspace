import { interpolate, useCurrentFrame } from "remotion";

import { NovaStar, Rich, Wordmark, starFall } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { useCopy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { BEAT, CUES, STAR_FALL, color, ease, sec } from "../theme";

// 0:03–0:08 · On the drop the ink panel from the hook takes the whole frame. The Nova Star falls in
// folded, lands on 3.5 s and unfolds, then settles into the lockup at the top; the line lands;
// the home page of novawerk.io drops in like one of the notes.
export const SHOT2_FRAMES = sec(CUES.pitch - CUES.intro);

const SETTLE = 2 * BEAT; // star moves into the lockup on 4.0 s
const CAPTION = SETTLE + 4;
const SITE = 4 * BEAT; // 5.0 s
const SUB = 6 * BEAT; // 6.0 s
const SPIN = 360 / (14 * 30); // the site's 14-second turn, per frame

/** `upright` stops the star's turn, for the poster (Poster.tsx). */
export function Shot2Intro({ upright = false }: { upright?: boolean }) {
  const f = useCurrentFrame();
  const { caption, sub, site } = useCopy().intro;

  // Star: falls folded, lands big in the middle and unfolds, then moves to the lockup position.
  const fall = starFall(f, sec(STAR_FALL));
  const settle = progress(f, SETTLE, 12);
  const size = interpolate(settle, [0, 1], [300, 104]);
  const x = interpolate(settle, [0, 1], [540 - 150, 72]);
  const y = interpolate(settle, [0, 1], [560 - 150, 130]) - fall.drop * 560;
  const rotate = upright ? 0 : fall.spin + f * SPIN;
  const word = progress(f, SETTLE + 8, 8);

  const drop = progress(f, SITE, 9, ease.spring);
  const subIn = progress(f, SUB, 7);

  return (
    <Stage bg={color.ink} fg={color.paper}>
      <NovaStar
        size={size}
        tone="dark"
        reach={fall.reach}
        style={{ position: "absolute", left: x, top: y, transform: `scale(${fall.scaleX}, ${fall.scaleY}) rotate(${rotate}deg)`, transformOrigin: "50% 50%" }}
      />
      <div style={{ position: "absolute", left: 72 + 104 + 52, top: 130 + 52, transform: `translate(${(1 - word) * -24}px, -50%)`, opacity: word }}>
        <Wordmark size={120} fill={color.paper} />
      </div>

      <div style={{ position: "absolute", left: 72, right: 72, top: 330, fontSize: 104, fontWeight: 900, lineHeight: 1.15, letterSpacing: -2 }}>
        {caption.map((line, k) => {
          const p = progress(f, CAPTION + k * 3, 7, ease.spring);
          return (
            <div key={line} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
              <Rich text={line} accent={color.signal} />
            </div>
          );
        })}
      </div>

      {/* The home page, as shipped: eyebrow, headline, the two buttons. */}
      <div
        style={{
          position: "absolute",
          left: 72,
          width: 936,
          top: 680,
          background: color.paper,
          color: color.ink,
          border: `3px solid ${color.paper}`,
          transform: `translateY(${(1 - drop) * 700}px) rotate(-2deg) scale(${1.1 - 0.1 * drop})`,
          opacity: f >= SITE ? 1 : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 28px", borderBottom: `2px solid ${color.line}` }}>
          <NovaStar size={30} />
          {site.url ? <span style={{ fontFamily: monoFamily, fontSize: 26, color: color.muted }}>{site.url}</span> : null}
        </div>
        <div style={{ padding: "44px 48px 52px" }}>
          <div style={{ fontFamily: monoFamily, fontSize: 26, color: color.muted }}>{site.eyebrow}</div>
          <div style={{ marginTop: 22, fontSize: 76, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2.5 }}>{site.headline}</div>
          <div style={{ marginTop: 40, display: "flex", gap: 18 }}>
            <span style={{ background: color.accent, color: color.paper, fontSize: 28, fontWeight: 500, padding: "18px 30px" }}>{site.buttons[0]}</span>
            <span style={{ border: `2px solid ${color.lineStrong}`, fontSize: 28, fontWeight: 500, padding: "16px 28px" }}>{site.buttons[1]}</span>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", left: 72, right: 72, top: 1290, fontSize: 48, fontWeight: 500, color: "rgba(255,255,255,0.72)", opacity: subIn, transform: `translateY(${(1 - subIn) * 16}px)` }}>
        {sub}
      </div>
    </Stage>
  );
}
