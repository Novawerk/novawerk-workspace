// The soundtrack, on the same clock as the picture (timeline.ts). Instruments: kit/audio/synth.ts.
//
//   pnpm video 2026-10-psygym music   → public/music.wav
//
// 120 BPM, D major (D Bm G A, one chord a bar). The hook is sparse; the beat comes in with the
// pitch; half time for the two pains, claps for the slams; the canvas fills over a lighter groove;
// everything for the road and the call; drums out for the names, robots hammering, one held chord.

import { Biquad, Mix, SR, bass, buf, clap, each, hat, impact, key, kick, noise, pad, pluck, rand, shing, snap, sweep, thud, tock } from "../../kit/audio/synth.ts";
import { BEAT_SECONDS, CUES, CUTS, DURATION, EMAIL, END, HOOK, PITCH, PLAN, RECRUIT, ROAD, TYPING, WHY, hammerTimes, keyTimes } from "./timeline.ts";

const mix = new Mix(DURATION);
const put = mix.put;

/** A small hammer on metal: a bright inharmonic ping over a click. */
function tink(base: number) {
  const s = buf(0.35);
  const partials = [1, 2.76, 5.4].map((r) => base * r);
  const hp = new Biquad("hp", 3000, 0.8);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let x = 0;
    partials.forEach((f, k) => (x += (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (14 + k * 10))) / (k + 1)));
    s[i] = x * 0.6 + hp.run(noise()) * Math.exp(-t * 300) * 0.5;
  }
  return s;
}

// --- arrangement -----------------------------------------------------------------------------

const B = BEAT_SECONDS; // 0.5 s
const BAR = 4 * B; // 2 s
// D Bm G A: bass root, pad voicing, arp tones.
const CHORDS = [
  { root: 38, pad: [62, 66, 69], arp: [74, 78, 81, 78] },
  { root: 35, pad: [62, 66, 71], arp: [71, 74, 78, 74] },
  { root: 31, pad: [62, 67, 71], arp: [67, 71, 74, 71] },
  { root: 33, pad: [61, 64, 69], arp: [69, 73, 76, 73] },
];
const chordAt = (t: number) => CHORDS[Math.floor(t / BAR) % 4]!;

const K = kick(), H = hat(), HO = hat(true), C = clap(), T = tock(), I = impact();
const DROP = CUES.pitch, BREAK = CUES.end; // the drums run from the pitch to the names

// Hook, 0–3 s: the note lands, the stamp, the dashed line draws (a rising arp), the goal pops.
put(HOOK.note, T, 0.8);
put(HOOK.note, pluck(62, 1.2, 0.6), 0.4, 0, 0.4);
put(HOOK.stamp, thud(), 0.6, 0.2, 0.2);
put(HOOK.stamp, T, 0.7, 0.2);
[62, 66, 69, 74].forEach((m, i) => put(HOOK.line + i * (B / 4), pluck(m + 12, 0.7, 0.6), 0.28, -0.3 + i * 0.2, 0.4));
put(HOOK.goal, pluck(86, 1.2, 0.5), 0.35, 0.3, 0.5);
put(HOOK.goal, pad([50, 62, 66, 69], CUES.pitch - HOOK.goal, 900, 0.3), 0.2, 0, 0.3, "pad");
put(CUES.pitch - 0.9, sweep(0.9, 400, 7000, (x) => x ** 2.2), 0.45, 0, 0.1); // riser into the beat

// The groove.
// Half-time for the two pains and while the canvas fills.
const light = (t: number) => (t >= WHY.painA && t < WHY.solve) || (t >= CUES.plan && t < CUES.road);
each(DROP, BREAK, B, (t, i) => (!light(t) || i % 2 === 0) && put(t, K, light(t) ? 0.7 : 0.95));
each(CUES.email, BREAK, B, (t) => put(t + B / 2, H, light(t) ? 0.16 : 0.26, 0.35));
each(CUES.why, BREAK, B / 2, (t, i) => !light(t) && i % 2 && put(t + B / 4, H, 0.1, -0.35));
each(CUES.why, BREAK, BAR, (t) => [B, 3 * B].forEach((o) => !light(t + o) && put(t + o, C, 0.4, 0, 0.25)));
each(CUES.road, BREAK, BAR, (t) => put(t + 3.5 * B, HO, 0.16, 0.4, 0.2));
for (const [t, g] of [[CUES.pitch, 1], [CUES.why, 0.9], [CUES.road, 0.9], [CUES.recruit, 0.7]] as const) put(t, I, 0.7 * g, 0, 0.5);

