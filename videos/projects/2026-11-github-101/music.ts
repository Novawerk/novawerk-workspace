// The soundtrack, on the same clock as the picture (timeline.ts). Instruments: kit/audio/synth.ts.
//
//   pnpm video 2026-11-github-101 music   → public/music.wav (Chinese) and public/music-en.wav
//
// Someone is talking the whole time, so the music stays out of the way: C major (C Am F G), 120 BPM,
// a soft pad and a sparse pluck, a light pulse through the middle. What carries the picture are the
// effects: a tock for every note that lands, keys while a message is typed, a click when it is sent,
// a chime when the agent answers and when something is closed or merged. Root.tsx plays this file at
// half volume under the voice. Each language has its own clock, so its own file.

import { Mix, beep, each, impact, key, kick, pad, pluck, shing, snap, sweep, thud, tock } from "../../kit/audio/synth.ts";
import { BEAT_SECONDS as B, TIMELINES } from "./timeline.ts";

const variant = process.argv[2];
const t = TIMELINES[variant ?? "zh"];
if (!t) throw new Error(`no voice for "${variant}" in voice.ts`);
const { SHOTS, HOOK, WELCOME, WHAT, WORDS, START, AGENT, ISSUE, PR, HABITS, CLOSE } = t;

const BAR = B * 4;
const mix = new Mix(t.DURATION);
const put = mix.put;

const CHORDS = [
  [48, 60, 64, 67],
  [45, 57, 60, 64],
  [41, 57, 60, 65],
  [43, 59, 62, 67],
];
const chordAt = (s: number) => CHORDS[Math.floor(s / BAR) % 4]!;
const body = { from: SHOTS.welcome!.start, to: SHOTS.close!.start };

// --- the bed: a pad the whole way, a pluck on the off-beats, a soft pulse from the welcome to the close
each(0, SHOTS.close!.start, BAR, (s) => put(s, pad(chordAt(s), BAR + 0.3, 1300, 0.5), 0.16, 0, 0.4, "pad"));
each(body.from, body.to, B, (s, i) => put(s + B / 2, pluck(chordAt(s)[1 + (i % 3)]! + 12, 0.5, 0.3), 0.1, i % 2 ? 0.4 : -0.4, 0.5));
each(body.from, body.to, B * 2, (s) => put(s, kick(), 0.3));

// --- cuts: a soft whoosh into each, a snap on it
for (const s of t.CUTS) {
  put(s - 0.25, sweep(0.3, 2500, 400, (x) => x), 0.2, 0, 0.3);
  put(s, snap(), 0.3, 0, 0.1);
}

// --- things landing ------------------------------------------------------------------------
const lands = [...HOOK.chats, ...HOOK.mails, ...HOOK.files, ...WORDS.cards, ...START.steps, ...AGENT.names, AGENT.swap, AGENT.talk, ...PR.files, ...HABITS.notes];
lands.forEach((s, i) => put(s, tock(), 0.6, i % 2 ? 0.25 : -0.25, 0.15));
put(HOOK.ask, thud(), 0.7, 0, 0.3);
put(WELCOME.number, thud(), 0.6, 0, 0.3);
put(WELCOME.today, thud(), 0.6, 0, 0.3);
put(WHAT.land - 0.4, sweep(0.4, 300, 5000, (x) => x ** 2), 0.3, 0, 0.3);
put(WHAT.land, thud(), 0.9, 0, 0.3);
[WHAT.window, WHAT.files, WHAT.board, WHAT.history].forEach((s, i) => put(s, beep(72 + [0, 4, 7, 12][i]!), 0.12, 0, 0.5));
WORDS.gloss.forEach((s, i) => put(s, pluck(72 + [0, 4, 7][i]!, 0.8, 0.5), 0.25, 0, 0.6));

// --- the pointer clicks; a message is sent
for (const s of [START.accept, AGENT.connectClick, ISSUE.send, PR.send]) {
  put(s, key(), 0.9);
  put(s + 0.02, snap(), 0.25, 0, 0.1);
}
put(START.accept + 0.12, pluck(84, 0.8, 0.5), 0.2, 0, 0.6);
put(AGENT.connectClick + 0.12, pluck(84, 0.8, 0.5), 0.2, 0, 0.6);

// --- typing: keys for as long as a message is being typed (the shots type it over the same windows)
const type = (from: number, to: number) => each(from, to, 1 / 13, (s, i) => put(s, key(), 0.26 + (i % 3) * 0.05, ((i % 5) - 2) * 0.1));
type(START.steps[0]! + 0.4, START.steps[0]! + 0.4 + 11 / 16); // the username: 11 characters at 16 a second (Shot5Start)
for (const [from, to] of [...ISSUE.typing, ...PR.typing]) type(from, to);

// --- the agent answers; replies arrive; closed and merged get a chime
for (const s of [AGENT.connect, ISSUE.reply, PR.reply]) {
  put(s, beep(79), 0.16, 0, 0.5);
  put(s + 0.09, beep(84), 0.16, 0, 0.5);
}
[...ISSUE.comments, PR.review].forEach((s, i) => put(s, beep(76 + (i % 2) * 3), 0.14, 0, 0.5));
for (const s of [ISSUE.close, PR.merge]) {
  put(s, shing(), 0.3, 0, 0.6);
  [72, 76, 79, 84].forEach((m, i) => put(s + i * 0.08, pluck(m, 0.9, 0.5), 0.22, -0.3 + i * 0.2, 0.6));
}

// --- the close: C major held, the star lands
put(SHOTS.close!.start, pad([36, 48, 55, 60, 64, 67, 72], t.DURATION - SHOTS.close!.start, 1700, 0.1), 0.4, 0, 0.6, "pad");
put(SHOTS.close!.start, impact(), 0.4, 0, 0.6);
put(CLOSE.land, thud(), 0.7, 0, 0.3);
put(CLOSE.land + 0.03, shing(), 0.3, 0, 0.7);
[72, 76, 79, 84].forEach((m, i) => put(CLOSE.land + 0.08 + i * 0.09, pluck(m, 0.9, 0.5), 0.2, -0.3 + i * 0.2, 0.6));

const name = variant ? `music-${variant}` : "music";
const { peak } = mix.write(new URL(`./public/${name}.wav`, import.meta.url), {
  // the pad breathes with the pulse
  duck: (s) => (s >= body.from && s < body.to ? 1 - 0.35 * Math.exp(-((s - body.from) % (B * 2)) / 0.15) : 1),
});
console.log(`${name}.wav · ${t.DURATION}s · peak before normalising ${peak.toFixed(2)}`);
