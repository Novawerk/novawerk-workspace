import { Easing } from "remotion";

// Website palette (apps/web/app/globals.css) — videos/BRAND.md.
export const color = {
  paper: "#ffffff",
  ink: "#0f0f0f",
  muted: "#5c5c5c",
  line: "#e3e3e3",
  lineStrong: "#bdbdbd",
  subtle: "#f6f6f5",
  accent: "#1f7a4a",
  accentDeep: "#0a3920",
  // The post cards' green on ink (packages/promo/src/cards/templates.ts). Only on ink.
  signal: "#38e07b",
} as const;

// Every Novawerk video runs at 30 fps. A project's timeline.ts has its own beat grid and cues.
export const FPS = 30;

export const sec = (s: number) => Math.round(s * FPS);

// The safe area every shot lays out in: 3:4, centred in the 9:16 version.
export const SAFE = { width: 1080, height: 1440 } as const;

export const type = {
  caption: { fontSize: 96, fontWeight: 900, lineHeight: 1.18, letterSpacing: -1 },
  sub: { fontSize: 48, fontWeight: 500, lineHeight: 1.35 },
} as const;

export const ease = {
  ui: Easing.bezier(0.2, 0.8, 0.2, 1), // 220 ms fades
  spring: Easing.bezier(0.34, 1.56, 0.64, 1), // accent word landing
} as const;

export const ms = (n: number) => Math.round((n / 1000) * FPS);
