// The soundtrack, synthesised from the same clock as the picture (timeline.ts), so every cut,
// landing note and wipe has its sound on the exact frame. Instruments: kit/audio/synth.ts.
//
//   node music.ts [zh|en]   → public/music.wav, public/music-en.wav (pnpm video … music runs both)
//
// The two languages share everything but the typed keys: the lines differ in length.
//
// 120 BPM, A minor (Am F C G, one chord a bar). The hook is sparse: a pluck on every note that
// lands, a whoosh for the panel, a riser into the drop at 3 s. Drums from the drop to the
// breakdown, building at each shot; one held C chord under the call to action.

import {
  Mix,
  bass,
  beep,
  clap,
  hat,
  impact,
  key,
  kick,
  pad,
  patter,
  pluck,
  rand,
  shing,
  snap,
  sweep,
  thud,
  tock,
  whir,
  each,
} from "../../kit/audio/synth.ts";
import { BEAT_SECONDS, CUES, CUTS, DURATION, FPS, HOOK_NOTES, PITCH, ROBOTS, STAR_LANDINGS, TEAM, TYPING, keyTimes } from "./timeline.ts";

const lang = (process.argv[2] ?? "zh") as keyof typeof TYPING;
const mix = new Mix(DURATION);
const put = mix.put;

// --- arrangement -----------------------------------------------------------------------------

const B = BEAT_SECONDS; // 0.5 s
const BAR = 4 * B; // 2 s
// Am F C G: bass root, pad voicing, arp tones.
const CHORDS = [
  { root: 33, pad: [57, 60, 64], arp: [69, 72, 76, 72] },
  { root: 29, pad: [57, 60, 65], arp: [65, 69, 72, 69] },
  { root: 36, pad: [55, 60, 64], arp: [67, 72, 76, 72] },
  { root: 31, pad: [55, 59, 62], arp: [67, 71, 74, 71] },
];
const chordAt = (t: number) => CHORDS[Math.floor(t / BAR) % 4]!;

const K = kick(), H = hat(), HO = hat(true), C = clap(), T = tock(), I = impact();

// Hook, 0–3 s. Every note that lands gets a tock and a rising A-minor pluck.
const hookNotes = [57, 60, 64, 69, 72, 76, 81, 84];
for (let i = 0; i < HOOK_NOTES; i++) {
  const t = i * (B / 2);
  put(t, T, 0.8, -0.3 + 0.6 * ((i * 0.37) % 1));
  put(t, pluck(hookNotes[i]!, 0.9, 0.7), 0.5, (i % 2 ? 0.25 : -0.25), 0.35);
}
put(CUES.hookPanel - 0.12, sweep(0.5, 300, 2600, (x) => Math.sin(Math.PI * x) ** 2), 0.5, 0, 0.2); // panel whoosh
put(CUES.hookPanel, pad([45, 57, 60, 64], CUES.intro - CUES.hookPanel, 700, 0.4), 0.22, 0, 0.3, "pad");
put(CUES.hookGrey, sweep(CUES.intro - CUES.hookGrey, 400, 7000, (x) => x ** 2.2), 0.55, 0, 0.1); // riser into the drop

// Sections from the drop to the breakdown.
const DROP = CUES.intro, BREAK = CUES.next;
for (const [t, g] of [[CUES.intro, 1], [CUES.pitch, 0.8], [CUES.team, 0.9], [CUES.real, 0.8]] as const) put(t, I, 0.75 * g, 0, 0.5);

each(DROP, BREAK, B, (t) => put(t, K, 0.95));
each(CUES.pitch, BREAK, B, (t) => put(t + B / 2, H, 0.28, 0.35)); // off-beat hats
each(CUES.team, BREAK, B / 2, (t, i) => i % 2 && put(t + B / 4, H, 0.1, -0.35)); // ghost 16ths
each(CUES.team, BREAK, BAR, (t) => [B, 3 * B].forEach((o) => put(t + o, C, 0.42, 0, 0.25)));
each(CUES.real, BREAK, BAR, (t) => put(t + 3.5 * B, HO, 0.16, 0.4, 0.2));

// Bass: driving eighths, root then octave.
each(DROP, BREAK, B / 2, (t, i) => put(t, bass(chordAt(t).root + (i % 2 ? 12 : 0), B / 2 - 0.01), 0.42));

// Pads under the whole body, ducked by the kick.
each(DROP, CUES.cta, BAR, (t) => {
  const len = Math.min(BAR, CUES.cta - t) + 0.3;
  put(t, pad(chordAt(t).pad, len, t < CUES.pitch ? 1100 : 1700), 0.22, -0.6, 0.35, "pad");
  put(t, pad(chordAt(t).pad.map((m) => m + 12), len, 1300), 0.1, 0.6, 0.35, "pad");
});

// Arp: 16ths from the pitch shot, louder for "real", eighths in the breakdown.
each(CUES.pitch, BREAK, B / 2, (t, i) => {
  const gain = t < CUES.real ? 0.13 : 0.18;
  put(t, pluck(chordAt(t).arp[i % 4]!, 0.45, 0.5), gain, i % 2 ? 0.45 : -0.45, 0.3);
});
each(BREAK, CUES.cta, B, (t, i) => put(t, pluck(chordAt(t).arp[i % 4]! + 12, 0.8, 0.4), 0.32, i % 2 ? 0.5 : -0.5, 0.5));
put(BREAK - 1, sweep(1, 3000, 400, (x) => (1 - x) ** 2), 0.3, 0, 0.3); // down-sweep into the break
put(CUES.cta - 1, sweep(1, 500, 6000, (x) => x ** 2.5), 0.35, 0, 0.1); // riser into the CTA

