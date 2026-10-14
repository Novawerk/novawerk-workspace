import { useCurrentFrame } from "remotion";

import { Lockup, Note, NovaStar, Rich, starFall } from "../../../kit/brand";
import { Stage, progress } from "../../../kit/motion";
import { useCopy } from "../copy";
import { monoFamily } from "../../../kit/fonts";
import { BEAT, CUES, STAR_FALL, TYPING, color, ease, sec } from "../theme";

// 0:34–0:41 · The breakdown: on ink, the spinning star; the lead types itself out (a key click per
// character in the music) and the next project drops in as a note. On 37.5 s a hard cut to white:
// the star falls into the lockup and unfolds, the wordmark slides out, the last line, the address.
export const SHOT6_FRAMES = sec(CUES.end - CUES.next);

const CTA = sec(CUES.cta - CUES.next); // 105
const SPIN = 360 / (14 * 30);

export function Shot6Next() {
  const f = useCurrentFrame();
  return f < CTA ? <Next f={f} /> : <Cta f={f - CTA} spin={f * SPIN} />;
}

function Next({ f }: { f: number }) {
  const { next, lang } = useCopy();
  const { lead, leadSize, label, name, sub } = next;
  const spec = TYPING[lang].nextLead;
  const typed = Math.min(spec.chars, Math.floor(f / spec.every) + 1);
  const typing = typed < spec.chars || f % BEAT < 8; // caret blinks once done
  const drop = progress(f, 2 * BEAT, 9, ease.spring);
  const subIn = progress(f, 3 * BEAT, 7);
  return (
    <Stage bg={color.ink} fg={color.paper}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 150, display: "flex", justifyContent: "center" }}>
        <NovaStar size={150} tone="dark" rotate={f * SPIN} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 400, textAlign: "center", fontSize: leadSize, fontWeight: 900 }}>
        {[...lead].slice(0, typed).join("")}
        <span style={{ display: "inline-block", width: 6, height: leadSize, marginLeft: 8, verticalAlign: "-10px", background: color.signal, opacity: typing ? 1 : 0 }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 570, display: "flex", justifyContent: "center" }}>
        <Note
          style={{
            padding: "40px 60px 48px",
            border: "none",
            transform: `rotate(-2deg) scale(${1.25 - 0.25 * drop})`,
            opacity: f >= 2 * BEAT ? drop : 0,
          }}
        >
          <div style={{ fontFamily: monoFamily, fontSize: 28, fontWeight: 500, color: color.accent, letterSpacing: 2 }}>{label}</div>
          <div style={{ marginTop: 12, fontSize: 128, fontWeight: 900, letterSpacing: -2 }}>{name}</div>
        </Note>
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 960, textAlign: "center", fontSize: 50, fontWeight: 500, color: "rgba(255,255,255,0.75)", opacity: subIn, transform: `translateY(${(1 - subIn) * 16}px)` }}>
        {sub}
      </div>
    </Stage>
  );
}

function Cta({ f, spin }: { f: number; spin: number }) {
  const { caption, pill: label } = useCopy().cta;
  const fall = starFall(f, sec(STAR_FALL));
  const word = progress(f, sec(STAR_FALL) + 5, 8);
  const pill = progress(f, 2 * BEAT, 9, ease.spring);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 0, right: 0, top: 330, display: "flex", justifyContent: "center" }}>
        <Lockup
          height={110}
          reach={fall.reach}
          starStyle={{ transform: `translateY(${-fall.drop * 700}px) scale(${fall.scaleX}, ${fall.scaleY}) rotate(${fall.spin + spin}deg)`, transformOrigin: "50% 50%" }}
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
        <div
          style={{
            background: color.ink,
            color: color.paper,
            fontSize: 84,
            fontWeight: 700,
            letterSpacing: -2,
            padding: "28px 64px 34px",
            transform: `scale(${0.6 + 0.4 * pill})`,
            opacity: pill,
          }}
        >
          {label}
        </div>
      </div>
    </Stage>
  );
}
