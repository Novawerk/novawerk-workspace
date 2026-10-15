// The score for this film only (the house track — A minor, Am F C G — was retired here on request).
// 2026-10-15: sketches in lo-fi, indie-electronic and chiptune were tried and dropped with the pixel
// look. The Memphis film gets bright 80s synth-pop in C (C G Am F): four-on-the-floor, octave bass,
// a big snare on 2 and 4, a sidechained supersaw pad, a 16th arpeggio, and an 8-bar lead motif that
// first plays on the twist and returns at the tower. Every event in the picture keeps its sound.
// Runs under plain Node (music.ts): .ts imports, no TypeScript-only syntax.

import { Biquad, SR, bass, beep, buf, clap, each, hat, impact, key, kick, mtof, noise, patter, pluck, rand, shing, snap, sweep, thud, tock, whir } from "../../kit/audio/synth.ts";
import { BEAT_SECONDS as B, CUES, CUTS, D, DURATION, IDEA, TOWER, TRIAL, WHY } from "./timeline.ts";

const BAR = 4 * B;
const fr = (n: number) => n / 30;
// The hook's landmarks, in seconds.
export const H = { slam: fr(D.slam), line1: fr(D.line1), quiet: fr(D.quiet), cut: fr(D.cut) };

// --- extra instruments ---------------------------------------------------------------------------

/** A dusty snare: noise burst through a band-pass with a short body. */
export function snare(dark = false) {
  const s = buf(0.22);
  const bp = new Biquad("bp", dark ? 1700 : 2400, 0.9);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    s[i] = (bp.run(noise()) * 1.4 + Math.sin(2 * Math.PI * 190 * t) * 0.5 * Math.exp(-t * 30)) * Math.exp(-t * (dark ? 18 : 24));
  }
  return s;
}

/** A filtered supersaw chord whose cutoff moves from `c0` to `c1` over its length. */
export function sweepPad(midis: number[], dur: number, c0: number, c1: number, attack = 0.15) {
  const s = buf(dur);
  const voices = midis.flatMap((m) => [-0.12, 0, 0.11].map((d) => ({ f: mtof(m + d), ph: rand() })));
  const lp = new Biquad("lp", c0, 0.8);
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    if (i % 64 === 0) lp.set("lp", c0 + (c1 - c0) * (t / dur), 0.8);
    let x = 0;
    for (const v of voices) {
      v.ph = (v.ph + v.f / SR) % 1;
      x += 2 * v.ph - 1;
    }
    s[i] = (lp.run(x) / voices.length) * Math.min(1, t / attack) * Math.min(1, (dur - t) / 0.2);
  }
  return s;
}

/** A supersaw lead note with a quick pluck on the attack. */
function lead(midi: number, dur: number) {
  const saw = sweepPad([midi], dur, 5200, 3000, 0.004);
  const p = pluck(midi, Math.min(dur, 0.4), 0.9);
  for (let i = 0; i < p.length; i++) saw[i]! += p[i]! * 0.6;
  return saw;
}

// --- sections ------------------------------------------------------------------------------------

type Put = (t: number, s: Float32Array, gain: number, pan?: number, send?: number, bus?: "main" | "pad") => void;

/** The groove sections after the twist (seconds): why is lighter, idea and trial full, tower its own. */
export const SEC = {
  twist: H.cut,
  why: CUES.why,
  idea: CUES.idea,
  trial: CUES.trial,
  tower: CUES.tower,
  endChord: CUES.tower + TOWER.end,
  end: DURATION,
};

/** Musical accents on the captions: [time, scale degree]; the lead plays them. */
export const ACCENTS: readonly (readonly [number, number])[] = [
  [H.line1, 0], [H.line1 + B, 2], [H.line1 + 2 * B, 4],
  [CUES.why + WHY.plan1 + WHY.caption, 2], [CUES.why + WHY.plan2 + WHY.caption, 1],
  [CUES.idea + IDEA.caption, 4], [CUES.idea + IDEA.sub, 2],
  ...TRIAL.steps.map((t, i) => [CUES.trial + t, [0, 1, 2, 4, 7][i]!] as const),
  [CUES.trial + TRIAL.werk, 9], [CUES.trial + TRIAL.thanks, 7],
  [CUES.tower + TOWER.next, 7],
];

// --- the sound effects ---------------------------------------------------------------------------

