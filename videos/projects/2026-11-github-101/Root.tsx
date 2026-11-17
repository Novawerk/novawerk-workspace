import type { ReactNode } from "react";

import { VideoRoot } from "../../kit/root";
import { Cover } from "./Cover";
import type { Lang } from "./narration";
import { Shot6Agent, Shot7Issue, Shot8Pr } from "./shots/Agent";
import { Shot1Hook, Shot2Welcome, Shot3What, Shot4Words, Shot5Start } from "./shots/Intro";
import { Shot10Close, Shot9Habits } from "./shots/Outro";
import { FilmLang, framesOf } from "./shots/parts";
import { FPS, TIMELINES } from "./theme";

// Shots in order. Each shot is also its own composition, so a change re-renders only that shot.
// The voice sets every shot's length, so each language has its own.
const SHOTS = [
  ["Shot1Hook", "hook", Shot1Hook],
  ["Shot2Welcome", "welcome", Shot2Welcome],
  ["Shot3What", "what", Shot3What],
  ["Shot4Words", "words", Shot4Words],
  ["Shot5Start", "start", Shot5Start],
  ["Shot6Agent", "agent", Shot6Agent],
  ["Shot7Issue", "issue", Shot7Issue],
  ["Shot8Pr", "pr", Shot8Pr],
  ["Shot9Habits", "habits", Shot9Habits],
  ["Shot10Close", "close", Shot10Close],
] as const;

function film(lang: Lang) {
  const shots = SHOTS.map(([id, clip, component]) => ({ id, component, frames: framesOf(lang, clip) }));
  const wrap = ({ children }: { children: ReactNode }) => <FilmLang.Provider value={lang}>{children}</FilmLang.Provider>;
  // 小红书 shows the first frame as the thumbnail: open on the pile with its question already up.
  const poster = { shot: "Shot1Hook", frame: Math.round((TIMELINES[lang]!.HOOK.ask - TIMELINES[lang]!.SHOTS.hook!.start) * FPS) + 20 };
  // The voice is in the shots; the music and the sound effects sit under it.
  return <VideoRoot shots={shots} cover={Cover} formats={["3x4"]} variant={lang === "zh" ? undefined : lang} wrap={wrap} poster={poster} musicVolume={0.5} />;
}

export function Root() {
  return (
    <>
      {film("zh")}
      {film("en")}
    </>
  );
}
