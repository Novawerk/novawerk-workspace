// The soundtrack, on the same clock as the picture (timeline.ts). Instruments: kit/audio/synth.ts.
//
//   pnpm video <project> music   → public/music.wav
//
// A starting point: plucks on the hook's notes, a riser into the cut, four on the floor under a
// pad, a snap on every cut and the star's landing.

import { Mix, each, impact, kick, pad, pluck, shing, snap, sweep, thud, tock } from "../../kit/audio/synth.ts";
import { BEAT_SECONDS as B, CUES, CUTS, DURATION, STAR_LANDINGS } from "./timeline.ts";

const mix = new Mix(DURATION);
const put = mix.put;

// The hook: a tock and a rising pluck on each note, a riser into the cut.
[57, 64, 69].forEach((m, i) => {
  put(i * B, tock(), 0.8);
  put(i * B, pluck(m, 0.9, 0.7), 0.5, 0, 0.35);
});
put(CUES.cta - 1, sweep(1, 400, 7000, (x) => x ** 2.2), 0.5, 0, 0.1);

// The body: four on the floor under a held A minor, ducked by the kick.
each(B * 2, CUES.cta, B, (t) => put(t, kick(), 0.9));
put(B * 2, pad([45, 57, 60, 64], CUES.cta - B * 2, 1200), 0.25, 0, 0.35, "pad");

// The call to action: a boom and a held C.
put(CUES.cta, impact(), 0.7, 0, 0.5);
put(CUES.cta, pad([36, 48, 55, 60, 64, 67], DURATION - CUES.cta, 1600, 0.05), 0.5, 0, 0.5, "pad");

for (const t of CUTS) put(t, snap(), 0.55, 0, 0.08);
for (const t of STAR_LANDINGS) {
  put(t, thud(), 0.7, 0, 0.2);
  put(t + 0.03, shing(), 0.3, 0, 0.6);
}

const { peak } = mix.write(new URL("./public/music.wav", import.meta.url), {
  duck: (t) => (t >= B * 2 && t < CUES.cta ? 1 - 0.6 * Math.exp(-((t - B * 2) % B) / 0.09) : 1),
});
console.log(`music.wav · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
