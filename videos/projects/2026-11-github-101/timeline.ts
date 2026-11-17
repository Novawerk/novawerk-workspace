// The one clock the picture and the song share, one per language. The song sets it: voice.ts says
// when each phrase is sung and where the beat is, and everything here hangs on those times. A shot
// starts on the last eighth note before its first word, so every cut lands on the song's own grid.
// (The .ts import lets plain Node read this file too.)

import { VOICE } from "./voice.ts";
import type { Song } from "./voice.ts";

export const FPS = 30;
/** The Nova Star falls this long into the lockup, then unfolds. */
export const STAR_FALL = 0.5;

/** Shots in order; each is the segment of lyrics.ts with the same id. */
const PLAN = ["title", "hook", "what", "words", "agent", "habits", "close"] as const;

const frame = (s: number) => Math.round(s * FPS) / FPS;
const stagger = (t: number, n: number, step: number) => Array.from({ length: n }, (_, i) => +(t + i * step).toFixed(2));

/** Everything timed, in seconds from the start of the film, for one language's song. */
export function makeTimeline(song: Song, lang: string) {
  const eighth = 30 / song.bpm;
  /** When a phrase starts. */
  const when = (seg: string, line = 0, phrase = 0) => song.seg[seg]!.t[line]![phrase]!;
  /** When a line's last word ends. */
  const lineEnd = (seg: string, line: number) => song.seg[seg]!.end[line]!;
  /** The last eighth note that leaves a moment before `s`. */
  const cutBefore = (s: number) => frame(song.beat + Math.floor((s - 0.08 - song.beat) / eighth) * eighth);

  const DURATION = frame(song.len);
  const starts = PLAN.map((id, i) => (i === 0 ? 0 : cutBefore(when(id))));
  const SHOTS: Record<string, { start: number; dur: number }> = {};
  PLAN.forEach((id, i) => (SHOTS[id] = { start: starts[i]!, dur: +((starts[i + 1] ?? DURATION) - starts[i]!).toFixed(4) }));

  const zh = lang === "zh";
  // Every picture event waits for its word.
  return {
    song,
    SHOTS,
    DURATION,
    when,
    TITLE: { number: when("title", 0, 1), today: when("title", 0, 1) + eighth * 4 },
    HOOK: {
      chats: stagger(when("hook", 0, 0), 3, 0.45),
      mails: stagger(when("hook", 1, 0), 2, 0.6),
      files: [when("hook", 2, 0), when("hook", 2, 1), when("hook", 2, 2)],
      ask: when("hook", 3, 0),
    },
    WHAT: { land: when("what", 0, 0), window: when("what", 0, 1), files: when("what", 1, 0), board: when("what", 1, 1), history: when("what", 2, 0) },
    WORDS: { cards: [when("words", 1, 0), when("words", 2, 0), when("words", 3, 0)], gloss: [when("words", 1, 1), when("words", 2, 1), when("words", 3, 1)] },
    AGENT: {
      old: when("agent", 0, 1),
      // "say one line to it": the request is typed while that is sung, sent, and the issue is there by the end of the line
      type1: [when("agent", 1, 0), when("agent", 1, 1) - 0.1] as const,
      send1: when("agent", 1, 1),
      issue: Math.max(when("agent", 1, 1) + 0.3, lineEnd("agent", 1) - 0.3),
      type2: [when("agent", 2, 0), when("agent", 2, 1) + 0.25] as const,
      send2: when("agent", 2, 1) + 0.3,
      pr: when("agent", 2, 1) + 0.65,
      page: when("agent", 3, 0) + 0.1,
      // 「合并之前，大家先看一遍」 / "We take a look, then merge it": the two languages say it in a different order
      // (either way the review comes first, and "Merged" stays up for more than a second)
      review: zh ? when("agent", 3, 0) + 0.45 : when("agent", 3, 0) + 0.6,
      merge: zh ? when("agent", 3, 1) + 0.35 : when("agent", 3, 1) + 0.2,
    },
    HABITS: { notes: [when("habits", 0, 0), when("habits", 1, 0)] },
    CLOSE: { land: when("close", 0, 0) + 0.25, number: when("close", 0, 1), line: when("close", 1, 0) },
  };
}

export type Timeline = ReturnType<typeof makeTimeline>;
export const TIMELINES: Record<string, Timeline> = Object.fromEntries(Object.entries(VOICE).map(([lang, song]) => [lang, makeTimeline(song, lang)]));