export function sfx(put: Put) {
  const V = { tock, thud, impact, snap, key, shing, patter, whir, sweep, beep };
  // Hook: the stamp falls and slams (paper crunch), line 1 rises, a riser that stops dead at 3.0 s,
  // half a beat of silence, the boom on 3.5 s, a tock per task dropping onto the board.
  put(0, V.sweep(H.slam, 2500, 300, (x) => x), 0.4, 0, 0.1);
  put(H.slam, V.thud(), 1.2, 0, 0.2);
  put(H.slam, V.impact(1.2), 0.8, 0, 0.3);
  put(H.slam, V.tock(), 0.9);
  each(H.slam, H.slam + 0.2, 0.03, (t) => put(t, V.snap(), 0.18, Math.sin(t * 50) * 0.8));
  put(H.line1, V.tock(), 0.6);
  put(H.quiet - 1, V.sweep(1, 200, 8000, (x) => x ** 2.6), 0.5);
  put(H.cut, V.impact(), 1, 0, 0.5);
  put(H.cut, V.snap(), 0.7);
  put(H.cut + 0.03, V.shing(), 0.4, 0, 0.6);
  for (let i = 0; i < 8; i++) put(H.cut + fr(8 + i * 3), V.tock(), 0.3, -0.6 + i * 0.17);
  // Why: a tock as each note lands, a scratch as it is struck through; the calendar fills.
  [WHY.plan1, WHY.plan2].forEach((p) => {
    const o = CUES.why + p;
    put(o + WHY.land, V.tock(), 0.8);
    put(o + WHY.strike, V.sweep(0.27, 6000, 1500, (x) => x), 0.5, 0, 0.05);
    put(o + WHY.strike + 0.27, V.snap(), 0.6);
  });
  for (let i = 0; i < 35; i++) put(CUES.why + WHY.plan2 + WHY.land + fr(4 + (i % 7) * 0.6 + Math.floor(i / 7) * 0.9), V.tock(), 0.12, ((i % 7) - 3) / 4);
  // Idea: the struck notes swish off; a tock as each of the 18 cards lands.
  put(CUES.idea + IDEA.sweep, V.sweep(0.45, 800, 5000, (x) => x), 0.35, 0, 0.1);
  for (let i = 0; i < 18; i++) put(CUES.idea + IDEA.fly + i * IDEA.flyStep + 0.3, V.tock(), 0.35, -0.7 + (i % 5) * 0.35);
  // Trial run.
  const o = CUES.trial;
  put(o + 0.2, V.whir(0.4), 0.25);
  put(o + 0.73, V.tock(), 0.5);
  for (let i = 0; i < 5; i++) put(o + TRIAL.tasks + 0.5 + i * TRIAL.taskStep, V.tock(), 0.75, -0.4 + i * 0.2);
  TRIAL.steps.forEach((t) => put(o + t, V.tock(), 0.6));
  each(o + TRIAL.typing, o + TRIAL.typing + 11 / 30, 1 / 30, (t) => put(t, V.key(), 0.45, Math.sin(t * 13) * 0.3));
  put(o + TRIAL.steps[4]! - 0.6, V.sweep(0.6, 300, 6000, (x) => x ** 2), 0.35, 0, 0.1);
  put(o + TRIAL.steps[4]!, V.thud(), 0.8, 0, 0.2);
  put(o + TRIAL.werk, V.shing(), 0.45, 0, 0.6);
  [0.1, 0.4, 0.7].forEach((t, i) => put(o + TRIAL.agent + t + 0.2, V.beep(76 + i * 3), 0.35, i % 2 ? 0.5 : -0.5));
  each(o + TRIAL.agent + 0.2, CUES.tower, 0.09, (t, i) => put(t, V.patter(), 0.22, (i % 3) - 1));
  put(o + TRIAL.agent + 0.9, V.thud(), 0.9, 0, 0.2);
  put(o + TRIAL.agent + 0.9, V.impact(0.8), 0.5, 0, 0.3);
  // Tower: the blink of the star, the long fall, the landing on NW-3, a pop per pixel person.
  const w = CUES.tower;
  [81, 88].forEach((m, i) => put(w + i * 0.15, V.beep(m), 0.35, 0, 0.3));
  put(w + TOWER.dropFrom, V.sweep(TOWER.land - TOWER.dropFrom, 5000, 120, (x) => x ** 0.6), 0.55, 0, 0.1);
  put(w + TOWER.land, V.thud(), 1.1, 0, 0.3);
  put(w + TOWER.land, V.impact(1.2), 0.7, 0, 0.4);
  put(w + TOWER.land + 0.02, V.beep(52), 0.5);
  put(w + TOWER.land + 0.1, V.shing(), 0.4, 0, 0.6);
  for (let i = 0; i < 6; i++) put(w + TOWER.land + fr(4 + i * 3), V.beep(72 + (i % 3) * 5), 0.22, -0.6 + i * 0.24);
  [TOWER.first, TOWER.nw3, TOWER.next].forEach((t) => put(w + t, V.tock(), 0.6));
  put(w + TOWER.end, V.shing(), 0.45, 0, 0.7);
  for (const t of CUTS) put(t, V.snap(), 0.45, 0, 0.08);
}

