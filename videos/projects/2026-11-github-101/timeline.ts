// The one clock the picture, the voice and the music share, one per language. The voice sets it: a
// shot lasts as long as its clip (voice.ts), then runs on to the next beat, so every cut still
// lands on the grid. Runs under plain Node too (music.ts), hence the .ts import.

import { VOICE } from "./voice.ts";
import type { Times } from "./voice.ts";

export const FPS = 30;
export const BPM = 120;
export const BEAT_SECONDS = 60 / BPM; // 0.5 s
export const BEAT = BEAT_SECONDS * FPS; // 15 frames
export const BAR = BEAT * 4;
/** The Nova Star falls for one beat into the lockup, then unfolds. */
export const STAR_FALL = BEAT_SECONDS;

const LEAD = 0.4; // a shot is on screen this long before anyone speaks
const TAIL = 0.5; // after the last word, before the cut (the clip's own trailing silence is cut off)

/** Shot (and its clip, same id), and seconds to hold after the last word. */
const PLAN: readonly (readonly [string, number?])[] = [["hook"], ["welcome"], ["what"], ["words"], ["start"], ["agent"], ["issue"], ["pr"], ["habits"], ["close", 1.4]];
export const SHOT_IDS = PLAN.map(([id]) => id);

const stagger = (t: number, n: number, step = 0.28) => Array.from({ length: n }, (_, i) => +(t + i * step).toFixed(2));

/** Everything timed, in seconds from the start of the film, for one language's voice. */
export function makeTimeline(voice: Record<string, Times>) {
  const SHOTS: Record<string, { start: number; dur: number }> = {};
  const CLIPS: Record<string, number> = {};
  let clock = 0;
  for (const [id, hold = 0] of PLAN) {
    const start = clock;
    CLIPS[id] = +(start + LEAD).toFixed(2);
    clock = Math.ceil((start + LEAD + voice[id]!.dur + TAIL + hold) / BEAT_SECONDS - 1e-6) * BEAT_SECONDS;
    SHOTS[id] = { start, dur: clock - start };
  }

  /** When a phrase starts. */
  const when = (clip: string, line = 0, phrase = 0) => CLIPS[clip]! + voice[clip]!.t[line]![phrase]!;
  /** When a line's last word ends. */
  const lineEnd = (clip: string, line: number) => CLIPS[clip]! + voice[clip]!.end[line]!;
  /** For a line that is typed as it is said: each phrase's [start, end]. */
  const typing = (clip: string, line: number) =>
    voice[clip]!.t[line]!.map((_, k, all) => [when(clip, line, k), (k + 1 < all.length ? when(clip, line, k + 1) : lineEnd(clip, line)) - 0.12] as const);
  /** `n` moments spread between two times. */
  const spread = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => +(from + ((to - from) * i) / Math.max(1, n - 1)).toFixed(2));

  // Every picture event, most of them with a sound. Shots and music.ts read the same numbers.
  return {
    voice,
    SHOTS,
    CLIPS,
    DURATION: clock,
    CUTS: PLAN.slice(1).map(([id]) => SHOTS[id]!.start),
    when,
    lineEnd,
    HOOK: { chats: stagger(when("hook", 0, 0), 3), mails: stagger(when("hook", 0, 1), 2), files: stagger(when("hook", 1, 0), 3, 0.3), ask: when("hook", 1, 1) },
    WELCOME: { number: when("welcome", 0, 0) + 0.6, today: when("welcome", 2, 0) },
    WHAT: { land: when("what", 0, 0), window: when("what", 0, 1), files: when("what", 1, 0), board: when("what", 1, 1), history: when("what", 2, 0) },
    WORDS: { cards: [when("words", 1, 0), when("words", 2, 0), when("words", 3, 0)], gloss: [when("words", 1, 1), when("words", 2, 1), when("words", 3, 1)] },
    START: { steps: [when("start", 0, 1), when("start", 1, 0), when("start", 2, 0)], accept: when("start", 2, 0) + 0.9 },
    AGENT: {
      panel: when("agent", 1, 0),
      names: stagger(when("agent", 1, 1), 2, 0.55),
      swap: when("agent", 2, 0),
      talk: when("agent", 2, 1),
      connect: when("agent", 3, 0),
      connectClick: Math.min(when("agent", 3, 1) + 0.2, lineEnd("agent", 3) - 0.6),
    },
    ISSUE: {
      typing: typing("issue", 1),
      send: lineEnd("issue", 1),
      reply: when("issue", 2, 0) + 0.45,
      tags: when("issue", 2, 1) + 0.3,
      page: when("issue", 3, 0),
      comments: spread(when("issue", 3, 0) + 0.6, when("issue", 3, 1) - 0.3, 3),
      close: when("issue", 3, 1) + 0.55,
    },
    PR: {
      typing: typing("pr", 1),
      files: stagger(when("pr", 1, 1) + 0.25, 2, 0.3),
      send: lineEnd("pr", 1),
      reply: when("pr", 2, 0) + 0.6,
      page: when("pr", 3, 0),
      review: when("pr", 3, 0) + 0.45,
      merge: when("pr", 3, 1) + 0.6,
    },
    HABITS: { notes: [when("habits", 1, 0), when("habits", 2, 0), when("habits", 3, 0)], subs: [when("habits", 2, 1), when("habits", 3, 1)] },
    CLOSE: { land: SHOTS.close!.start + 0.25 + STAR_FALL, line: when("close", 1, 0), bye: when("close", 2, 0) },
  };
}

export type Timeline = ReturnType<typeof makeTimeline>;
export const TIMELINES: Record<string, Timeline> = Object.fromEntries(Object.entries(VOICE).map(([lang, voice]) => [lang, makeTimeline(voice)]));
