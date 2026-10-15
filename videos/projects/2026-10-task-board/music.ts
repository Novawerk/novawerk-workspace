// The soundtrack, on the same clock as the picture (timeline.ts). Instruments: kit/audio/synth.ts.
//
//   pnpm video 2026-10-task-board music   → public/music.wav
//
// 120 BPM, A minor (Am F C G). The hook is sparse and dramatic; the idea and the trial run sit on a
// light four-on-the-floor groove; the tower switches to 8-bit (square blips) and ends on a long chord.
// Every visual event has a sound: cuts, cards, typing, the merge, robots, the landing, the star.

import { Mix, bass, beep, each, hat, impact, key, kick, pad, patter, pluck, shing, snap, sweep, thud, tock, whir } from "../../kit/audio/synth.ts";
import { BEAT_SECONDS as B, CUES, CUTS, D, DURATION, IDEA, TOWER, TRIAL, WHY } from "./timeline.ts";

const mix = new Mix(DURATION);
const put = mix.put;
const BAR = 4 * B;
const CHORDS = [
  [45, 57, 60, 64],
  [41, 53, 57, 60],
  [48, 55, 60, 64],
  [43, 55, 59, 62],
]; // Am F C G

// 1 · Hook (0–6 s): beats of 3, 3, 1, 5.
{
  const o = CUES.hook;
  const fr = (n: number) => o + n / 30;
  put(o, sweep(D.slam / 30, 2500, 300, (x) => x), 0.4, 0, 0.1);
  put(fr(D.slam), thud(), 1.2, 0, 0.2);
  put(fr(D.slam), impact(1.2), 0.8, 0, 0.3);
  put(fr(D.slam), tock(), 0.9);
  each(fr(D.slam), fr(D.slam + 6), 0.03, (t) => put(t, snap(), 0.18, Math.sin(t * 50) * 0.8));
  put(fr(D.slam) + 0.2, pad([33, 45], D.line1 / 30 - D.slam / 30 - 0.2, 600, 0.2), 0.3, 0, 0.3, "pad");
  put(fr(D.line1), tock(), 0.6);
  [57, 60, 64].forEach((m, i) => put(fr(D.line1) + i * B, pluck(m, 1.2, 0.4), 0.4 - i * 0.04, 0, 0.35));
  put(fr(D.quiet) - 1, sweep(1, 200, 8000, (x) => x ** 2.6), 0.55, 0, 0);
  put(fr(D.cut), impact(), 1, 0, 0.5);
  put(fr(D.cut), kick(), 1);
  put(fr(D.cut), snap(), 0.7);
  put(fr(D.cut) + 0.03, shing(), 0.4, 0, 0.6);
  each(fr(D.cut) + B / 2, CUES.why, B / 2, (t, i) => put(t, i % 2 ? kick() : hat(), i % 2 ? 0.8 : 0.3));
  for (let i = 0; i < 8; i++) put(fr(D.cut + 8 + i * 3), tock(), 0.3, -0.6 + i * 0.17);
  put(fr(D.cut), pad([48, 55, 60, 64, 67, 72], CUES.why - fr(D.cut), 2600, 0.01), 0.5, 0, 0.45, "pad");
}

// 2 · Why (6–10 s): a lighter bed (bass and pad, no drums yet); a tock as each note lands, a
// scratch as it is struck through, a soft pluck under each caption; the calendar fills with ticks.
each(CUES.why, CUES.idea - 0.01, BAR, (t, i) => {
  const c = CHORDS[i % 4]!;
  put(t, pad(c, BAR, 1100, 0.2), 0.25, 0, 0.35, "pad");
  put(t, bass(c[0]!, BAR - 0.05), 0.35);
});
[WHY.plan1, WHY.plan2].forEach((p, n) => {
  const o = CUES.why + p;
  put(o + WHY.land, tock(), 0.8);
  put(o + WHY.caption, pluck(n ? 60 : 57, 1, 0.4), 0.35, 0, 0.35);
  put(o + WHY.strike, sweep(0.27, 6000, 1500, (x) => x), 0.5, 0, 0.05);
  put(o + WHY.strike + 0.27, snap(), 0.6);
});
for (let i = 0; i < 35; i++) put(CUES.why + WHY.plan2 + WHY.land + (4 + (i % 7) * 0.6 + Math.floor(i / 7) * 0.9) / 30, tock(), 0.12, ((i % 7) - 3) / 4);

// 3–4 · The groove under the idea and the trial run (10–29 s): kick, off-beat hats, bass, pads.
each(CUES.idea, CUES.tower, B, (t) => put(t, kick(), 0.75));
each(CUES.idea + B / 2, CUES.tower, B, (t) => put(t, hat(), 0.22));
each(CUES.idea, CUES.tower - 0.01, BAR, (t, i) => {
  const c = CHORDS[i % 4]!;
  put(t, pad(c, BAR, 1500, 0.2), 0.3, 0, 0.35, "pad");
  put(t, bass(c[0]! - 12 + 12, BAR - 0.05), 0.45);
});