// --- the music -----------------------------------------------------------------------------------

/** The lead motif, 8 bars of eighths over C G Am F (scale degrees in C major, -1 = rest). */
const MOTIF = [
  4, -1, 4, 5, 7, -1, 4, -1, /**/ 6, -1, 5, 4, 5, -1, -1, -1, /**/ 2, -1, 2, 4, 7, -1, 5, 4, /**/ 5, -1, -1, 3, 5, -1, -1, -1,
  4, -1, 4, 5, 7, -1, 9, -1, /**/ 8, -1, 7, 6, 7, -1, 4, -1, /**/ 9, -1, 9, 8, 7, -1, 5, -1, /**/ 7, -1, 5, -1, 7, -1, -1, -1,
];
const deg = (d: number) => 72 + [0, 2, 4, 5, 7, 9, 11][d % 7]! + 12 * Math.floor(d / 7);

/** Bright 80s synth-pop; returns the sidechain for the pad bus. */
export function pop(put: Put): (t: number) => number {
  const chords = [[48, 52, 55, 60], [43, 47, 50, 55], [45, 48, 52, 57], [41, 45, 48, 53]]; // C G Am F
  // Intro: a filtered pad swells under the stamp and stops before the half beat of silence.
  put(H.slam, sweepPad(chords[0]!, H.quiet - H.slam - 0.05, 400, 2600, 0.5), 0.32, 0, 0.3, "pad");
  each(SEC.twist, SEC.end, BAR, (t, i) => {
    const c = chords[i % 4]!;
    const last = t >= SEC.endChord;
    put(t, sweepPad(c, last ? SEC.end - t : BAR, 2200, last ? 900 : 3600, 0.02), 0.4, 0, 0.35, "pad");
    if (last) {
      put(t, kick(), 0.9);
      put(t, bass(c[0]! - 12, SEC.end - t), 0.5);
      return;
    }
    const light = t >= SEC.why && t < SEC.idea; // under the why: kick, bass and pad only
    // Octave bass on the eighths.
    each(t, t + BAR - 1e-6, B / 2, (u, k) => put(u, bass(c[0]! - (k % 2 ? 0 : 12), B / 2 * 0.85), light ? 0.35 : 0.45));
    each(t, t + BAR - 1e-6, B, (u) => put(u, kick(), light ? 0.6 : 0.9));
    if (!light) {
      // The big 80s snare: snare and clap together, with a long send.
      [t + B, t + 3 * B].forEach((u) => {
        put(u, snare(), 0.55, 0, 0.45);
        put(u, clap(), 0.35, 0, 0.45);
      });
      each(t, t + BAR - 1e-6, B / 4, (u, k) => put(u, hat(k % 4 === 2), k % 2 ? 0.07 : 0.11, 0.3));
      each(t, t + BAR - 1e-6, B / 4, (u, k) => put(u, pluck(c[1 + (k % 3)]! + 24, 0.2, 0.9), 0.1, k % 2 ? 0.45 : -0.45, 0.2));
    }
  });
  const playMotif = (from: number, bars: number, gain: number) =>
    each(from, from + bars * BAR - 1e-6, B / 2, (u, k) => {
      const d = MOTIF[k % 64]!;
      if (d >= 0) put(u, lead(deg(d), B / 2 * 0.95), gain, 0.1, 0.3);
    });
  // The motif: its first half on the twist, quieter under the idea and the trial run, its first half
  // again when the camera lands on the tower.
  playMotif(SEC.twist, 2, 0.3);
  playMotif(SEC.idea, 2, 0.17);
  playMotif(SEC.trial, 7.5, 0.15);
  playMotif(SEC.tower + TOWER.land, 4, 0.3);
  ACCENTS.forEach(([t, d]) => put(t, pluck(deg(d) + 12, 0.4, 0.9), 0.22, -0.3, 0.3));
  // Sidechain: the pad dips on every beat after the twist.
  return (t) => (t >= SEC.twist ? 1 - 0.65 * Math.exp(-((t - SEC.twist) % B) / 0.12) : 1);
}
