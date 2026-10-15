// The one clock the picture and the music share. No imports: music.ts reads it under plain Node.

export const FPS = 30;
export const BPM = 120;
export const BEAT_SECONDS = 60 / BPM; // 0.5 s
export const BEAT = BEAT_SECONDS * FPS; // 15 frames
export const BAR = BEAT * 4; // 60 frames
export const DURATION = 40.5; // seconds

/** Where each shot starts, in seconds (STORYBOARD.md). */
export const CUES = {
  hook: 0,
  why: 6, // 方案一 (6–8.5 s), 方案二 (8.5–10.5 s), each struck through
  idea: 10.5,
  trial: 14.5,
  tower: 29.5,
  end: DURATION,
} as const;

/** Hook D · beats of 3, 3, 1 and 5 (frames into the shot). */
export const D = {
  slam: 8, // the stamp is in the air on frame 0 and hits here; then the frame holds still
  line1: 45, // 1.5 s: 我们不再接受成员申请了, held
  quiet: 90, // 3.0 s: half a beat of silence
  cut: 105, // 3.5 s: flash into the board, 因为，你已经是了。 held to 6.0 s
} as const;

/** Why (seconds into the shot): two options, each struck through (2.5 s and 2 s: line 1 is longer). */
export const WHY = {
  plan1: 0,
  plan2: 2.5,
  land: 0.1, // the note lands
  caption: 0.3,
  strike: 0.9, // the line is drawn through
} as const;

/** Idea (seconds into the shot): the board sorts itself into its areas. */
export const IDEA = {
  sweep: 0, // the two struck-out notes fly off
  caption: 0.35,
  fly: 0.5, // cards start flying to their columns, one every FLY_STEP
  flyStep: 0.07,
  sub: 2.0,
} as const;

/** Trial run on our own site (seconds into the shot). */
export const TRIAL = {
  site: 0, // /contribute hero
  tasks: 3, // the board: five real tasks drop in on the beat
  taskStep: 0.5,
  flow: 7, // the steps light up
  steps: [7.5, 8.0, 8.5, 9.0, 10.5], // ① sign in ② plan ③ picked ④ PR (typing) ⑤ merged
  typing: 9.1, // "Task: NW-11" typed from here, one character per frame
  werk: 10.8, // +8 Werk pops
  thanks: 11.5,
  agent: 13, // robots run through with a plan waiting for you
} as const;

/** The tower (seconds into the shot). */
export const TOWER = {
  dropFrom: 0.2,
  land: 2.0, // the camera lands on NW-3
  first: 2.5, // caption: every merged task is a block
  nw3: 4.5, // the first block: NW-3
  next: 6.5, // the next one can be yours
  end: 8.5, // Novawerk 任务板 · 代码开源 · MIT
} as const;

/** Hard cuts, each with a snap in the music. */
export const CUTS = [CUES.why, CUES.why + WHY.plan2, CUES.idea, CUES.trial, CUES.trial + TRIAL.tasks, CUES.trial + TRIAL.flow, CUES.trial + TRIAL.agent, CUES.tower] as const;
