// One command for every video project in projects/.
//
//   pnpm video list                              the projects
//   pnpm video new <name>                        a new project from projects/_template
//   pnpm video <project> music                   synthesise public/music.wav (music.ts)
//   pnpm video <project> studio                  open Remotion Studio
//   pnpm video <project> still <composition> [frame]   one frame → out/stills/
//   pnpm video <project> shot <composition>      one shot with its music → out/shots/
//   pnpm video <project> render [3x4 9x16 …]     the film(s) → out/<output>_<format>.mp4
//   pnpm video <project> cover                   the cover → out/cover_3x4.png
//   pnpm video <project> all                     music, every format, cover
//
// Each project has a project.json: { "output": "<file prefix>", "formats": ["3x4", "9x16"],
// "variants": ["en"] }. Compositions follow one naming rule (kit/root.tsx): Main-<format> for the
// film, Cover for the cover, one per shot; a variant adds its name (Main-en-3x4, Cover-en) and its
// own soundtrack (`node music.ts en` → music-en.wav). Files: <output>_<format>.mp4,
// <output>_en_<format>.mp4, cover_3x4.png, cover_en_3x4.png.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const projects = join(root, "projects");
const [first, cmd, ...rest] = process.argv.slice(2);

function run(bin: string, args: string[]) {
  const r = spawnSync(bin, args, { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const remotion = (args: string[]) => run("pnpm", ["exec", "remotion", ...args]);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!first || first === "help" || first === "--help") {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 13).join("\n"));
  process.exit(0);
}

if (first === "list") {
  for (const name of readdirSync(projects).filter((n) => !n.startsWith("_"))) console.log(name);
  process.exit(0);
}

if (first === "new") {
  const name = cmd ?? fail("pnpm video new <name>   e.g. 2026-11-open-day");
  const dest = join(projects, name);
  if (existsSync(dest)) fail(`${relative(root, dest)} already exists`);
  cpSync(join(projects, "_template"), dest, { recursive: true });
  console.log(`Created ${relative(root, dest)}. Next: edit BRIEF.md and copy.ts, then pnpm video ${name} studio`);
  process.exit(0);
}

const dir = join(projects, first);
if (!existsSync(join(dir, "index.ts"))) fail(`No project ${first}. pnpm video list`);
const project = JSON.parse(readFileSync(join(dir, "project.json"), "utf8")) as { output: string; formats: string[]; variants?: string[] };
const variants = ["", ...(project.variants ?? [])]; // "" is the main version
const p = relative(root, dir);
const entry = join(p, "index.ts");
const publicDir = ["--public-dir", join(p, "public")];
const music = () => {
  for (const v of variants) run("node", [join(p, "music.ts"), ...(v ? [v] : [])]);
};
const ensureMusic = () => {
  if (variants.some((v) => !existsSync(join(dir, "public", v ? `music-${v}.wav` : "music.wav")))) music();
};
const tag = (v: string) => (v ? `-${v}` : "");
const film = (f: string) => {
  for (const v of variants) {
    remotion(["render", entry, `Main${tag(v)}-${f}`, join(p, "out", `${project.output}${v ? `_${v}` : ""}_${f}.mp4`), ...publicDir]);
  }
};
const cover = () => {
  for (const v of variants) remotion(["still", entry, `Cover${tag(v)}`, join(p, "out", `cover${v ? `_${v}` : ""}_3x4.png`), ...publicDir]);
};

switch (cmd) {
  case "music":
    music();
    break;
  case "studio":
    ensureMusic();
    remotion(["studio", entry, ...publicDir]);
    break;
  case "still": {
    const [comp, frame = "0"] = rest;
    if (!comp) fail(`pnpm video ${first} still <composition> [frame]`);
    remotion(["still", entry, comp, join(p, "out", "stills", `${comp}-f${frame}.png`), `--frame=${frame}`, ...publicDir]);
    break;
  }
  case "shot": {
    const [comp] = rest;
    if (!comp) fail(`pnpm video ${first} shot <composition>   e.g. Shot1Hook-3x4`);
    ensureMusic();
    remotion(["render", entry, comp, join(p, "out", "shots", `${comp}.mp4`), ...publicDir]);
    break;
  }
  case "render":
    ensureMusic();
    (rest.length ? rest : project.formats).forEach(film);
    break;
  case "cover":
    cover();
    break;
  case "all":
    music();
    project.formats.forEach(film);
    cover();
    break;
  default:
    fail(`Unknown command ${cmd ?? ""}. pnpm video help`);
}
