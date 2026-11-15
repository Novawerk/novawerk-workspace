// The soundtrack, on the same clock as the picture (timeline.ts). Instruments: kit/audio/synth.ts.
//
//   pnpm video 2026-11-psygym-recap music   → public/music.wav
//
// Night-time and glassy, to match the look: B minor (Bm7 Gmaj7 D A), 120 BPM played half-time.
// A shimmer of arpeggios opens; a soft half-time groove carries the product; under the founder only
// a slow, quiet pad so his voice carries; the close resolves to D major.

import { Mix, bass, beep, clap, each, hat, impact, kick, pad, pluck, shing, sweep, thud } from "../../kit/audio/synth.ts";
import { BAR as BAR_FRAMES, BEAT_SECONDS as B, CUES, CUTS, DURATION, FPS, PINGS, ROAD, STAR_LANDINGS } from "./timeline.ts";

const BAR = BAR_FRAMES / FPS; // 2 s
const mix = new Mix(DURATION);
const put = mix.put;

// Bm7, Gmaj7, D, A — roots and voicings.
const ROOTS = [35, 31, 38, 33];
const CHORDS = [
  [59, 62, 66, 69],
  [55, 59, 62, 66],
  [57, 62, 66, 69],
  [57, 61, 64, 69],
];
const chordAt = (t: number) => Math.floor(t / BAR) % 4;

// --- the arpeggio: chord tones an octave up, in eighths, from the hook to the founder ---------
const arpTo = CUES.founder;
each(0, arpTo, B / 2, (t, i) => {
  const ch = CHORDS[chordAt(t)]!;
  const note = ch[[0, 2, 1, 3, 2, 1, 3, 2][i % 8]!]! + 12;
  const intro = t < CUES.problem;
  put(t, pluck(note, 0.5, intro ? 0.45 : 0.35), intro ? 0.22 : 0.15, i % 2 ? 0.45 : -0.45, 0.5);
});

// --- the pad: wide and slow, the whole film; quieter under the founder ---------------------
each(0, CUES.end, BAR, (t) => {
  const under = t >= CUES.founder;
  put(t, pad(CHORDS[chordAt(t)]!, BAR + 0.3, under ? 900 : 1600, under ? 0.8 : 0.4), under ? 0.07 : 0.2, 0, 0.5, "pad");
});

// --- the groove, problem → founder: half-time kick and clap, soft hats, a round sub bass --------
const grooveFrom = CUES.problem;
const grooveTo = CUES.founder;
each(grooveFrom, grooveTo, BAR, (t) => {
  put(t, kick(), 0.7);
  put(t + 1.5 * B, kick(), 0.45);
  put(t + 2 * B, clap(), 0.35, 0, 0.35);
  put(t, bass(ROOTS[chordAt(t)]!, BAR - 0.1), 0.45);
});
each(grooveFrom + B / 2, grooveTo, B, (t) => put(t, hat(), 0.1, 0.35));

// --- risers into the big moments ----------------------------------------------------------
put(CUES.problem - 1, sweep(1, 300, 5000, (x) => x ** 2), 0.3, 0, 0.3);
put(ROAD.stops[3]! - 1, sweep(1, 300, 6000, (x) => x ** 2), 0.35, 0, 0.3);
put(ROAD.stops[3]!, impact(), 0.45, 0, 0.5);
put(CUES.end - 1, sweep(1, 300, 6000, (x) => x ** 2), 0.3, 0, 0.3);

// --- a glassy ping on every chip and card, climbing the chord --------------------------------
PINGS.forEach((t, k) => {
  const ch = CHORDS[chordAt(t)]!;
  put(t, beep(ch[k % 4]! + 24), 0.1, (k % 2 ? 1 : -1) * 0.3, 0.6);
  put(t + 0.02, shing(), 0.08, 0, 0.6);
});

// --- cuts: a soft whoosh, not a snap -------------------------------------------------------
for (const t of CUTS) put(t - 0.25, sweep(0.35, 2000, 300, (x) => x), t === CUES.founder ? 0.12 : 0.22, 0, 0.3);

// --- the close: D major, the star lands --------------------------------------------------
put(CUES.end, pad([38, 50, 57, 62, 66, 69, 74], DURATION - CUES.end, 1800, 0.1), 0.35, 0, 0.6, "pad");
put(CUES.end, impact(), 0.4, 0, 0.6);
for (const t of STAR_LANDINGS) {
  put(t, thud(), 0.5, 0, 0.3);
  put(t + 0.03, shing(), 0.3, 0, 0.7);
  [74, 78, 81, 86].forEach((m, i) => put(t + 0.08 + i * 0.09, pluck(m, 0.9, 0.5), 0.18, -0.3 + i * 0.2, 0.6));
}

// Every language shares this soundtrack; a variant (`node music.ts zh`) gets its own copy of it.
const variant = process.argv[2];
const { peak } = mix.write(new URL(`./public/${variant ? `music-${variant}` : "music"}.wav`, import.meta.url), {
  // the pad breathes with the half-time kick
  duck: (t) => (t >= grooveFrom && t < grooveTo ? 1 - 0.4 * Math.exp(-((t - grooveFrom) % BAR) / 0.2) : 1),
});
console.log(`${variant ? `music-${variant}` : "music"}.wav · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