each(DROP, BREAK, B / 2, (t, i) => put(t, bass(chordAt(t).root + (i % 2 ? 12 : 0), B / 2 - 0.01), light(t) ? 0.3 : 0.42));
each(DROP, CUES.out, BAR, (t) => {
  const len = Math.min(BAR, CUES.out - t) + 0.3;
  put(t, pad(chordAt(t).pad, len, t < CUES.why ? 1100 : 1700), 0.22, -0.6, 0.35, "pad");
  put(t, pad(chordAt(t).pad.map((m) => m + 12), len, 1300), 0.1, 0.6, 0.35, "pad");
});
// The arp: in for the ink section, brighter on the road.
each(CUES.why, BREAK, B / 2, (t, i) => !light(t) && put(t, pluck(chordAt(t).arp[i % 4]!, 0.45, 0.5), t < CUES.road ? 0.12 : 0.17, i % 2 ? 0.45 : -0.45, 0.3));

// Shot 2: the pitch is typed, sent, three parts tick.
for (const t of keyTimes(TYPING.pitch)) put(t, key(), 0.5, (rand() - 0.5) * 0.3, 0.05);
put(PITCH.send - 0.1, sweep(0.12, 600, 4000, (x) => x ** 2), 0.3, 0.2, 0.1);
put(PITCH.send, pluck(86, 0.4, 0.6), 0.3, 0.2, 0.3);
PITCH.ticks.forEach((t, i) => {
  put(t, T, 0.6, 0.3);
  put(t, pluck([78, 81, 86][i]!, 0.7, 0.6), 0.32, 0.3, 0.4);
});

// Shot 3: the email slides in; its lines; the stamp.
put(EMAIL.arrive, sweep(0.35, 2500, 500, (x) => Math.sin(Math.PI * x)), 0.4, 0.4, 0.2);
put(EMAIL.arrive + 0.5, pluck(74, 0.6, 0.5), 0.2, 0, 0.3);
put(EMAIL.arrive + 0.9, pluck(78, 0.6, 0.5), 0.2, 0, 0.3);
put(EMAIL.stamp, thud(), 0.85, 0, 0.3);
put(EMAIL.stamp, C, 0.5, 0, 0.3);
put(EMAIL.stamp, I, 0.45, 0, 0.4);

// Shot 4: the old name struck, the new one slams in.
put(WHY.name - 1 / 3, sweep(0.25, 1200, 5000, (x) => x), 0.25, 0, 0.1);
// Pain one: the clock racing — a dry tick every quarter beat, low and a little sad.
each(WHY.painA, WHY.painB, B / 4, (t, i) => put(t, tink(i % 2 ? 2400 : 2000), 0.07, 0.3, 0.05));
put(WHY.painA + 0.3, pluck(50, 2, 0.3), 0.3, 0, 0.5);
// Pain two: the queue shuffling — a soft step each beat; the price tag's little ring.
each(WHY.painB, WHY.solve, B, (t) => put(t, thud(), 0.25, -0.3, 0.1));
put(WHY.painB + 0.4, tink(1600), 0.18, 0.6, 0.3);
put(WHY.painB + 0.3, pluck(47, 2, 0.3), 0.3, 0, 0.5);
// The answer: a lift into the white, then each card slams with a chord; its demo pops.
put(WHY.solve - 0.6, sweep(0.6, 500, 6000, (x) => x ** 2), 0.35, 0, 0.1);
for (const t of [WHY.name, ...WHY.cards]) {
  put(t, I, 0.5, 0, 0.3);
  put(t, C, 0.45, 0, 0.3);
  [62, 66, 69].forEach((m) => put(t, pluck(m + 12, 0.9, 0.7), 0.18, 0, 0.4));
}
WHY.cards.forEach((t) => {
  put(t + 8 / 30, pluck(81, 0.5, 0.6), 0.25, 0.3, 0.3);
  put(t + 22 / 30, pluck(86, 0.5, 0.6), 0.25, -0.3, 0.3);
});

