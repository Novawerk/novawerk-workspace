// The one clock the picture and the music share. No imports: music.ts reads it under plain Node.

export const FPS = 30;
export const BPM = 120;
export const BEAT_SECONDS = 60 / BPM; // 0.5 s
export const BEAT = BEAT_SECONDS * FPS; // 15 frames
export const BAR = BEAT * 4; // 60 frames
export const DURATION = 41; // seconds

/** Where each shot starts, in seconds (videos/STORYBOARD.md). */
export const CUES = {
  hook: 0,
  hookPanel: 1, // the ink panel wipes up
  hookGrey: 2, // the notes go grey
  intro: 3,
  pitch: 8,
  team: 15,
  real: 25,
  next: 34,
  cta: 37.5,
  end: DURATION,
} as const;

/** The notes in the hook land on every half beat (0, 0.25, 0.5 … s). */
export const HOOK_NOTES = 8;

/** Hard cuts, each with a snap in the music. */
export const CUTS = [CUES.intro, CUES.pitch, CUES.team, CUES.real, CUES.real + 4, CUES.next, CUES.cta] as const;

/** The Nova Star falls for one beat, lands, then its four points unfold. */
export const STAR_FALL = BEAT_SECONDS;
export const STAR_LANDINGS = [CUES.intro + STAR_FALL, CUES.cta + STAR_FALL] as const;

/**
 * Typed lines, per language: one key every `every` frames (0.5 = two keys a frame) from `at`
 * seconds. `chars` is the length of the line in copy.ts, kept here so music.ts can click each key.
 */
export const TYPING = {
  zh: {
    pitchChat: { at: CUES.pitch + 0.5, chars: 28, every: 1 }, // copy.pitch.message
    nextLead: { at: CUES.next, chars: 10, every: 2 }, // copy.next.lead
  },
  en: {
    pitchChat: { at: CUES.pitch + 0.5, chars: 51, every: 0.5 },
    nextLead: { at: CUES.next, chars: 28, every: 1 },
  },
} as const;

/** Shot 3: the message is sent, the assistant answers, the pitch comes forward, five parts tick. */
export const PITCH = {
  send: CUES.pitch + 1.5,
  reply: CUES.pitch + 2,
  focus: CUES.pitch + 2.5,
  ticks: [3, 3.5, 4, 4.5, 5].map((o) => CUES.pitch + o),
} as const;

/**
 * Shot 4, one scene: the question; at +1.5 s the people you build with, one slam every 1.5 beats;
 * then the roles of everyone else light up on half beats; "当然，" … "还有" … and the Agent lands
 * last and loudest; the closing line.
 */
export const TEAM = {
  crewCaption: CUES.team + 1.5,
  crew: [2, 2.75, 3.5, 6.75].map((o) => CUES.team + o), // the Agent last
  roles: [4, 4.25, 4.5, 4.75, 5, 5.25].map((o) => CUES.team + o),
  aside: [5.75, 6.25].map((o) => CUES.team + o),
  close: CUES.team + 8,
} as const;

/** The seconds at which each key of a typed line lands. */
export function keyTimes(t: { at: number; chars: number; every: number }) {
  return Array.from({ length: t.chars }, (_, i) => t.at + (i * t.every) / FPS);
}

/**
 * A parade of little robots runs across the screen when the Agent card lands (shot 4). Each one
 * enters at `enter` seconds, in a lane, at a speed; the music beeps on every entrance and
 * patters their feet while they run.
 */
export const ROBOTS = (() => {
  const at = TEAM.crew[3]! + 0.4; // let the Agent card be read first
  return Array.from({ length: 24 }, (_, i) => {
    const r = (n: number) => ((Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1 + 1) % 1; // stable pseudo-random
    const near = i % 5 === 2; // a few big, fast ones close to the lens
    return {
      enter: at + i * 0.08,
      lane: near ? 0.38 + r(2) * 0.12 : 0.06 + r(3) * 0.16, // 0 = top of the safe area, 1 = bottom; clear of the Agent card
      size: near ? 240 + r(4) * 60 : 95 + r(5) * 60,
      speed: near ? 95 : 32 + r(6) * 26, // px per frame
      dir: (i % 3 === 1 ? -1 : 1) as 1 | -1,
      carry: (["box", "gear", "none", "note"] as const)[i % 4]!,
      pitch: 72 + Math.round(r(7) * 14),
    };
  });
})();