// The call to action: one held C (add 9), strummed, with a boom.
put(CUES.cta, I, 0.6, 0, 0.6);
put(CUES.cta, pad([36, 48, 55, 60, 64, 67, 74], DURATION - CUES.cta, 1600, 0.05), 0.6, 0, 0.5, "pad");
[60, 64, 67, 72, 76].forEach((m, i) => put(CUES.cta + i * 0.045, pluck(m, 2.5, 0.45), 0.35, -0.4 + i * 0.2, 0.6));
put(CUES.cta, bass(24, DURATION - CUES.cta - 0.2), 0.5);

// Sound design on the picture's events (timeline.ts).
const SNAP = snap();
for (const t of CUTS) {
  put(t - 0.14, sweep(0.14, 900, 6000, (x) => x ** 3), 0.28, 0, 0.05); // a quick swish into the cut
  put(t, SNAP, 0.55, 0, 0.08);
}
// A click per key; when two keys land in one frame, click every other one.
for (const spec of [TYPING[lang].pitchChat, TYPING[lang].nextLead]) {
  keyTimes(spec).forEach((t, i) => (spec.every >= 1 || i % 2 === 0) && put(t, key(), 0.5, (rand() - 0.5) * 0.3, 0.05));
}
put(PITCH.send - 0.1, sweep(0.12, 600, 4000, (x) => x ** 2), 0.3, 0.2, 0.1); // message sent
put(PITCH.send, pluck(84, 0.4, 0.6), 0.3, 0.2, 0.3);
put(PITCH.reply, pluck(79, 0.5, 0.5), 0.3, -0.2, 0.3); // the assistant answers
PITCH.ticks.forEach((t, i) => {
  put(t, T, 0.6, 0.3); // a part of the pitch ticks
  put(t, pluck([84, 88, 91, 93, 96][i]!, 0.7, 0.6), 0.32, 0.3, 0.4);
});
TEAM.roles.forEach((t, i) => put(t, pluck([72, 74, 76, 79, 81, 84][i]!, 0.5, 0.6), 0.3, i % 2 ? 0.3 : -0.3, 0.3)); // the roles light up
// "当然，" … "还有" …: a muted hit on each word, the second one higher.
TEAM.aside.forEach((t, i) => {
  put(t, K, 0.8);
  put(t, pluck(i ? 64 : 57, 0.5, 0.3), 0.35, 0, 0.3);
});
TEAM.crew.forEach((t, i) => {
  // Each of the people you build with slams in: a boom, a clap, a bright stab.
  const headliner = i === TEAM.crew.length - 1;
  put(t, I, headliner ? 1 : 0.55, 0, 0.3);
  put(t, C, 0.5, 0, 0.3);
  [69, 72, 76].forEach((m) => put(t, pluck(m + [0, 2, 5, 0][i]!, 0.9, 0.7), 0.22, 0, 0.4));
  if (headliner) {
    // The Agent: a riser on the held beat, then a double boom, a low A and a wide chord.
    put(t - 0.45, sweep(0.45, 400, 8000, (x) => x ** 2.5), 0.5, 0, 0.1);
    put(t, K, 1);
    put(t + 0.08, I, 0.6, 0, 0.4);
    put(t, thud(), 0.8, 0, 0.2);
    put(t, bass(33, 1.2), 0.5);
    [57, 64, 69, 72, 76, 81].forEach((m, j) => put(t + j * 0.015, pluck(m, 1.6, 0.6), 0.22, -0.5 + j * 0.2, 0.6));
  }
});
[60, 64, 67, 72].forEach((m, i) => put(TEAM.close + i * 0.04, pluck(m, 1.2, 0.5), 0.2, -0.3 + i * 0.2, 0.5)); // the closing line
const THUD = thud(), SHING = shing();
for (const t of STAR_LANDINGS) {
  put(t, THUD, 0.7, 0, 0.2);
  put(t + 0.03, SHING, 0.3, 0, 0.6);
}

// The robot parade: a whir as it starts, a beep for each robot, feet pattering while they run.
put(ROBOTS[0]!.enter - 0.05, whir(0.6), 0.3, 0, 0.15);
for (const r of ROBOTS) {
  const pan = r.dir === 1 ? -0.6 : 0.6;
  put(r.enter, beep(r.pitch), r.size > 200 ? 0.3 : 0.15, pan, 0.2);
  const crossing = (1080 + r.size) / r.speed / FPS; // seconds on screen
  for (let t = 0; t < crossing; t += r.size > 200 ? 0.11 : 0.07) {
    put(r.enter + t, patter(), r.size > 200 ? 0.2 : 0.07, pan * (1 - (2 * t) / crossing));
  }
}

// --- mix -------------------------------------------------------------------------------------

// Sidechain: the pads dip on every kick while the drums play.
const file = lang === "zh" ? "music.wav" : `music-${lang}.wav`;
const { peak } = mix.write(new URL(`./public/${file}`, import.meta.url), {
  duck: (t) => (t >= DROP && t < BREAK ? 1 - 0.6 * Math.exp(-((t - DROP) % B) / 0.09) : 1),
});
console.log(`${file} · ${DURATION}s · peak before normalising ${peak.toFixed(2)}`);
