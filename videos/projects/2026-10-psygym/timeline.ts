// The one clock the picture and the music share. No imports: scripts/music.ts reads it too.

export const FPS = 30;
export const BPM = 120;
export const BEAT_SECONDS = 60 / BPM; // 0.5 s
export const BEAT = BEAT_SECONDS * FPS; // 15 frames
export const BAR = BEAT * 4; // 60 frames
export const DURATION = 48; // seconds

/** Where each shot starts, in seconds (PLAN.md). */
export const CUES = {
  hook: 0,
  pitch: 3,
  email: 10,
  why: 15, // the name, the two pains, the two answers — one shot
  plan: 26, // the answers turn into frames on the design canvas
  road: 32,
  recruit: 40,
  end: 44,
  out: DURATION,
} as const;

/** Shot 1: the pitch lands, its date stamp, the line to where it is going. */
export const HOOK = { note: 0, stamp: 0.5, line: 1.5, goal: 2 } as const;

/** Typed lines: one key every `every` frames from `at` seconds. chars = the line's length in copy.ts. */
export const TYPING = {
  pitch: { at: CUES.pitch + 0.5, chars: 21, every: 2 }, // copy.pitch.message
} as const;

/** Shot 2: the pitch is sent, then three parts of it tick. */
export const PITCH = {
  send: CUES.pitch + 2,
  ticks: [CUES.pitch + 3, CUES.pitch + 4, CUES.pitch + 5],
} as const;

/** Shot 3: the email slides in, its lines appear, the stamp lands. */
export const EMAIL = { arrive: CUES.email, stamp: CUES.email + 3 } as const;

/**
 * Shot 4: the new name slams in; two pains, each a little scene on ink; then on white the two
 * answers slam in, each with a tiny demo inside.
 */
export const WHY = {
  name: CUES.why + 0.5,
  painA: CUES.why + 1.5, // no one to practise with: the empty chair, the clock
  painB: CUES.why + 4, // supervision: the queue, the price tag
  solve: CUES.why + 6.5,
  cards: [CUES.why + 7, CUES.why + 8.75],
} as const;

/** Shot 5: the two answer cards morph into two frames, then the camera pulls back over the canvas. */
export const PLAN = { morph: 0.5, zoomFrom: 0.85, zoomTo: 4 } as const; // seconds into the shot


/** Shot 6: the road's four stops light up one a beat, then the first version's scope, then the launch. */
export const ROAD = {
  stops: [0.5, 1.5, 2.5, 3.5].map((o) => CUES.road + o),
  scope: CUES.road + 5,
  launch: CUES.road + 6.5,
} as const;

/** Shot 7: who we're looking for, one card a half beat, then the way in. */
export const RECRUIT = { cards: [0.5, 1, 1.5, 2].map((o) => CUES.recruit + o), cta: CUES.recruit + 2.75 } as const;

/** Shot 8: the two marks; three robots hammer at the logo-in-progress, each once a beat, staggered. */
export const END = { marks: CUES.end + 0.5, robots: 3, firstHit: CUES.end + 0.5, stagger: BEAT_SECONDS / 3 } as const;

/** The seconds at which robot `k`'s hammer lands. */
export function hammerTimes(k: number) {
  const out: number[] = [];
  for (let t = END.firstHit + k * END.stagger; t < DURATION - 0.4; t += BEAT_SECONDS) out.push(t);
  return out;
}

/** Hard cuts, each with a swish and a snap in the music. */
export const CUTS = [CUES.pitch, CUES.email, CUES.why, CUES.why + 1.5, CUES.why + 4, CUES.why + 6.5, CUES.road, CUES.recruit, CUES.end] as const;

export function keyTimes(t: { at: number; chars: number; every: number }) {
  return Array.from({ length: t.chars }, (_, i) => t.at + (i * t.every) / FPS);
}