// Shot 5: the cards fold into frames (a whoosh), then a soft click for every frame that appears.
put(CUES.plan - 0.05, sweep(0.5, 3000, 400, (x) => Math.sin(Math.PI * x)), 0.35, 0, 0.2);
put(CUES.plan + PLAN.morph, T, 0.6, 0);
for (let rank = 2; rank < 18; rank++) {
  const t = CUES.plan + PLAN.zoomFrom + (4 + rank * 5) / 30;
  put(t, pluck([74, 78, 81, 86][rank % 4]!, 0.35, 0.8), 0.1, (rank % 5) / 2.5 - 0.8, 0.3);
}
put(CUES.plan + 100 / 30, T, 0.6, -0.2);
put(CUES.plan + 130 / 30, T, 0.6, 0.2);

// Shot 6: the road — a slam per stop; the launch is the big one.
ROAD.stops.forEach((t, i) => {
  const last = i === ROAD.stops.length - 1;
  put(t, T, 0.75, -0.3 + i * 0.2);
  put(t, pluck([74, 78, 81, 86][i]!, 0.8, 0.6), 0.3, 0, 0.4);
  if (last) {
    put(t, I, 0.7, 0, 0.5);
    put(t, C, 0.5, 0, 0.3);
    [62, 66, 69, 74, 78].forEach((m, k) => put(t + k * 0.03, pluck(m + 12, 1.6, 0.5), 0.2, -0.4 + k * 0.2, 0.5));
  }
});

// Shot 7: who we're looking for, then the panel with the way in.
RECRUIT.cards.forEach((t, i) => put(t, T, 0.7, -0.4 + (i % 2) * 0.8));
put(RECRUIT.cta - 4 / 30 - 0.12, sweep(0.5, 300, 2600, (x) => Math.sin(Math.PI * x) ** 2), 0.45, 0, 0.2);
put(RECRUIT.cta, pluck(86, 1, 0.5), 0.3, 0, 0.4);

// Shot 8: the names, the star falls and unfolds, one held chord to the end.
put(CUES.end, I, 0.6, 0, 0.6);
put(CUES.end, pad([38, 50, 57, 62, 66, 69, 76], DURATION - CUES.end, 1600, 0.05), 0.55, 0, 0.5, "pad");
[62, 66, 69, 74, 78].forEach((m, i) => put(CUES.end + i * 0.045, pluck(m, 2.5, 0.45), 0.3, -0.4 + i * 0.2, 0.6));
put(CUES.end, bass(26, DURATION - CUES.end - 0.2), 0.45);
put(END.marks + B, thud(), 0.7, 0, 0.2);
put(END.marks + B + 0.03, shing(), 0.3, 0, 0.6);

// The robots hammering at the logo: a tink per hit, each robot its own pitch.
[1320, 1760, 1480].forEach((base, k) => {
  const T2 = tink(base);
  for (const t of hammerTimes(k)) put(t, T2, 0.22, [-0.5, 0.5, 0.2][k]!, 0.15);
});

// Every cut: a quick swish into it and a dry snap on it.
const SNAP = snap();
for (const t of CUTS) {
  put(t - 0.14, sweep(0.14, 900, 6000, (x) => x ** 3), 0.25, 0, 0.05);
  put(t, SNAP, 0.5, 0, 0.08);
}

const { peak } = mix.write(new URL("./public/music.wav", import.meta.url), {
  duck: (t) => (t >= DROP && t < BREAK ? 1 - 0.6 * Math.exp(-((t - DROP) % B) / 0.09) : 1),
});
console.log(`music.wav · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
