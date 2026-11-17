// The soundtrack is the song: this only unpacks it to the file the kit plays.
//
//   pnpm video 2026-11-github-101 music   → public/music.wav (Chinese) and public/music-en.wav
//
// public/song/<lang>.mp3 is a rap made by a music model, voice and beat together (scripts/song.py,
// BRIEF.md). The two mp3s are not in this repository (public/song/NOTICE.md says why and who has
// them). Nothing is mixed on top: an effect on every picture event would fight the beat. The
// picture follows the song instead (voice.ts, timeline.ts).
//
// `pnpm video … render` only makes music.wav when there is none: after replacing a song, run
// `music` (or `all`) first, or the film keeps the old one.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const variant = process.argv[2];
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const out = here(`./public/${variant ? `music-${variant}` : "music"}.wav`);
const song = here(`./public/song/${variant ?? "zh"}.mp3`);
if (!existsSync(song)) {
  console.error(`${song} is missing. The songs are kept outside this repository: see public/song/NOTICE.md.`);
  process.exit(1);
}
// Remotion's own ffmpeg, so nothing else has to be installed
const r = spawnSync("pnpm", ["exec", "remotion", "ffmpeg", "-y", "-loglevel", "error", "-i", song, "-ar", "44100", "-ac", "2", out], { cwd: here("../.."), stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(out);
