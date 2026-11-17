// The soundtrack, on the same clock as the picture (timeline.ts). Instruments: kit/audio/synth.ts.
//
//   pnpm video 2026-11-github-101 music   → public/music.wav
//
// Someone is talking the whole time, so the music stays out of the way: C major (C Am F G), 120 BPM,
// a soft pad and a sparse pluck, a light pulse through the middle. What carries the picture are the
// effects: a tock for every note that lands, a click for every click, keys for every typed word, a
// chime when something is closed or merged. Root.tsx plays this file at half volume under the voice.

import { Mix, beep, each, impact, key, kick, pad, pluck, shing, snap, sweep, thud, tock } from "../../kit/audio/synth.ts";
import { BEAT_SECONDS as B, CLOSE, CUTS, DURATION, EDIT, HABITS, HOOK, ISSUE, SHOTS, START, WHAT, WORDS } from "./timeline.ts";

const BAR = B * 4;
const mix = new Mix(DURATION);
const put = mix.put;

const CHORDS = [
  [48, 60, 64, 67],
  [45, 57, 60, 64],
  [41, 57, 60, 65],
  [43, 59, 62, 67],
];
const chordAt = (t: number) => CHORDS[Math.floor(t / BAR) % 4]!;
const body = { from: SHOTS.what!.start, to: SHOTS.close!.start };

// --- the bed: a pad the whole way, a pluck on the off-beats, a soft pulse from "what" to the close
each(0, SHOTS.close!.start, BAR, (t) => put(t, pad(chordAt(t), BAR + 0.3, 1300, 0.5), 0.16, 0, 0.4, "pad"));
each(body.from, body.to, B, (t, i) => {
  const ch = chordAt(t);
  put(t + B / 2, pluck(ch[1 + (i % 3)]! + 12, 0.5, 0.3), 0.1, i % 2 ? 0.4 : -0.4, 0.5);
});
each(body.from, body.to, B * 2, (t) => put(t, kick(), 0.3));

// --- cuts: a soft whoosh into each, a snap on it
for (const t of CUTS) {
  put(t - 0.25, sweep(0.3, 2500, 400, (x) => x), 0.2, 0, 0.3);
  put(t, snap(), 0.3, 0, 0.1);
}

// --- things landing ------------------------------------------------------------------------
const lands = [...HOOK.chats, ...HOOK.mails, ...HOOK.files, ...WORDS.cards, ...START.steps, ...EDIT.drop, ...HABITS.notes];
lands.forEach((t, i) => put(t, tock(), 0.6, i % 2 ? 0.25 : -0.25, 0.15));
put(HOOK.ask, thud(), 0.7, 0, 0.3);
put(WHAT.land - 0.9, sweep(0.9, 300, 5000, (x) => x ** 2), 0.3, 0, 0.3);
put(WHAT.land, thud(), 0.9, 0, 0.3);
put(WHAT.land, impact(1.2), 0.3, 0, 0.5);
[WHAT.window, WHAT.files, WHAT.board, WHAT.history].forEach((t, i) => put(t, beep(72 + [0, 4, 7, 12][i]!), 0.12, 0, 0.5));
WORDS.gloss.forEach((t, i) => put(t, pluck(72 + [0, 4, 7][i]!, 0.8, 0.5), 0.25, 0, 0.6));

// --- the pointer: a click each time it presses something
const clicks = [START.accept, ISSUE.newClick, ISSUE.createClick, EDIT.pencilClick, EDIT.commitClick, EDIT.addFile, EDIT.upload, EDIT.pick, EDIT.createClick];
for (const t of clicks) {
  put(t, key(), 0.9);
  put(t + 0.02, snap(), 0.25, 0, 0.1);
}

// --- typing: a key for every character, at the speed the shots type (shots/parts.tsx `typed`)
const type = (from: number, chars: number, perSecond = 15) => each(from, from + chars / perSecond, 1 / perSecond, (t, i) => put(t, key(), 0.28 + (i % 3) * 0.05, ((i % 5) - 2) * 0.1));
type(START.steps[0]! + 0.4, 9, 16);
type(ISSUE.title, 13);
type(ISSUE.desc, 14);
type(ISSUE.desc + 14 / 15 + 0.2, 14);
type(EDIT.rewrite + 0.27, 10, 14);
type(EDIT.message, 9, 13);
put(ISSUE.paste, tock(), 0.5, 0, 0.2);

// --- replies arrive; closed and merged get a chime
[...ISSUE.comments, EDIT.review].forEach((t, i) => put(t, beep(76 + (i % 2) * 3), 0.14, 0, 0.5));
for (const t of [ISSUE.close, EDIT.merge]) {
  put(t, shing(), 0.3, 0, 0.6);
  [72, 76, 79, 84].forEach((m, i) => put(t + i * 0.08, pluck(m, 0.9, 0.5), 0.22, -0.3 + i * 0.2, 0.6));
}
put(START.accept + 0.12, pluck(84, 0.8, 0.5), 0.2, 0, 0.6);

// --- the close: C major held, the star lands
put(SHOTS.close!.start, pad([36, 48, 55, 60, 64, 67, 72], DURATION - SHOTS.close!.start, 1700, 0.1), 0.4, 0, 0.6, "pad");
put(SHOTS.close!.start, impact(), 0.4, 0, 0.6);
put(CLOSE.land, thud(), 0.7, 0, 0.3);
put(CLOSE.land + 0.03, shing(), 0.3, 0, 0.7);
[72, 76, 79, 84].forEach((m, i) => put(CLOSE.land + 0.08 + i * 0.09, pluck(m, 0.9, 0.5), 0.2, -0.3 + i * 0.2, 0.6));

const { peak } = mix.write(new URL("./public/music.wav", import.meta.url), {
  // the pad breathes with the pulse
  duck: (t) => (t >= body.from && t < body.to ? 1 - 0.35 * Math.exp(-((t - body.from) % (B * 2)) / 0.15) : 1),
});
console.log(`music.wav · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
