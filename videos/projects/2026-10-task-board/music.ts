// The soundtrack, on the same clock as the picture (timeline.ts). Score: ./score.ts.
//
//   pnpm video 2026-10-task-board music      → public/music.wav

import { Mix, SR } from "../../kit/audio/synth.ts";
import { H, pop, sfx } from "./score.ts";
import { DURATION } from "./timeline.ts";

const mix = new Mix(DURATION);
const duck = pop(mix.put);
sfx(mix.put);

// Half a beat of true silence before the twist: every bus is cut, with 20 ms edges.
for (const bus of [mix.l, mix.r, mix.send, mix.padL, mix.padR]) {
  for (let j = Math.floor((H.quiet - 0.02) * SR); j < Math.floor(H.cut * SR); j++) {
    const t = j / SR;
    bus[j]! *= Math.max(0, Math.min(1, (H.quiet - t) / 0.02, (t - (H.cut - 0.02)) / 0.02));
  }
}

const { peak } = mix.write(new URL("./public/music.wav", import.meta.url), { duck });
console.log(`music.wav · synth-pop · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
