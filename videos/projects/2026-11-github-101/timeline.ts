// The one clock the picture, the voice and the music share. The voice sets it: a shot lasts as long
// as its clips (voice.ts), then runs on to the next beat, so every cut still lands on the grid.
// Runs under plain Node too (music.ts), hence the .ts import.

import { VOICE } from "./voice.ts";

export const FPS = 30;
export const BPM = 120;
export const BEAT_SECONDS = 60 / BPM; // 0.5 s
export const BEAT = BEAT_SECONDS * FPS; // 15 frames
export const BAR = BEAT * 4;

const LEAD = 0.4; // a shot is on screen this long before anyone speaks
const GAP = 0.25; // between two clips in one shot
const TAIL = 0.3; // after the last clip, before the cut

/** Shot → its clips (narration.ts ids), and seconds to hold after the last word. */
const PLAN: readonly (readonly [string, readonly string[], number?])[] = [
  ["hook", ["hook"]],
  ["what", ["what1", "what2"]],
  ["words", ["words"]],
  ["start", ["start"]],
  ["issue", ["issue1", "issue2"]],
  ["edit", ["edit1", "edit2", "pr"]],
  ["habits", ["habits"]],
  ["close", ["close"], 1.6],
];

/** Seconds from the start of the film. */
export const SHOTS: Record<string, { start: number; dur: number; clips: readonly string[] }> = {};
export const CLIPS: Record<string, number> = {};
let clock = 0;
for (const [id, clips, hold = 0] of PLAN) {
  const start = clock;
  let t = start + LEAD;
  for (const c of clips) {
    CLIPS[c] = +t.toFixed(2);
    t += VOICE[c]!.len + GAP;
  }
  clock = Math.ceil((t - GAP + TAIL + hold) / BEAT_SECONDS - 1e-6) * BEAT_SECONDS;
  SHOTS[id] = { start, dur: clock - start, clips };
}
export const DURATION = clock;
export const CUTS = PLAN.slice(1).map(([id]) => SHOTS[id]!.start);

/** When a phrase starts, in seconds from the start of the film. */
export const when = (clip: string, line = 0, phrase = 0) => CLIPS[clip]! + VOICE[clip]!.t[line]![phrase]!;
/** When a clip's last word ends. */
export const done = (clip: string) => CLIPS[clip]! + VOICE[clip]!.dur;

// Every picture event that makes a sound, in seconds from the start of the film. Shots and music.ts
// read the same numbers.
const stagger = (t: number, n: number, step = 0.28) => Array.from({ length: n }, (_, i) => +(t + i * step).toFixed(2));

export const HOOK = {
  chats: stagger(when("hook", 0, 0), 3),
  mails: stagger(when("hook", 0, 1), 2),
  files: stagger(when("hook", 1, 0), 3, 0.3),
  ask: when("hook", 1, 1),
};
export const WHAT = {
  gather: when("what1", 0, 0),
  land: when("what1", 1, 1), // "GitHub。"
  window: when("what2", 0, 0),
  files: when("what2", 1, 0),
  board: when("what2", 1, 1),
  history: when("what2", 2, 0),
};
export const WORDS = {
  cards: [when("words", 1, 0), when("words", 2, 0), when("words", 3, 0)],
  gloss: [when("words", 1, 1), when("words", 2, 1), when("words", 3, 1)],
};
export const START = {
  steps: [when("start", 0, 0), when("start", 1, 0), when("start", 2, 0)],
  accept: when("start", 2, 0) + 0.85,
};
export const ISSUE = {
  tab: when("issue1", 0, 1),
  newClick: when("issue1", 1, 0) + 0.55,
  title: when("issue1", 1, 1),
  desc: when("issue1", 2, 0),
  paste: when("issue1", 3, 0) + 0.25,
  createClick: done("issue1") + 0.1,
  comments: [when("issue2", 0, 1), when("issue2", 0, 1) + 0.9, when("issue2", 1, 0) - 0.5],
  close: when("issue2", 1, 1) + 0.3,
};
export const EDIT = {
  pencilClick: when("edit1", 0, 1) + 1.5,
  rewrite: when("edit1", 0, 1) + 1.9,
  commitClick: when("edit1", 1, 0) + 1.5,
  message: when("edit1", 1, 1),
  folder: when("edit2", 0, 0),
  addFile: when("edit2", 0, 1) + 0.35,
  upload: when("edit2", 0, 1) + 0.95,
  drop: stagger(when("edit2", 0, 2) + 0.35, 2, 0.3),
  save: when("pr", 0, 0),
  pick: when("pr", 0, 0) + 1.0,
  createClick: when("pr", 0, 1) + 1.6,
  review: when("pr", 1, 0) + 0.3,
  merge: when("pr", 1, 1) + 0.35,
};
export const HABITS = { notes: [when("habits", 0, 0), when("habits", 1, 0), when("habits", 2, 0)] };
/** The Nova Star falls for one beat into the lockup, then unfolds. */
export const STAR_FALL = BEAT_SECONDS;
export const CLOSE = { land: SHOTS.close!.start + 0.25 + STAR_FALL, line: when("close", 1, 0) };