// 3 · Idea: the two notes swish off, a riser into the sort, a tock as each of the 18 cards lands in its column.
put(CUES.idea + IDEA.sweep, sweep(0.45, 800, 5000, (x) => x), 0.35, 0, 0.1);
put(CUES.idea + IDEA.caption, pluck(69, 0.6, 0.6), 0.35, 0, 0.3);
for (let i = 0; i < 18; i++) put(CUES.idea + IDEA.fly + i * IDEA.flyStep + 0.3, tock(), 0.35, -0.7 + (i % 5) * 0.35);
put(CUES.idea + IDEA.sub, pluck(64, 0.6, 0.5), 0.3, 0, 0.3);

// 3 · Trial run.
{
  const o = CUES.trial;
  put(o + 0.2, whir(0.4), 0.25); // the site card slides up
  put(o + 0.73, tock(), 0.5); // AI-native lands
  put(o + 1.0, pluck(72, 0.4, 0.7), 0.3);
  put(o + 1.5, pluck(76, 0.4, 0.7), 0.3); // the two buttons
  for (let i = 0; i < 5; i++) put(o + TRIAL.tasks + 0.5 + i * TRIAL.taskStep, tock(), 0.75, -0.4 + i * 0.2); // five tasks drop
  put(o + TRIAL.tasks + 2.6, pluck(64, 0.6, 0.5), 0.3);
  TRIAL.steps.forEach((t, i) => {
    put(o + t, tock(), 0.6);
    put(o + t, pluck(57 + [0, 3, 7, 10, 12][i]!, 0.5, 0.6), 0.35, 0, 0.3);
  });
  each(o + TRIAL.typing, o + TRIAL.typing + 11 / 30, 1 / 30, (t) => put(t, key(), 0.45, Math.sin(t * 13) * 0.3)); // Task: NW-11
  put(o + TRIAL.steps[4]! - 0.6, sweep(0.6, 300, 6000, (x) => x ** 2), 0.4, 0, 0.1);
  put(o + TRIAL.steps[4]!, thud(), 0.8, 0, 0.2); // merged
  put(o + TRIAL.werk, shing(), 0.45, 0, 0.6); // +8 Werk
  put(o + TRIAL.werk, pluck(81, 0.8, 0.8), 0.3, 0, 0.4);
  put(o + TRIAL.thanks, pluck(69, 0.8, 0.5), 0.3, 0, 0.4);
  // Agent: beeps, little footsteps, the 待你确认 stamp.
  [0.1, 0.4, 0.7].forEach((t, i) => put(o + TRIAL.agent + t + 0.2, beep(76 + i * 3), 0.35, i % 2 ? 0.5 : -0.5));
  each(o + TRIAL.agent + 0.2, CUES.tower, 0.09, (t, i) => put(t, patter(), 0.25, (i % 3) - 1));
  put(o + TRIAL.agent + 0.9, thud(), 0.9, 0, 0.2);
  put(o + TRIAL.agent + 0.9, impact(0.8), 0.5, 0, 0.3);
}

// 4 · The tower (25–36 s), in 8-bit: a falling sweep, the thud on NW-3, square-wave arpeggios,
// a pop per pixel person, the star's shing, a long final chord.
{
  const o = CUES.tower;
  [81, 88].forEach((m, i) => put(o + i * 0.15, beep(m), 0.35, 0, 0.3));
  put(o + TOWER.dropFrom, sweep(TOWER.land - TOWER.dropFrom, 5000, 120, (x) => x ** 0.6), 0.55, 0, 0.1);
  each(o + TOWER.dropFrom + 0.6, o + TOWER.land, B / 2, (t) => put(t, hat(), 0.18));
  put(o + TOWER.land, thud(), 1.1, 0, 0.3);
  put(o + TOWER.land, impact(1.2), 0.7, 0, 0.4);
  put(o + TOWER.land + 0.02, beep(52), 0.5);
  put(o + TOWER.land + 0.1, shing(), 0.4, 0, 0.6);
  for (let i = 0; i < 6; i++) put(o + TOWER.land + (4 + i * 3) / 30, beep(72 + (i % 3) * 5), 0.22, -0.6 + i * 0.24);
  // 8-bit arpeggios over Am F C G until the end card.
  each(o + TOWER.first, o + TOWER.end, B / 2, (t, i) => {
    const c = CHORDS[Math.floor(i / 8) % 4]!;
    put(t, beep(c[1 + (i % 3)]! + 12), 0.16, (i % 2) * 0.6 - 0.3);
  });
  each(o + TOWER.first, o + TOWER.end, B, (t) => put(t, kick(), 0.6));
  [TOWER.first, TOWER.nw3, TOWER.next].forEach((t) => put(o + t, tock(), 0.6));
  put(o + TOWER.next, pluck(69, 1.2, 0.6), 0.45, 0, 0.5);
  put(o + TOWER.end, shing(), 0.45, 0, 0.7);
  put(o + TOWER.end, pad([45, 57, 60, 64, 69, 72], DURATION - o - TOWER.end, 2200, 0.05), 0.55, 0, 0.5, "pad");
}

for (const t of CUTS) put(t, snap(), 0.5, 0, 0.08);

const { peak } = mix.write(new URL("./public/music.wav", import.meta.url));
console.log(`music.wav · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
