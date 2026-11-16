// The one clock the picture and the music share. No imports: music.ts reads it under plain Node.

export const FPS = 30;
export const BPM = 120; // played half-time: the groove feels like 60
export const BEAT_SECONDS = 60 / BPM; // 0.5 s
export const BEAT = BEAT_SECONDS * FPS; // 15 frames
export const BAR = BEAT * 4; // 60 frames

/** The founder's clip (public/founder.mp4): 35.5 s cut from the original at 0.25 s. */
export const CLIP_SECONDS = 35.5;

/** Where each shot starts, in seconds (STORYBOARD.md). */
export const CUES = {
  hook: 0,
  problem: 3,
  client: 8,
  voice: 15,
  supervisor: 25,
  road: 31,
  founder: 38,
  end: 74.5,
} as const;

export const DURATION = 79.5; // seconds

/** Shot 1: the phone rises, two glass chips, the headline. */
export const HOOK = { phone: 0, chips: [0.75, 1.25], caption: 1.75 } as const;

/** Shot 2: the headline, then two glass cards. */
export const PROBLEM = { caption: CUES.problem + 0.1, cards: [CUES.problem + 1.5, CUES.problem + 2.5] } as const;

/** Shot 3: two phones (the case brief behind, the session in front), then two chips. */
export const CLIENT = { back: CUES.client + 0.25, front: CUES.client + 0.5, chips: [CUES.client + 2.5, CUES.client + 3.5] } as const;

/**
 * Shot 3b: one exchange from a voice session (public/voice-call.mp3, 10 s, starts with the shot).
 * Seconds into the shot. `words` is when each word of the English line starts, from speech-to-text
 * over the finished track; a language whose line doesn't split into the same words fills evenly.
 */
export const VOICE = {
  connect: CUES.voice + 0.25,
  counselor: { at: 0.6, end: 3.55, words: [0.66, 1.08, 1.16, 1.32, 1.58, 1.8, 2.32, 2.58, 2.74, 2.98, 3.08, 3.26] },
  client: [
    { at: 5.2, end: 7.6, words: [5.22, 5.86, 6.04, 6.22, 6.44, 6.78, 7.14] },
    { at: 7.82, end: 9.55, words: [7.86, 8.42, 8.7, 8.8, 8.96, 9.18, 9.26] },
  ],
} as const;

/** Shot 4: the report on the phone, two callouts. */
export const SUPERVISOR = { phone: CUES.supervisor + 0.25, callouts: [CUES.supervisor + 1.5, CUES.supervisor + 3] } as const;

/** Shot 5: four stops, one a beat (the last after a pause), the App Store listing, the handover. */
export const ROAD = {
  stops: [0.5, 1, 1.5, 2.5].map((o) => CUES.road + o),
  listing: CUES.road + 3,
  handover: CUES.road + 4.5,
} as const;

/** Shot 6: the clip starts half a second into the shot. Subtitles: seconds into the clip. */
export const FOUNDER = {
  clip: CUES.founder + 0.5,
  lines: [
    [0.15, 5.15],
    [5.85, 13.45],
    [14.05, 16.75],
    [17.25, 23.05],
    [23.75, 31.65],
    [32.25, 35.3],
  ] as const,
} as const;

/** Shot 7: the star falls for one beat into the lockup, then unfolds. */
export const STAR_FALL = BEAT_SECONDS;
export const STAR_LANDINGS = [CUES.end + 0.5 + STAR_FALL] as const;

/** Cuts, each with a soft whoosh in the music. */
export const CUTS = [CUES.problem, CUES.client, CUES.voice, CUES.supervisor, CUES.road, CUES.founder, CUES.end] as const;

/** Every glass chip or card that appears, for a glassy ping each. */
export const PINGS = [
  ...HOOK.chips,
  ...PROBLEM.cards,
  ...CLIENT.chips,
  ...SUPERVISOR.callouts,
  ...ROAD.stops,
] as const;
